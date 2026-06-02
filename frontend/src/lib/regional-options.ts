/**
 * Dropdown option lists derived from `country-atlas`.
 *
 * Computed once at module load (the library exports static JSON), so every
 * call site reads from the cached arrays without re-iterating ~250 countries
 * and their timezone arrays. Tree-shakable: only what's imported is bundled.
 */
import { getAllCountries } from 'country-atlas'
import type { ComboboxOption } from '@/components/ui/combobox'

const countries = getAllCountries()

// ── Currencies ────────────────────────────────────────────────────────────
// Dedupe by ISO 4217 code. Most countries have a single currency; multi-
// currency entries (e.g. Zimbabwe) just contribute their primary one.
const currencyMap = new Map<string, { code: string; name?: string; symbol?: string }>()
for (const c of countries) {
    const currency = c.currency
    if (!currency?.code) continue
    if (!currencyMap.has(currency.code)) {
        currencyMap.set(currency.code, currency)
    }
}
export const CURRENCY_OPTIONS: ComboboxOption[] = Array.from(currencyMap.values())
    .sort((a, b) => a.code.localeCompare(b.code))
    .map(c => ({
        value: c.code,
        label: c.symbol ? `${c.code} · ${c.symbol}` : c.code,
        secondary: c.name,
    }))

// ── Timezones ─────────────────────────────────────────────────────────────
// Flatten every country's timezone array, dedupe by IANA name, sort by UTC
// offset minutes (Pacific → Atlantic). UTC offset string lives in `secondary`
// so users can scan for "GMT+04:00" while typing a city.
const tzMap = new Map<string, { name: string; utcOffset: string; utcOffsetMin?: number }>()
for (const c of countries) {
    for (const tz of c.timezones ?? []) {
        if (!tzMap.has(tz.name)) tzMap.set(tz.name, tz)
    }
}
export const TIMEZONE_OPTIONS: ComboboxOption[] = Array.from(tzMap.values())
    .sort((a, b) => {
        const ao = a.utcOffsetMin ?? 0
        const bo = b.utcOffsetMin ?? 0
        if (ao !== bo) return ao - bo
        return a.name.localeCompare(b.name)
    })
    .map(tz => ({
        value: tz.name,
        label: tz.name,
        secondary: `UTC${tz.utcOffset}`,
    }))
