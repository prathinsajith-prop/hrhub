import { useEffect, useState } from 'react'
import {
    Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogBody, DialogDescription,
} from '@/components/ui/overlays'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NumericInput } from '@/components/ui/numeric-input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

export interface PromptDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    description?: string
    label?: string
    placeholder?: string
    defaultValue?: string
    confirmLabel?: string
    cancelLabel?: string
    /** When true, renders a multi-line textarea instead of a single-line input. */
    multiline?: boolean
    /** When true, allows submitting an empty string. Defaults to false. */
    allowEmpty?: boolean
    inputType?: 'text' | 'number'
    /** Minimum allowed value when `inputType='number'`. */
    min?: number
    /** Maximum allowed value when `inputType='number'`. */
    max?: number
    /** When `inputType='number'`, only accept whole numbers. */
    integer?: boolean
    /** Helper hint displayed below the input. */
    hint?: string
    submitting?: boolean
    onSubmit: (value: string) => void | Promise<void>
}

/**
 * Drop-in replacement for `window.prompt()` that uses the design system dialog.
 *
 * For `inputType='number'` the dialog uses our `NumericInput` (no native
 * spinners, no `e`/`+`/`-` accepted unless `min < 0`) and enforces `min`/`max`
 * bounds inline so the user gets immediate feedback before submission.
 */
export function PromptDialog({
    open, onOpenChange, title, description, label, placeholder,
    defaultValue = '', confirmLabel = 'Save', cancelLabel = 'Cancel',
    multiline, allowEmpty = false, inputType = 'text', min, max, integer,
    hint, submitting, onSubmit,
}: PromptDialogProps) {
    const [value, setValue] = useState(defaultValue)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (open) {
            setValue(defaultValue)
            setError(null)
        }
    }, [open, defaultValue])

    function validateNumber(s: string): string | null {
        if (s.trim() === '') return allowEmpty ? null : 'A value is required'
        const n = Number(s)
        if (!Number.isFinite(n)) return 'Enter a valid number'
        if (integer && !Number.isInteger(n)) return 'Enter a whole number'
        if (typeof min === 'number' && n < min) return `Minimum is ${min}`
        if (typeof max === 'number' && n > max) return `Maximum is ${max}`
        return null
    }

    const trimmed = value.trim()
    const numberError = inputType === 'number' ? validateNumber(value) : null
    const canSubmit = !submitting && !numberError && (allowEmpty || trimmed.length > 0)

    async function handleSubmit() {
        if (numberError) {
            setError(numberError)
            return
        }
        if (!canSubmit) return
        await onSubmit(allowEmpty ? value : trimmed)
    }

    function handleNumberChange(v: string) {
        setValue(v)
        setError(null)
    }

    const allowNegative = typeof min === 'number' && min < 0

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    {description && <DialogDescription>{description}</DialogDescription>}
                </DialogHeader>
                <DialogBody className="space-y-2">
                    {label && (
                        <Label htmlFor="prompt-dialog-input" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            {label}
                        </Label>
                    )}
                    {multiline ? (
                        <Textarea
                            id="prompt-dialog-input"
                            value={value}
                            onChange={e => setValue(e.target.value)}
                            placeholder={placeholder}
                            rows={3}
                            disabled={submitting}
                            autoFocus
                        />
                    ) : inputType === 'number' ? (
                        <NumericInput
                            id="prompt-dialog-input"
                            value={value}
                            decimal={!integer}
                            allowNegative={allowNegative}
                            onChange={e => handleNumberChange(e.target.value)}
                            placeholder={placeholder}
                            disabled={submitting}
                            autoFocus
                            aria-invalid={!!error || undefined}
                            onKeyDown={e => {
                                if (e.key === 'Enter') {
                                    e.preventDefault()
                                    void handleSubmit()
                                }
                            }}
                        />
                    ) : (
                        <Input
                            id="prompt-dialog-input"
                            type="text"
                            value={value}
                            onChange={e => setValue(e.target.value)}
                            placeholder={placeholder}
                            disabled={submitting}
                            autoFocus
                            onKeyDown={e => {
                                if (e.key === 'Enter') {
                                    e.preventDefault()
                                    void handleSubmit()
                                }
                            }}
                        />
                    )}
                    {error ? (
                        <p className="text-[11px] text-destructive pt-0.5">{error}</p>
                    ) : hint ? (
                        <p className="text-[11px] text-muted-foreground pt-0.5">{hint}</p>
                    ) : null}
                </DialogBody>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
                        {cancelLabel}
                    </Button>
                    <Button onClick={handleSubmit} disabled={!canSubmit}>
                        {submitting ? 'Saving…' : confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
