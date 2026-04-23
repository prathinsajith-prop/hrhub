import { memo } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

interface TableSkeletonProps {
    columns?: number
    rows?: number
}

/** Generic loading skeleton for plain HTML tables. */
function TableSkeletonBase({ columns = 6, rows = 8 }: TableSkeletonProps) {
    return (
        <div className="rounded-xl border overflow-hidden">
            <div className="grid gap-3 px-4 py-3 bg-muted/50" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
                {Array.from({ length: columns }).map((_, i) => (
                    <Skeleton key={i} className="h-3.5 w-2/3" />
                ))}
            </div>
            {Array.from({ length: rows }).map((_, r) => (
                <div
                    key={r}
                    className="grid gap-3 px-4 py-3.5 border-t"
                    style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
                >
                    {Array.from({ length: columns }).map((_, c) => (
                        <Skeleton key={c} className="h-4 w-3/4" />
                    ))}
                </div>
            ))}
        </div>
    )
}

export const TableSkeleton = memo(TableSkeletonBase)
