import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
    {
        variants: {
            variant: {
                default: 'bg-primary text-primary-foreground hover:bg-primary/90',
                destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
                outline: 'border border-input bg-background hover:bg-muted hover:text-foreground',
                secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
                ghost: 'hover:bg-muted hover:text-foreground',
                link: 'text-primary underline-offset-4 hover:underline',
                warning: 'bg-warning text-warning-foreground hover:bg-warning/90',
                success: 'bg-success text-success-foreground hover:bg-success/90',
                info: 'bg-info text-info-foreground hover:bg-info/90',
            },
            size: {
                default: 'h-10 px-4 py-2',
                sm: 'h-9 rounded-md px-3',
                lg: 'h-11 rounded-md px-8',
                icon: 'size-10',
                'icon-sm': 'size-8',
            },
        },
        defaultVariants: { variant: 'default', size: 'default' },
    },
)

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
    VariantProps<typeof buttonVariants> & {
        asChild?: boolean
        loading?: boolean
        leftIcon?: React.ReactNode
        rightIcon?: React.ReactNode
    }

function Button({
    className,
    variant,
    size,
    asChild = false,
    loading,
    leftIcon,
    rightIcon,
    children,
    disabled,
    type,
    ...props
}: ButtonProps) {
    const Comp = asChild ? Slot : 'button'
    // Default to type="button" so buttons placed inside <form> never trigger an
    // accidental submission (which can navigate or reload). Callers can still
    // explicitly opt-in via type="submit".
    const buttonProps = !asChild ? { type: type ?? 'button' } : {}
    return (
        <Comp
            className={cn(buttonVariants({ variant, size, className }))}
            disabled={disabled || loading}
            {...buttonProps}
            {...props}
        >
            {asChild ? (
                children
            ) : (
                <>
                    {loading ? <Loader2 className="animate-spin" /> : leftIcon}
                    {children}
                    {!loading && rightIcon}
                </>
            )}
        </Comp>
    )
}

export { Button }
