import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface TablePaginationProps {
    total: number
    offset: number
    limit: number
    onChange: (offset: number) => void
    loading?: boolean
}

export function TablePagination({ total, offset, limit, onChange, loading = false }: TablePaginationProps) {
    if (total <= 0) return null

    const from = offset + 1
    const to = Math.min(offset + limit, total)
    const hasPrev = offset > 0
    const hasNext = offset + limit < total
    const multiPage = total > limit

    return (
        <div className="flex items-center justify-between text-sm text-muted-foreground pt-1">
            <span>
                Showing <span className="font-medium text-foreground">{from}–{to}</span> of{' '}
                <span className="font-medium text-foreground">{total}</span> results
            </span>
            {multiPage && (
                <div className="flex items-center gap-1">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={!hasPrev || loading}
                        onClick={() => onChange(Math.max(0, offset - limit))}
                    >
                        <ChevronLeft className="size-4 mr-1" />
                        Previous
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={!hasNext || loading}
                        onClick={() => onChange(offset + limit)}
                    >
                        Next
                        <ChevronRight className="size-4 ml-1" />
                    </Button>
                </div>
            )}
        </div>
    )
}
