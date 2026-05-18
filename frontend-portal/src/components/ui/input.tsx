import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
    return (
        <input
            type={type}
            className={cn(
                'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
                'aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive/30 aria-[invalid=true]:focus-visible:border-destructive',
                className,
            )}
            {...props}
        />
    )
}

export { Input }
