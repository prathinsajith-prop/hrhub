import type { ReactNode } from 'react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export interface FormFieldProps {
    label?: ReactNode
    required?: boolean
    error?: string | undefined
    hint?: ReactNode
    className?: string
    children: ReactNode
    htmlFor?: string
}

/**
 * Wraps a form control with label + error/hint text. Pass the error from
 * local validation or a mapped ApiError to display a red message inline.
 */
export function FormField({ label, required, error, hint, className, children, htmlFor }: FormFieldProps) {
    return (
        <div
            className={cn('space-y-1.5', className)}
            data-invalid={error ? 'true' : undefined}
        >
            {label && (
                <Label
                    htmlFor={htmlFor}
                    className={cn(
                        'flex items-center gap-1',
                        error && 'text-destructive',
                    )}
                >
                    <span>{label}</span>
                    {required && <span className="text-destructive">*</span>}
                </Label>
            )}
            {children}
            {error ? (
                <p className="text-xs text-destructive leading-tight" role="alert">
                    {error}
                </p>
            ) : hint ? (
                <p className="text-xs text-muted-foreground leading-tight">{hint}</p>
            ) : null}
        </div>
    )
}
