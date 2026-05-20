/**
 * FilterBar - thin wrapper that normalises object-map props into the arrays
 * that AdvancedSearchBar expects. Mount this on any page that has a filters
 * record keyed by filter name.
 */
import { useMemo } from 'react'
import { AdvancedSearchBar } from '@/components/filters/AdvancedSearchBar'
import type { FilterConfig, QuickFilter } from '@/lib/filters'
import type { UseSearchFiltersReturn } from '@/hooks/useSearchFilters'

interface FilterBarProps {
    search: UseSearchFiltersReturn
    filters?: Record<string, FilterConfig>
    quickFilters?: Record<string, QuickFilter>
    placeholder?: string
    onApply?: () => void
    resultCount?: number
    className?: string
    rightSlot?: React.ReactNode
}

export function FilterBar({
    search,
    filters,
    quickFilters,
    placeholder,
    onApply,
    resultCount,
    className,
    rightSlot,
}: FilterBarProps) {
    const filterArray = useMemo(() => Object.values(filters ?? {}), [filters])
    const quickFilterArray = useMemo(() => Object.values(quickFilters ?? {}), [quickFilters])

    return (
        <AdvancedSearchBar
            search={search}
            filters={filterArray}
            quickFilters={quickFilterArray}
            placeholder={placeholder}
            onApply={onApply}
            resultCount={resultCount}
            className={className}
            rightSlot={rightSlot}
        />
    )
}
