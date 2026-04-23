import { useMemo, useState, useRef, useEffect, forwardRef } from 'react'
import { ChevronDown, Check, Search } from 'lucide-react'
import {
    ISO2_CODES,
    getCountryByISO2,
    searchCountry,
    utils,
    type ISO2,
} from 'country-atlas'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * Render a country flag SVG at a fixed box size as an <img> (base-64 data URL).
 * Uses country-atlas flag.svg + its built-in data-URL utility.
 */
function FlagImg({ iso2, size = 18, className }: { iso2: string; size?: number; className?: string }) {
    const country = useMemo(() => getCountryByISO2(iso2 as ISO2), [iso2])
    const src = useMemo(() => {
        if (!country?.flag?.svg) return ''
        try {
            return utils.svgToDataUrl(country.flag.svg)
        } catch {
            return ''
        }
    }, [country])
    if (!src) return <span className="text-sm leading-none">{country?.flag.emoji ?? '🏳️'}</span>
    return (
        <img
            src={src}
            width={size}
            height={Math.round(size * 0.75)}
            alt={`${country?.name ?? iso2} flag`}
            loading="lazy"
            className={cn('rounded-sm object-cover shrink-0 ring-1 ring-border/60', className)}
            style={{ width: size, height: Math.round(size * 0.75) }}
        />
    )
}

interface CountryOption {
    iso2: string
    name: string
    callingCode: string
}

const ALL_COUNTRIES: CountryOption[] = (ISO2_CODES as readonly string[])
    .map((code) => {
        const c = getCountryByISO2(code as ISO2)
        if (!c) return null
        const callingCode = (c as unknown as { callingCode?: string }).callingCode ?? ''
        return { iso2: code, name: c.name, callingCode }
    })
    .filter((c): c is CountryOption => !!c && !!c.callingCode)

// Sort: UAE first (this is a UAE HR platform), then alphabetical.
ALL_COUNTRIES.sort((a, b) => {
    if (a.iso2 === 'AE') return -1
    if (b.iso2 === 'AE') return 1
    return a.name.localeCompare(b.name)
})

/** Try to resolve an existing nationality/country free-text value to an ISO-2 code. */
export function resolveCountryIso(name: string | undefined | null): string | undefined {
    if (!name) return undefined
    const trimmed = name.trim()
    if (!trimmed) return undefined
    // Exact ISO match
    if (trimmed.length === 2) {
        const hit = ALL_COUNTRIES.find((c) => c.iso2.toLowerCase() === trimmed.toLowerCase())
        if (hit) return hit.iso2
    }
    const lower = trimmed.toLowerCase()
    // Exact country name
    const exact = ALL_COUNTRIES.find((c) => c.name.toLowerCase() === lower)
    if (exact) return exact.iso2
    // Common demonym → ISO mapping for UAE-relevant nationalities.
    const demonyms: Record<string, string> = {
        emirati: 'AE', emirian: 'AE',
        indian: 'IN', pakistani: 'PK', bangladeshi: 'BD', filipino: 'PH',
        british: 'GB', english: 'GB', american: 'US', canadian: 'CA',
        egyptian: 'EG', jordanian: 'JO', lebanese: 'LB', syrian: 'SY',
        iraqi: 'IQ', iranian: 'IR', saudi: 'SA', kuwaiti: 'KW', qatari: 'QA',
        bahraini: 'BH', omani: 'OM', yemeni: 'YE', moroccan: 'MA', tunisian: 'TN',
        algerian: 'DZ', sudanese: 'SD', palestinian: 'PS', turkish: 'TR',
        russian: 'RU', chinese: 'CN', japanese: 'JP', korean: 'KR',
        french: 'FR', german: 'DE', italian: 'IT', spanish: 'ES', dutch: 'NL',
        australian: 'AU', kenyan: 'KE', nigerian: 'NG', 'sri lankan': 'LK',
        nepalese: 'NP', nepali: 'NP', afghan: 'AF',
    }
    if (demonyms[lower]) return demonyms[lower]
    // Partial match on name
    const partial = ALL_COUNTRIES.find((c) => c.name.toLowerCase().includes(lower))
    return partial?.iso2
}

