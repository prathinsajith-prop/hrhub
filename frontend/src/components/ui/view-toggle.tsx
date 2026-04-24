import { LayoutList, LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ViewMode } from '@/hooks/useViewMode'

interface ViewToggleProps {
    view: ViewMode
    onChange: (v: ViewMode) => void
    className?: string
}

export function ViewToggle({ view, onChange, className }: ViewToggleProps) {
    return (
        <div className={cn('flex rounded-lg border border-border bg-muted/40 p-0.5', className)}>
            <button
                type="button"
                onClick={() => onChange('table')}
                title="Table view"
                className={cn(
                    'h-7 w-7 rounded-md flex items-center justify-center transition-all',
                    view === 'table'
                        ? 'bg-background shadow-sm text-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                )}
            >
                <LayoutList className="h-3.5 w-3.5" />
            </button>
            <button
                type="button"
                onClick={() => onChange('grid')}
                title="Grid view"
                className={cn(
                    'h-7 w-7 rounded-md flex items-center justify-center transition-all',
                    view === 'grid'
                        ? 'bg-background shadow-sm text-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                )}
            >
                <LayoutGrid className="h-3.5 w-3.5" />
            </button>
        </div>
    )
}
