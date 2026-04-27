import { useEffect, useState } from 'react'
import type { AppliedFilter, FilterConfig, FilterOperator } from '@/lib/filters'
import { DEFAULT_OPERATORS, DEFAULT_OPERATOR_BY_TYPE } from './operators'
import { OperatorPills } from './OperatorPills'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/form-controls'
import { Switch } from '@/components/ui/switch'
import { DatePicker } from '@/components/ui/date-picker'
import { NumericInput } from '@/components/ui/numeric-input'
import { Badge } from '@/components/ui/primitives'
import { X } from 'lucide-react'

interface PrimitiveProps {
    config: FilterConfig
    value: AppliedFilter | undefined
    onChange: (next: AppliedFilter | null) => void
}

function operatorsFor(config: FilterConfig) {
    return config.operators ?? DEFAULT_OPERATORS[config.type]
}

function defaultOp(config: FilterConfig): FilterOperator {
    return config.defaultOperator ?? config.operators?.[0]?.value ?? DEFAULT_OPERATOR_BY_TYPE[config.type]
}

// ─── TextFilter ──────────────────────────────────────────────────────────────
export function TextFilter({ config, value, onChange }: PrimitiveProps) {
    const ops = operatorsFor(config)
    const op = (value?.operator ?? defaultOp(config)) as FilterOperator
    const v = (typeof value?.value === 'string' ? value.value : '') as string
    return (
        <div>
            <OperatorPills value={op} onChange={(o) => onChange({ value: v, operator: o })} operators={ops} />
            <Input
                value={v}
                onChange={(e) => onChange(e.target.value === '' ? null : { value: e.target.value, operator: op })}
                placeholder={config.placeholder ?? 'Type to filter…'}
                className="h-9"
            />
        </div>
    )
}

