import * as LabelPrimitive from '@radix-ui/react-label'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const labelVariants = cva(
    'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
)

type LabelProps = React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants> & {
        required?: boolean
    }

function Label({ className, required, children, ...props }: LabelProps) {
    return (
        <LabelPrimitive.Root className={cn(labelVariants(), className)} {...props}>
            {children}
            {required ? (
                <span aria-hidden="true" className="ml-0.5 text-destructive">
                    *
                </span>
            ) : null}
        </LabelPrimitive.Root>
    )
}

export { Label }
