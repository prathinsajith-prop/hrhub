import { cn } from '@/lib/utils'

type DivProps = React.HTMLAttributes<HTMLDivElement>

function Card({ className, ...props }: DivProps) {
    return (
        <div
            className={cn(
                'rounded-xl border border-border/60 bg-card text-card-foreground shadow-[0_1px_2px_rgba(15,23,42,0.04),0_2px_8px_-2px_rgba(15,23,42,0.06)] transition-shadow hover:shadow-[0_2px_4px_rgba(15,23,42,0.06),0_8px_24px_-4px_rgba(15,23,42,0.08)]',
                className,
            )}
            {...props}
        />
    )
}

function CardContent({ className, ...props }: DivProps) {
    return <div className={cn('p-4 pt-0', className)} {...props} />
}

export { Card, CardContent }
