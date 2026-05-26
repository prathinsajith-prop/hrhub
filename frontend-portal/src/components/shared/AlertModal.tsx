// ─── AlertModal — SweetAlert-style centered confirmation popup ──────────────
//
// A focused, opinionated dialog for moments where the app needs to
// interrupt the user with a clear question or warning. Inspired by the
// well-known SweetAlert pattern: dimmed backdrop, centered card, large
// circular icon, bold title, short body, two well-spaced action buttons.
//
// Why a separate component:
//   - Radix's Dialog primitive is general-purpose; this wrapper bakes in
//     the visual rhythm (icon-tone color, spacing, button alignment) that
//     makes alerts read consistently across the portal.
//   - Variants encode the standard semantic tones (`warning`, `info`,
//     `success`, `danger`) so call sites just say what the message means
//     instead of repeating colour values.
//
// Reusable across the portal — first use is the "location is not enabled"
// alert on the attendance check-in band, but the API is generic.

import * as React from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AlertTriangle, Info, CheckCircle2, XCircle, type LucideIcon } from 'lucide-react'

export type AlertVariant = 'warning' | 'info' | 'success' | 'danger'

interface VariantStyle {
    icon: LucideIcon
    /** Tailwind classes for the circular icon halo. */
    iconBg: string
    /** Tailwind classes for the icon glyph itself. */
    iconFg: string
    /** Tailwind variant prop for the primary action button. */
    primary: 'default' | 'destructive'
}

const VARIANTS: Record<AlertVariant, VariantStyle> = {
    warning: {
        icon: AlertTriangle,
        iconBg: 'bg-amber-100 dark:bg-amber-950/40',
        iconFg: 'text-amber-600 dark:text-amber-400',
        primary: 'default',
    },
    info: {
        icon: Info,
        iconBg: 'bg-sky-100 dark:bg-sky-950/40',
        iconFg: 'text-sky-600 dark:text-sky-400',
        primary: 'default',
    },
    success: {
        icon: CheckCircle2,
        iconBg: 'bg-emerald-100 dark:bg-emerald-950/40',
        iconFg: 'text-emerald-600 dark:text-emerald-400',
        primary: 'default',
    },
    danger: {
        icon: XCircle,
        iconBg: 'bg-rose-100 dark:bg-rose-950/40',
        iconFg: 'text-rose-600 dark:text-rose-400',
        primary: 'destructive',
    },
}

export interface AlertModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    variant?: AlertVariant
    title: string
    description?: React.ReactNode
    /** Primary action — appears on the right, styled per variant. */
    confirmLabel?: string
    onConfirm?: () => void | Promise<void>
    /** Secondary action — appears on the left as a ghost button. */
    cancelLabel?: string
    onCancel?: () => void
    /** If true, the primary button shows a spinner. */
    loading?: boolean
}

export function AlertModal({
    open,
    onOpenChange,
    variant = 'warning',
    title,
    description,
    confirmLabel = 'OK',
    onConfirm,
    cancelLabel,
    onCancel,
    loading = false,
}: AlertModalProps) {
    const v = VARIANTS[variant]
    const Icon = v.icon
    const handleCancel = () => {
        onCancel?.()
        onOpenChange(false)
    }
    const handleConfirm = async () => {
        const result = onConfirm?.()
        if (result && typeof (result as Promise<void>).then === 'function') {
            await result
        }
        onOpenChange(false)
    }
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[420px] p-0 overflow-hidden">
                <div className="px-6 pt-7 pb-5 text-center">
                    <div
                        className={cn(
                            'mx-auto size-16 rounded-full flex items-center justify-center mb-4',
                            v.iconBg,
                        )}
                    >
                        <Icon className={cn('size-8', v.iconFg)} strokeWidth={2.25} />
                    </div>
                    <h2 className="text-lg font-semibold text-foreground">{title}</h2>
                    {description && (
                        <div className="mt-2 text-sm text-muted-foreground leading-relaxed">
                            {description}
                        </div>
                    )}
                </div>
                <div className="flex items-center justify-center gap-2 px-6 pb-6">
                    {cancelLabel && (
                        <Button
                            type="button"
                            variant="ghost"
                            className="min-w-[112px]"
                            onClick={handleCancel}
                            disabled={loading}
                        >
                            {cancelLabel}
                        </Button>
                    )}
                    {onConfirm && (
                        <Button
                            type="button"
                            variant={v.primary}
                            className="min-w-[112px]"
                            onClick={handleConfirm}
                            loading={loading}
                        >
                            {confirmLabel}
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
