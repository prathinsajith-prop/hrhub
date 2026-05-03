import { cn } from '@/lib/utils'

interface OrgHierarchyPathProps {
    /** Array of [branchName, divisionName, deptName] — nulls are skipped in compact mode */
    parts: (string | null | undefined)[]
    className?: string
    /** When true every null level renders as '—' instead of being hidden */
    showEmpty?: boolean
}

/**
 * Renders a Branch › Division › Department breadcrumb.
 * Non-null parts use progressively bolder styling (last part = foreground/medium).
 * Pass showEmpty to display placeholder dashes for missing levels.
 */
export function OrgHierarchyPath({ parts, className, showEmpty = false }: OrgHierarchyPathProps) {
    const resolved = showEmpty
        ? parts.map(p => p ?? '—')
        : (parts.filter(Boolean) as string[])

    if (resolved.length === 0) {
        return <span className="text-xs text-muted-foreground">—</span>
    }

    return (
        <div className={cn('flex items-center gap-1 min-w-0 flex-wrap', className)}>
            {resolved.map((part, i) => (
                <span key={i} className="flex items-center gap-1 min-w-0">
                    {i > 0 && <span className="text-muted-foreground/40 text-[10px] shrink-0">›</span>}
                    <span className={cn(
                        'truncate text-xs',
                        i === resolved.length - 1
                            ? 'text-foreground font-medium'
                            : 'text-muted-foreground/70',
                        part === '—' && 'italic text-muted-foreground/50',
                    )}>
                        {part}
                    </span>
                </span>
            ))}
        </div>
    )
}
