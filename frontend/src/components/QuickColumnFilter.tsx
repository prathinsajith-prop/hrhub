/**
 * QuickColumnFilter — lightweight per-column filter popover rendered in table
 * column headers. Supports text, select, number_range, and date_range filters.
 */
import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { NumericInput } from '@/components/ui/numeric-input'
import { cn } from '@/lib/utils'
import type { FilterConfig, AppliedFilter } from '@/lib/filters'

interface QuickColumnFilterProps {
    filterConfig: FilterConfig
    currentValue?: AppliedFilter
    onApply: (filterKey: string, filter: AppliedFilter | null) => void
    children: React.ReactNode
}

export function QuickColumnFilter({
    filterConfig,
    currentValue,
    onApply,
    children,
}: QuickColumnFilterProps) {
    const [open, setOpen] = useState(false)
    const [draft, setDraft] = useState<AppliedFilter | null>(currentValue ?? null)

    const handleOpen = (o: boolean) => {
        if (o) setDraft(currentValue ?? null)
        setOpen(o)
    }

    const handleApply = () => {
        onApply(filterConfig.name, draft)
        setOpen(false)
    }

    const handleClear = () => {
        setDraft(null)
        onApply(filterConfig.name, null)
        setOpen(false)
    }

    const isActive = !!currentValue

    return (
        <Popover open={open} onOpenChange={handleOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className={cn(
                        'ml-1 inline-flex items-center justify-center h-5 w-5 rounded transition-colors',
                        isActive
                            ? 'text-primary bg-primary/10 hover:bg-primary/20'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                    )}
                    aria-label={`Filter by ${filterConfig.label}`}
                >
                    {children}
                </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {filterConfig.label}
                </p>

                <ColumnFilterInput config={filterConfig} value={draft} onChange={setDraft} />

                <div className="flex items-center gap-1.5 pt-1">
                    <Button size="sm" onClick={handleApply} className="h-7 text-xs flex-1 gap-1">
                        <Check className="h-3 w-3" />Apply
                    </Button>
                    {isActive && (
                        <Button variant="ghost" size="sm" onClick={handleClear} className="h-7 text-xs gap-1">
                            <X className="h-3 w-3" />Clear
                        </Button>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    )
}

function ColumnFilterInput({
    config,
    value,
    onChange,
}: {
    config: FilterConfig
    value: AppliedFilter | null
    onChange: (v: AppliedFilter | null) => void
}) {
    switch (config.type) {
        case 'text':
        case 'autocomplete': {
            const v = typeof value?.value === 'string' ? value.value : ''
            return (
                <Input
                    value={v}
                    onChange={(e) =>
                        onChange(e.target.value ? { value: e.target.value, operator: 'contains' } : null)
                    }
                    placeholder={config.placeholder ?? 'Type to filter…'}
                    className="h-8 text-sm"
                />
            )
        }

        case 'select':
        case 'multi_select': {
            const options = config.options ?? []
            const current = value?.value
            const arr: string[] = Array.isArray(current) ? current.map(String) : current ? [String(current)] : []
            return (
                <div className="rounded-md border overflow-hidden max-h-44 overflow-y-auto">
                    {options.map((opt) => {
                        const val = String(opt.value)
                        const selected = arr.includes(val)
                        return (
                            <button
                                key={val}
                                type="button"
                                onClick={() => {
                                    const next = selected ? arr.filter((x) => x !== val) : [...arr, val]
                                    onChange(
                                        next.length
                                            ? { value: next.length === 1 ? next[0] : next, operator: next.length === 1 ? 'is' : 'in' }
                                            : null,
                                    )
                                }}
                                className={cn(
                                    'w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left border-b border-border/40 last:border-0',
                                    selected ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted/60',
                                )}
                            >
                                <span className={cn('h-3.5 w-3.5 shrink-0 rounded border flex items-center justify-center', selected && 'bg-primary border-primary')}>
                                    {selected && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                                </span>
                                {opt.label}
                            </button>
                        )
                    })}
                    {options.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">No options</p>}
                </div>
            )
        }

        case 'number_range': {
            const v = (value?.value && typeof value.value === 'object' && !Array.isArray(value.value)
                ? value.value as { min?: number; max?: number }
                : {}) as { min?: number; max?: number }
            const update = (next: { min?: number; max?: number }) => {
                const empty = next.min == null && next.max == null
                onChange(empty ? null : { value: next, operator: 'between' })
            }
            return (
                <div className="grid grid-cols-2 gap-1.5">
                    <NumericInput
                        value={v.min ?? ''}
                        onChange={(e) => update({ ...v, min: e.target.value ? Number(e.target.value) : undefined })}
                        placeholder="Min"
                        className="h-8 text-sm"
                        min={config.min}
                        max={config.max}
                    />
                    <NumericInput
                        value={v.max ?? ''}
                        onChange={(e) => update({ ...v, max: e.target.value ? Number(e.target.value) : undefined })}
                        placeholder="Max"
                        className="h-8 text-sm"
                        min={config.min}
                        max={config.max}
                    />
                </div>
            )
        }

        case 'date_range': {
            const v = (value?.value && typeof value.value === 'object' && !Array.isArray(value.value)
                ? value.value as { from?: string; to?: string }
                : {}) as { from?: string; to?: string }
            const update = (next: { from?: string; to?: string }) => {
                const empty = !next.from && !next.to
                onChange(empty ? null : { value: next, operator: 'between' })
            }
            return (
                <div className="space-y-1.5">
                    <DatePicker value={v.from ?? ''} onChange={(s) => update({ ...v, from: s })} placeholder="From" />
                    <DatePicker value={v.to ?? ''} onChange={(s) => update({ ...v, to: s })} placeholder="To" />
                </div>
            )
        }

        default:
            return null
    }
}
