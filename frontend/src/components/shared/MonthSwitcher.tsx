import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Prev / label / next month navigation, shared by the team attendance page and
 * the per-employee attendance tab. The parent owns the `offset` state (0 =
 * current month, negative = past) so it can derive both display labels and
 * API date ranges from the same number.
 */
export function MonthSwitcher({
    offset,
    onChange,
    label,
}: {
    offset: number
    onChange: (next: number) => void
    label: string
}) {
    return (
        <div className="inline-flex items-center rounded-lg border bg-card h-9 overflow-hidden">
            <Button
                variant="ghost"
                size="sm"
                className="h-9 px-2 rounded-none"
                onClick={() => onChange(offset - 1)}
                aria-label="Previous month"
            >
                <ChevronLeft className="size-4" />
            </Button>
            <div className="px-3 text-xs font-medium min-w-[140px] text-center border-l border-r">
                {label}
            </div>
            <Button
                variant="ghost"
                size="sm"
                className="h-9 px-2 rounded-none"
                onClick={() => onChange(Math.min(0, offset + 1))}
                disabled={offset === 0}
                aria-label="Next month"
            >
                <ChevronRight className="size-4" />
            </Button>
        </div>
    )
}
