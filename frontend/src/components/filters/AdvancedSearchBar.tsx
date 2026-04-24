/**
 * AdvancedSearchBar — single search input with a Filters popover that exposes
 * every available filter, applied chips, history, and a clear-all action.
 *
 * Usage (controlled):
 *   const search = useSearchFilters({ availableFilters, storageKey })
 *   <AdvancedSearchBar
 *     search={search}
 *     filters={availableFilters}
 *     onApply={() => refetch()}
 *   />
 */
import { useMemo, useState } from 'react'
import { Search, SlidersHorizontal, X, History, Trash2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/primitives'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import {
    type FilterConfig,
    type QuickFilter,
    formatFilterValue,
} from '@/lib/filters'
import { FilterPrimitive } from './primitives'
import type { UseSearchFiltersReturn } from '@/hooks/useSearchFilters'

interface AdvancedSearchBarProps {
    search: UseSearchFiltersReturn
    filters: FilterConfig[]
    quickFilters?: QuickFilter[]
    placeholder?: string
    onApply?: () => void
    /** Total result count to display next to the bar. */
    resultCount?: number
    /** Custom class name for the wrapper. */
    className?: string
    /** Additional toolbar slot rendered to the right of the bar. */
    rightSlot?: React.ReactNode
}

export function AdvancedSearchBar({
    search,
    filters,
    quickFilters,
    placeholder = 'Search…',
    onApply,
    resultCount,
    className,
    rightSlot,
}: AdvancedSearchBarProps) {
    const [open, setOpen] = useState(false)
    const [expanded, setExpanded] = useState<string | null>(null)
    const [showHistory, setShowHistory] = useState(false)
    const filterMap = useMemo(() => new Map(filters.map((f) => [f.name, f])), [filters])

    const apply = () => {
        search.saveCurrent()
        onApply?.()
        setOpen(false)
        setExpanded(null)
    }

    const reset = () => {
        search.clearAll()
        onApply?.()
    }

    const removeOne = (name: string) => {
        search.setOneFilter(name, null)
        onApply?.()
    }

    const appliedEntries = Object.entries(search.appliedFilters)

    return (
        <div className={cn('space-y-2', className)}>
            <div className="flex items-center gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                        value={search.searchInput}
                        onChange={(e) => search.setSearchInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') apply() }}
                        placeholder={placeholder}
                        className="h-9 pl-8 pr-8"
                    />
                    {(search.searchInput || search.appliedCount > 0) && (
                        <button
                            type="button"
                            onClick={reset}
                            aria-label="Clear search"
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>

                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-9 gap-1.5 relative">
                            <SlidersHorizontal className="h-3.5 w-3.5" />
                            Filters
                            {search.appliedCount > 0 && (
                                <span className="ml-0.5 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-semibold bg-primary text-primary-foreground">
                                    {search.appliedCount}
                                </span>
                            )}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent
                        align="end"
                        className="w-[420px] p-0"
                        // Prevent the popover from closing when the user opens a nested
                        // Radix portal (Select dropdown, DatePicker calendar, Tooltip…).
                        onInteractOutside={(e) => {
                            const target = e.target as HTMLElement | null
                            if (!target) return
                            if (
                                target.closest('[data-radix-popper-content-wrapper]') ||
                                target.closest('[role="listbox"]') ||
                                target.closest('[role="dialog"]') ||
                                target.closest('[data-radix-select-content]') ||
                                target.closest('[data-radix-popover-content]')
                            ) {
                                e.preventDefault()
                            }
                        }}
                        onOpenAutoFocus={(e) => e.preventDefault()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-3 py-2 border-b">
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => setShowHistory(false)}
                                    className={cn('px-2 py-1 rounded text-xs font-medium', !showHistory ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}
                                >Filters</button>
                                <button
                                    type="button"
                                    onClick={() => setShowHistory(true)}
                                    className={cn('px-2 py-1 rounded text-xs font-medium inline-flex items-center gap-1', showHistory ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}
                                ><History className="h-3 w-3" />History {search.history.length > 0 && `(${search.history.length})`}</button>
                            </div>
                            <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground" aria-label="Close">
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>

                        {showHistory ? (
                            <ScrollArea className="max-h-[320px]">
                                {search.history.length === 0 ? (
                                    <div className="px-4 py-8 text-center text-xs text-muted-foreground">No recent searches yet.</div>
                                ) : (
                                    <ul className="divide-y">
                                        {search.history.map((h) => (
                                            <li key={h.id} className="flex items-center gap-2 px-3 py-2">
                                                <button
                                                    type="button"
                                                    onClick={() => { search.restore(h); onApply?.(); setOpen(false) }}
                                                    className="flex-1 min-w-0 text-left"
                                                >
                                                    <p className="text-sm truncate">{h.label}</p>
                                                    <p className="text-[10px] text-muted-foreground">{new Date(h.timestamp).toLocaleString()}</p>
                                                </button>
                                                <button type="button" onClick={() => search.deleteHistoryItem(h.id)} aria-label="Remove" className="text-muted-foreground hover:text-destructive">
                                                    <X className="h-3.5 w-3.5" />
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                {search.history.length > 0 && (
                                    <div className="px-3 py-2 border-t flex justify-end">
                                        <Button variant="ghost" size="sm" onClick={search.clearHistory} className="h-7 text-xs gap-1">
                                            <Trash2 className="h-3 w-3" />Clear history
                                        </Button>
                                    </div>
                                )}
                            </ScrollArea>
                        ) : (
                            <div>
                                {/* Quick filters */}
                                {!!quickFilters?.length && !expanded && (
                                    <div className="px-3 py-2 border-b">
                                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Quick filters</p>
                                        <div className="flex flex-wrap gap-1">
                                            {quickFilters.map((q) => (
                                                <button
                                                    key={q.name}
                                                    type="button"
                                                    onClick={() => { search.setAppliedFilters(q.filter); apply() }}
                                                    className="text-[11px] px-2 h-6 rounded-full border hover:border-primary hover:text-primary"
                                                >
                                                    {q.icon ? <q.icon className="h-3 w-3 inline mr-1" /> : null}{q.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Filter detail or list */}
                                <ScrollArea className="max-h-[360px]">
                                    {expanded ? (
                                        <div className="p-3 space-y-2">
                                            <button
                                                type="button"
                                                onClick={() => setExpanded(null)}
                                                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                                            >← Back to filters</button>
                                            {(() => {
                                                const cfg = filterMap.get(expanded)
                                                if (!cfg) return null
                                                return (
                                                    <div className="space-y-2">
                                                        <div className="flex items-center gap-1.5">
                                                            {cfg.icon ? <cfg.icon className="h-3.5 w-3.5 text-muted-foreground" /> : null}
                                                            <p className="text-sm font-semibold">{cfg.label}</p>
                                                        </div>
                                                        <FilterPrimitive
                                                            config={cfg}
                                                            value={search.appliedFilters[cfg.name]}
                                                            onChange={(v) => search.setOneFilter(cfg.name, v)}
                                                        />
                                                    </div>
                                                )
                                            })()}
                                        </div>
                                    ) : (
                                        <ul className="divide-y">
                                            {filters.map((f) => {
                                                const applied = search.appliedFilters[f.name]
                                                const value = applied ? formatFilterValue(f, applied) : null
                                                return (
                                                    <li key={f.name}>
                                                        <button
                                                            type="button"
                                                            onClick={() => setExpanded(f.name)}
                                                            className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-muted/50 text-left"
                                                        >
                                                            <span className="flex items-center gap-2 min-w-0">
                                                                {f.icon ? <f.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : null}
                                                                <span className="text-sm truncate">{f.label}</span>
                                                            </span>
                                                            {value ? (
                                                                <Badge variant="info" className="text-[10px] truncate max-w-[180px]">{value}</Badge>
                                                            ) : (
                                                                <span className="text-[11px] text-muted-foreground">Any</span>
                                                            )}
                                                        </button>
                                                    </li>
                                                )
                                            })}
                                        </ul>
                                    )}
                                </ScrollArea>

                                {/* Footer */}
                                <div className="flex items-center justify-between px-3 py-2 border-t bg-muted/30">
                                    <Button variant="ghost" size="sm" onClick={reset} className="h-7 text-xs">Clear all</Button>
                                    <Button size="sm" onClick={apply} className="h-7 text-xs gap-1">
                                        <Check className="h-3 w-3" />Apply
                                    </Button>
                                </div>
                            </div>
                        )}
                    </PopoverContent>
                </Popover>

                {rightSlot}
            </div>

            {/* Applied chips */}
            {(appliedEntries.length > 0 || resultCount !== undefined) && (
                <div className="flex flex-wrap items-center gap-1.5">
                    {appliedEntries.map(([name, applied]) => {
                        const cfg = filterMap.get(name)
                        const label = cfg?.label ?? name
                        const value = formatFilterValue(cfg, applied)
                        return (
                            <Badge key={name} variant="secondary" className="text-[11px] gap-1">
                                <span className="font-semibold">{label}:</span>
                                <span className="truncate max-w-[180px]">{value}</span>
                                <button type="button" onClick={() => removeOne(name)} aria-label={`Remove ${label}`}>
                                    <X className="h-3 w-3" />
                                </button>
                            </Badge>
                        )
                    })}
                    {appliedEntries.length > 0 && (
                        <button type="button" onClick={reset} className="text-[11px] text-muted-foreground hover:text-foreground underline">Clear</button>
                    )}
                    {resultCount !== undefined && (
                        <span className="ml-auto text-[11px] text-muted-foreground">{resultCount} result{resultCount === 1 ? '' : 's'}</span>
                    )}
                </div>
            )}
        </div>
    )
}
