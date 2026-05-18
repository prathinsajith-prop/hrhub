import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'

type Variant = 'destructive' | 'warning' | 'default'

const VARIANT_TONE: Record<Variant, { bg: string; icon: string }> = {
    destructive: { bg: 'bg-rose-100 dark:bg-rose-950/40', icon: 'text-rose-700 dark:text-rose-300' },
    warning: { bg: 'bg-amber-100 dark:bg-amber-950/40', icon: 'text-amber-700 dark:text-amber-300' },
    default: { bg: 'bg-indigo-100 dark:bg-indigo-950/40', icon: 'text-indigo-700 dark:text-indigo-300' },
}

/**
 * Generic confirm dialog used by destructive actions across the portal
 * (cancel leave, reject approval, etc.) so users get a "Are you sure?" beat
 * before an irreversible operation runs.
 */
export function ConfirmDialog({
    open,
    onOpenChange,
    title,
    description,
    confirmLabel,
    cancelLabel,
    onConfirm,
    loading,
    variant = 'destructive',
}: {
    open: boolean
    onOpenChange: (v: boolean) => void
    title: string
    description?: string
    confirmLabel?: string
    cancelLabel?: string
    onConfirm: () => void
    loading?: boolean
    variant?: Variant
}) {
    const { t } = useTranslation()
    const tone = VARIANT_TONE[variant]
    const buttonVariant = variant === 'destructive' ? 'destructive' : 'default'
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <div className="mx-auto mb-1 flex size-12 items-center justify-center rounded-2xl">
                        <span className={`flex size-12 items-center justify-center rounded-2xl ${tone.bg} ${tone.icon}`}>
                            <AlertTriangle className="size-6" />
                        </span>
                    </div>
                    <DialogTitle className="text-center">{title}</DialogTitle>
                </DialogHeader>
                {description ? (
                    <p className="text-center text-sm text-muted-foreground">{description}</p>
                ) : null}
                <DialogFooter className="sm:justify-center">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                        {cancelLabel ?? t('common.cancel')}
                    </Button>
                    <Button type="button" variant={buttonVariant} onClick={onConfirm} loading={loading}>
                        {confirmLabel ?? t('common.submit')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