// ─── SelectFilter ────────────────────────────────────────────────────────────
export function SelectFilter({ config, value, onChange }: PrimitiveProps) {
    const ops = operatorsFor(config)
    const op = (value?.operator ?? defaultOp(config)) as FilterOperator
    const isMulti = op === 'in' || op === 'not_in' || config.type === 'multi_select'
    const current = value?.value
    const arrVal: string[] = Array.isArray(current) ? current.map(String) : current ? [String(current)] : []
    const singleVal: string = !Array.isArray(current) && current != null ? String(current) : ''

    const switchOperator = (o: FilterOperator) => {
        const newMulti = o === 'in' || o === 'not_in'
        if (newMulti && !Array.isArray(current)) {
            onChange({ value: current ? [String(current)] : [], operator: o })
        } else if (!newMulti && Array.isArray(current)) {
            onChange({ value: current[0] ?? '', operator: o })
        } else {
            onChange({ value: current as never, operator: o })
        }
    }

    return (
        <div>
            <OperatorPills value={op} onChange={switchOperator} operators={ops} />
            {isMulti ? (
                <div className="space-y-1.5">
                    <div className="flex flex-wrap gap-1">
                        {arrVal.map((val) => {
                            const opt = config.options?.find((o) => String(o.value) === val)
                            return (
                                <Badge key={val} variant="secondary" className="text-[11px] gap-1">
                                    {opt?.label ?? val}
                                    <button type="button" onClick={() => onChange({ value: arrVal.filter((x) => x !== val), operator: op })}>
                                        <X className="h-3 w-3" />
                                    </button>
                                </Badge>
                            )
                        })}
                    </div>
                    <Select
                        value=""
                        onValueChange={(val) => {
                            if (!val) return
                            const next = Array.from(new Set([...arrVal, val]))
                            onChange({ value: next, operator: op })
                        }}
                    >
                        <SelectTrigger className="h-9"><SelectValue placeholder="Add option…" /></SelectTrigger>
                        <SelectContent>
                            {(config.options ?? []).filter((o) => !arrVal.includes(String(o.value))).map((o) => (
                                <SelectItem key={String(o.value)} value={String(o.value)}>{o.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            ) : (
                <Select value={singleVal} onValueChange={(val) => onChange(val ? { value: val, operator: op } : null)}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                        {(config.options ?? []).map((o) => (
                            <SelectItem key={String(o.value)} value={String(o.value)}>{o.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}
        </div>
    )
}

// ─── DateRangeFilter ─────────────────────────────────────────────────────────
export function DateRangeFilter({ config, value, onChange }: PrimitiveProps) {
    const ops = operatorsFor(config)
    const op = (value?.operator ?? defaultOp(config)) as FilterOperator
    const v = (value?.value && typeof value.value === 'object' && !Array.isArray(value.value)
        ? value.value as { from?: string; to?: string }
        : {}) as { from?: string; to?: string }
    const isBetween = op === 'between'

    const update = (next: { from?: string; to?: string }) => {
        const empty = !next.from && !next.to
        onChange(empty ? null : { value: next, operator: op })
    }

    return (
        <div>
            <OperatorPills value={op} onChange={(o) => {
                const next = o === 'between' ? v : { from: v.from }
                onChange({ value: next, operator: o })
            }} operators={ops} />
            <div className={isBetween ? 'grid grid-cols-2 gap-2' : ''}>
                <DatePicker value={v.from ?? ''} onChange={(s) => update({ ...v, from: s })} placeholder={isBetween ? 'From' : 'Date'} />
                {isBetween && <DatePicker value={v.to ?? ''} onChange={(s) => update({ ...v, to: s })} placeholder="To" />}
            </div>
        </div>
    )
}

// ─── NumberRangeFilter ───────────────────────────────────────────────────────
export function NumberRangeFilter({ config, value, onChange }: PrimitiveProps) {
    const ops = operatorsFor(config)
    const op = (value?.operator ?? defaultOp(config)) as FilterOperator
    const isBetween = op === 'between'
    const v = (value?.value && typeof value.value === 'object' && !Array.isArray(value.value)
        ? value.value as { min?: number; max?: number }
        : {}) as { min?: number; max?: number }

    const update = (next: { min?: number; max?: number }) => {
        const empty = (next.min === undefined || Number.isNaN(next.min)) && (next.max === undefined || Number.isNaN(next.max))
        onChange(empty ? null : { value: next, operator: op })
    }
    const toNum = (s: string): number | undefined => {
        if (s === '' || s === undefined) return undefined
        const n = Number(s)
        return Number.isNaN(n) ? undefined : n
    }

    return (
        <div>
            <OperatorPills value={op} onChange={(o) => {
                const next = o === 'between' ? v : { min: v.min }
                onChange({ value: next, operator: o })
            }} operators={ops} />
            <div className={isBetween ? 'grid grid-cols-2 gap-2' : ''}>
                <NumericInput
                    value={v.min ?? ''}
                    onChange={(e) => update({ ...v, min: toNum(e.target.value) })}
                    placeholder={isBetween ? 'Min' : 'Value'}
                    min={config.min} max={config.max} step={config.step}
                    className="h-9"
                />
                {isBetween && (
                    <NumericInput
                        value={v.max ?? ''}
                        onChange={(e) => update({ ...v, max: toNum(e.target.value) })}
                        placeholder="Max" min={config.min} max={config.max} step={config.step}
                        className="h-9"
                    />
                )}
            </div>
        </div>
    )
}

// ─── ToggleFilter ────────────────────────────────────────────────────────────
export function ToggleFilter({ config, value, onChange }: PrimitiveProps) {
    const v = value?.value === true
    return (
        <label className="flex items-center justify-between gap-3">
            <span className="text-sm">{config.label}</span>
            <Switch checked={v} onCheckedChange={(checked) => onChange(checked ? { value: true, operator: 'equals' } : null)} />
        </label>
    )
}

// ─── TagFilter ───────────────────────────────────────────────────────────────
export function TagFilter({ config, value, onChange }: PrimitiveProps) {
    const v: string[] = Array.isArray(value?.value) ? (value!.value as string[]) : []
    const [draft, setDraft] = useState('')
    const commit = () => {
        const tag = draft.trim()
        if (!tag) return
        const next = Array.from(new Set([...v, tag]))
        onChange({ value: next, operator: 'in' })
        setDraft('')
    }
    return (
        <div className="space-y-2">
            {v.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {v.map((t) => (
                        <Badge key={t} variant="secondary" className="text-[11px] gap-1">
                            {t}
                            <button type="button" onClick={() => {
                                const next = v.filter((x) => x !== t)
                                onChange(next.length ? { value: next, operator: 'in' } : null)
                            }}>
                                <X className="h-3 w-3" />
                            </button>
                        </Badge>
                    ))}
                </div>
            )}
            <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
                placeholder={config.placeholder ?? 'Add tag, press Enter'}
                className="h-9"
            />
            {!!config.suggestions?.length && (
                <div className="flex flex-wrap gap-1">
                    {config.suggestions.filter((s) => !v.includes(s)).slice(0, 8).map((s) => (
                        <button
                            key={s} type="button"
                            onClick={() => onChange({ value: [...v, s], operator: 'in' })}
                            className="text-[11px] px-2 h-6 rounded-full border border-dashed hover:border-foreground/50"
                        >+ {s}</button>
                    ))}
                </div>
            )}
        </div>
    )
}

// ─── AutocompleteFilter ──────────────────────────────────────────────────────
export function AutocompleteFilter({ config, value, onChange }: PrimitiveProps) {
    const op = (value?.operator ?? defaultOp(config)) as FilterOperator
    const ops = operatorsFor(config)
    const isMulti = op === 'in'
    const [draft, setDraft] = useState('')
    const [results, setResults] = useState<{ value: string | number; label: string }[]>(config.options ?? [])
    const [loading, setLoading] = useState(false)
    const arrVal: string[] = Array.isArray(value?.value) ? (value!.value as string[]).map(String) : value?.value ? [String(value.value)] : []

    useEffect(() => {
        if (!config.onSearch) return
        if (!draft.trim()) { setResults(config.options ?? []); return }
        let cancelled = false
        setLoading(true)
        // eslint-disable-next-line react-hooks/set-state-in-effect
        config.onSearch(draft.trim()).then((r) => { if (!cancelled) setResults(r) }).finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [draft, config])

    const add = (val: string) => {
        if (isMulti) {
            const next = Array.from(new Set([...arrVal, val]))
            onChange({ value: next, operator: op })
        } else {
            onChange({ value: val, operator: op })
        }
        setDraft('')
    }

    return (
        <div>
            <OperatorPills value={op} onChange={(o) => {
                const newMulti = o === 'in'
                if (newMulti && !Array.isArray(value?.value)) onChange({ value: arrVal, operator: o })
                else if (!newMulti && Array.isArray(value?.value)) onChange({ value: arrVal[0] ?? '', operator: o })
                else onChange({ value: value?.value as never, operator: o })
            }} operators={ops} />
            {isMulti && arrVal.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                    {arrVal.map((val) => {
                        const opt = (results.length ? results : config.options ?? []).find((o) => String(o.value) === val)
                        return (
                            <Badge key={val} variant="secondary" className="text-[11px] gap-1">
                                {opt?.label ?? val}
                                <button type="button" onClick={() => onChange({ value: arrVal.filter((x) => x !== val), operator: op })}>
                                    <X className="h-3 w-3" />
                                </button>
                            </Badge>
                        )
                    })}
                </div>
            )}
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={config.placeholder ?? 'Search…'} className="h-9 mb-2" />
            <div className="max-h-40 overflow-y-auto border rounded-md divide-y">
                {loading && <div className="px-2 py-1.5 text-xs text-muted-foreground">Loading…</div>}
                {!loading && results.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">No results</div>}
                {results.filter((o) => !arrVal.includes(String(o.value))).map((o) => (
                    <button
                        key={String(o.value)} type="button"
                        onClick={() => add(String(o.value))}
                        className="w-full text-left px-2 py-1.5 text-sm hover:bg-muted"
                    >{o.label}</button>
                ))}
            </div>
        </div>
    )
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────
export function FilterPrimitive({ config, value, onChange }: PrimitiveProps) {
    switch (config.type) {
        case 'text': return <TextFilter config={config} value={value} onChange={onChange} />
        case 'select': return <SelectFilter config={config} value={value} onChange={onChange} />
        case 'multi_select': return <SelectFilter config={config} value={value} onChange={onChange} />
        case 'date_range': return <DateRangeFilter config={config} value={value} onChange={onChange} />
        case 'number_range': return <NumberRangeFilter config={config} value={value} onChange={onChange} />
        case 'toggle': return <ToggleFilter config={config} value={value} onChange={onChange} />
        case 'tags': return <TagFilter config={config} value={value} onChange={onChange} />
        case 'autocomplete': return <AutocompleteFilter config={config} value={value} onChange={onChange} />
        default: return null
    }
}
