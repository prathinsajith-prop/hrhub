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
            {/* Centre label.
                Was `min-w-[140px]` which both (a) pushed adjacent header
                content off-screen on 320px viewports, and (b) overflowed
                with Arabic month strings (e.g. "سبتمبر 2026") because the
                inline-flex parent couldn't wrap. Switched to a content-
                hugging size with a softer minimum, and added
                `whitespace-nowrap` so the label still tabular-aligns
                across prev/next clicks without jittering. */}
            <div className="px-3 text-xs font-medium text-center border-l border-r whitespace-nowrap tabular-nums min-w-[110px]">
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