/** Get the canonical country name for an ISO-2 code. */
export function countryNameFromIso(iso2: string | undefined): string {
    if (!iso2) return ''
    return ALL_COUNTRIES.find((c) => c.iso2 === iso2)?.name ?? ''
}

// ───────────────────────────────────────────────────────────────────────────
// CountrySelect — dropdown of all countries with flag + name.
// ───────────────────────────────────────────────────────────────────────────

export interface CountrySelectProps {
    /** Selected ISO-2 code (e.g. "AE"). */
    value?: string
    onChange: (iso2: string) => void
    placeholder?: string
    className?: string
    disabled?: boolean
    id?: string
    name?: string
}

export function CountrySelect({
    value,
    onChange,
    placeholder = 'Select country',
    className,
    disabled,
    id,
    name,
}: CountrySelectProps) {
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const wrapRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        if (!open) return
        const onDocClick = (e: MouseEvent) => {
            if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', onDocClick)
        return () => document.removeEventListener('mousedown', onDocClick)
    }, [open])

    const filtered = useMemo(() => {
        const q = query.trim()
        if (!q) return ALL_COUNTRIES
        try {
            const hits = searchCountry(q)
            const codes = new Set(hits.map((c) => c.iso.alpha2))
            return ALL_COUNTRIES.filter((c) => codes.has(c.iso2))
        } catch {
            const lower = q.toLowerCase()
            return ALL_COUNTRIES.filter(
                (c) => c.name.toLowerCase().includes(lower) || c.iso2.toLowerCase().includes(lower),
            )
        }
    }, [query])

    const selected = value ? ALL_COUNTRIES.find((c) => c.iso2 === value) : undefined

    return (
        <div ref={wrapRef} className={cn('relative', className)}>
            <button
                type="button"
                id={id}
                name={name}
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
                className={cn(
                    'flex w-full h-10 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm',
                    'hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                )}
            >
                {selected ? (
                    <>
                        <FlagImg iso2={selected.iso2} size={20} />
                        <span className="truncate text-left flex-1">{selected.name}</span>
                        <span className="text-xs text-muted-foreground">{selected.callingCode}</span>
                    </>
                ) : (
                    <span className="text-muted-foreground flex-1 text-left">{placeholder}</span>
                )}
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>

            {open && (
                <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg">
                    <div className="p-2 border-b border-border">
                        <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <input
                                autoFocus
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search country..."
                                className="w-full h-8 rounded bg-muted/50 pl-7 pr-2 text-xs outline-none focus:ring-1 focus:ring-ring"
                            />
                        </div>
                    </div>
                    <div role="listbox" className="max-h-60 overflow-y-auto py-1">
                        {filtered.length === 0 ? (
                            <p className="px-3 py-4 text-center text-xs text-muted-foreground">No countries found.</p>
                        ) : (
                            filtered.map((c) => {
                                const active = c.iso2 === value
                                return (
                                    <button
                                        type="button"
                                        role="option"
                                        aria-selected={active}
                                        key={c.iso2}
                                        onClick={() => {
                                            onChange(c.iso2)
                                            setOpen(false)
                                            setQuery('')
                                        }}
                                        className={cn(
                                            'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent/40',
                                            active && 'bg-primary/5 font-medium text-primary',
                                        )}
                                    >
                                        <FlagImg iso2={c.iso2} size={20} />
                                        <span className="truncate flex-1">{c.name}</span>
                                        <span className="text-xs text-muted-foreground">{c.callingCode}</span>
                                        {active && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                                    </button>
                                )
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

// ───────────────────────────────────────────────────────────────────────────
// PhoneInput — combined country-picker + national number, validates + emits
// normalized E.164-ish value "+<code><digits>".
// ───────────────────────────────────────────────────────────────────────────

export interface PhoneInputProps {
    /** E.164 string ("+971501234567") or empty. */
    value?: string
    onChange: (value: string) => void
    /** Default ISO-2 when `value` is empty. Defaults to "AE" (UAE). */
    defaultCountry?: string
    placeholder?: string
    id?: string
    name?: string
    disabled?: boolean
    className?: string
    /** Called with validation details whenever the input changes. */
    onValidate?: (res: { isValid: boolean; country: string; internationalFormat?: string }) => void
}

export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(function PhoneInput(
    { value = '', onChange, defaultCountry = 'AE', placeholder = '50 123 4567', id, name, disabled, className, onValidate },
    ref,
) {
    // Derive country + national digits from the current value.
    const { iso2, nationalDigits, callingCode } = useMemo(() => {
        const trimmed = value.trim()
        if (trimmed) {
            try {
                const parsed = utils.parsePhoneNumber(trimmed) as unknown as {
                    country?: { iso?: { alpha2?: string }; callingCode?: string }
                    callingCode?: string
                    nationalNumber?: string
                } | null
                const parsedIso = parsed?.country?.iso?.alpha2
                if (parsedIso) {
                    const opt = ALL_COUNTRIES.find((c) => c.iso2 === parsedIso)
                    return {
                        iso2: parsedIso,
                        nationalDigits: (parsed?.nationalNumber ?? '').replace(/\D/g, ''),
                        callingCode: opt?.callingCode ?? parsed?.callingCode ?? '',
                    }
                }
            } catch {
                /* ignore */
            }
            // Fallback: try digit-prefix match against known calling codes.
            const digits = trimmed.replace(/\D/g, '')
            const withPlus = trimmed.startsWith('+') ? trimmed : `+${digits}`
            const sorted = [...ALL_COUNTRIES].sort((a, b) => b.callingCode.length - a.callingCode.length)
            const hit = sorted.find((c) => withPlus.startsWith(c.callingCode))
            if (hit) {
                const ccDigits = hit.callingCode.replace(/\D/g, '')
                return {
                    iso2: hit.iso2,
                    nationalDigits: digits.startsWith(ccDigits) ? digits.slice(ccDigits.length) : digits,
                    callingCode: hit.callingCode,
                }
            }
        }
        const fallback = ALL_COUNTRIES.find((c) => c.iso2 === defaultCountry) ?? ALL_COUNTRIES[0]
        return { iso2: fallback.iso2, nationalDigits: value.replace(/\D/g, ''), callingCode: fallback.callingCode }
    }, [value, defaultCountry])

    const emit = (newIso2: string, digits: string) => {
        const country = ALL_COUNTRIES.find((c) => c.iso2 === newIso2)
        if (!country) {
            onChange('')
            return
        }
        const normalized = digits.replace(/\D/g, '')
        const joined = normalized ? `${country.callingCode}${normalized}` : ''
        onChange(joined)

        if (onValidate) {
            if (!normalized) {
                onValidate({ isValid: false, country: newIso2 })
                return
            }
            try {
                const result = utils.validatePhoneNumber(joined, newIso2 as ISO2) as unknown as {
                    isValid?: boolean
                    formattedNumber?: string
                } | null
                onValidate({
                    isValid: !!result?.isValid,
                    country: newIso2,
                    internationalFormat: result?.formattedNumber,
                })
            } catch {
                onValidate({ isValid: false, country: newIso2 })
            }
        }
    }

    return (
        <div className={cn('flex items-stretch gap-2', className)}>
            <div className="w-[170px] shrink-0">
                <CountrySelect
                    value={iso2}
                    onChange={(code) => emit(code, nationalDigits)}
                    disabled={disabled}
                />
            </div>
            <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                    {callingCode}
                </span>
                <Input
                    ref={ref}
                    id={id}
                    name={name}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    disabled={disabled}
                    placeholder={placeholder}
                    value={nationalDigits}
                    onChange={(e) => emit(iso2, e.target.value)}
                    className="pl-14"
                />
            </div>
        </div>
    )
})
