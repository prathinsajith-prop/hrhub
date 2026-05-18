import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
    return (
        <textarea
            className={cn(
                'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
                'aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive/30 aria-[invalid=true]:focus-visible:border-destructive',
                className,
            )}
            {...props}
        />
    )
}

export { Textarea }
