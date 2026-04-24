/**
 * OperatorPills — small pill row used by every primitive filter to switch
 * between available operators (contains / equals / between / …).
 */
import { cn } from '@/lib/utils'
import type { FilterOperator } from '@/lib/filters'

interface OperatorPillsProps {
    value: FilterOperator
    onChange: (op: FilterOperator) => void
    operators: { value: FilterOperator; label: string }[]
}

export function OperatorPills({ value, onChange, operators }: OperatorPillsProps) {
    if (!operators.length || operators.length === 1) return null
    return (
        <div className="flex flex-wrap gap-1 mb-2">
            {operators.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    onClick={() => onChange(o.value)}
                    className={cn(
                        'h-6 px-2 rounded-full text-[11px] font-medium border transition-colors',
                        o.value === value
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-card text-muted-foreground border-border hover:text-foreground hover:border-foreground/30',
                    )}
                >
                    {o.label}
                </button>
            ))}
        </div>
    )
}
