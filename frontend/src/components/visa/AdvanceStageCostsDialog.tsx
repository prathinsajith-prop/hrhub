import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Receipt, ArrowRight, CheckCircle2 } from 'lucide-react'
import {
    Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogBody, toast,
} from '@/components/ui/overlays'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/form-controls'
import { DatePicker } from '@/components/ui/date-picker'
import { Badge } from '@/components/ui/badge'
import { useAdvanceVisaWithCosts } from '@/hooks/useVisa'
import { COST_CATEGORY_LABELS } from '@/hooks/useVisaCosts'
import type { CostCategory } from '@/hooks/useVisaCosts'
import { formatCurrency, cn } from '@/lib/utils'

const CATEGORIES: CostCategory[] = ['govt_fee', 'medical', 'typing', 'translation', 'other']

// Allow positive number with up to 2 decimals.
const AMOUNT_RE = /^\d+(\.\d{1,2})?$/

interface CostRow {
    category: CostCategory
    amount: string
    paidDate: string
    receiptRef: string
    description: string
}

function emptyRow(): CostRow {
    return {
        category: 'govt_fee',
        amount: '',
        paidDate: new Date().toISOString().split('T')[0] ?? '',
        receiptRef: '',
        description: '',
    }
}

const isAmountValid = (s: string) => AMOUNT_RE.test(s) && Number(s) > 0
const isAmountEmpty = (s: string) => s.trim() === ''

export interface AdvanceStageCostsDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    visaId: string
    employeeId: string
    /** 1-based step number being completed. */
    stepNumber: number
    stageLabel: string
    nextStageLabel?: string
    isFinal?: boolean
    /** Called after the server has acknowledged the advance + cost save. */
    onAdvanced?: (result: {
        advanced: boolean
        toStep: number
        toStepLabel: string
        costsCount: number
    }) => void
}

/**
 * Modal that opens before advancing a visa/PRO stage. Captures any costs
 * incurred during this stage and atomically advances via a single backend
 * call (`POST /visa/:id/advance` with `{ costs }`). The backend tags each
 * cost with the step it belongs to and writes a `visa_step_history` row,
 * so every transition has a structured audit trail in addition to
 * `activity_logs`.
 */
export function AdvanceStageCostsDialog({
    open, onOpenChange, visaId, employeeId, stepNumber,
    stageLabel, nextStageLabel, isFinal, onAdvanced,
}: AdvanceStageCostsDialogProps) {
    const advanceWithCosts = useAdvanceVisaWithCosts()
    const [rows, setRows] = useState<CostRow[]>([emptyRow()])

    useEffect(() => {
        if (open) setRows([emptyRow()])
    }, [open, stageLabel])

    const patch = (idx: number, p: Partial<CostRow>) =>
        setRows(rs => rs.map((r, i) => (i === idx ? { ...r, ...p } : r)))
    const addRow = () => setRows(rs => [...rs, emptyRow()])
    const removeRow = (idx: number) =>
        setRows(rs => (rs.length === 1 ? [emptyRow()] : rs.filter((_, i) => i !== idx)))

    const classified = useMemo(() => rows.map(r => {
        const touched = !isAmountEmpty(r.amount) || !!r.receiptRef || !!r.description
        const amountOk = isAmountValid(r.amount)
        const dateOk = !!r.paidDate
        return { row: r, touched, amountOk, dateOk, valid: amountOk && dateOk }
    }), [rows])

    const validRows = classified.filter(c => c.valid)
    const blockingInvalid = classified.some(c => c.touched && !c.valid)
    const runningTotal = validRows.reduce((s, c) => s + Number(c.row.amount), 0)
    const busy = advanceWithCosts.isPending
    const today = new Date().toISOString().split('T')[0]

    async function submit() {
        if (blockingInvalid) {
            toast.error('Each cost needs a valid amount and paid date')
            return
        }
        try {
            const res = await advanceWithCosts.mutateAsync({
                id: visaId,
                costs: validRows.map(({ row }) => ({
                    employeeId,
                    category: row.category,
                    amount: Number(row.amount),
                    paidDate: row.paidDate,
                    receiptRef: row.receiptRef || undefined,
                    description: row.description || undefined,
                })),
            })
            const t = res.transition
            if (t.advanced) {
                if (validRows.length > 0) {
                    toast.success(
                        `Advanced to ${t.toStepLabel}`,
                        `${validRows.length} cost${validRows.length === 1 ? '' : 's'} (${formatCurrency(runningTotal)}) saved against ${t.fromStepLabel}.`,
                    )
                } else {
                    toast.success(`Advanced to ${t.toStepLabel}`)
                }
            } else {
                toast.info('No advance', `Visa is already at ${t.fromStepLabel}.`)
            }
            onAdvanced?.({
                advanced: t.advanced,
                toStep: t.toStep,
                toStepLabel: t.toStepLabel,
                costsCount: validRows.length,
            })
            onOpenChange(false)
        } catch {
            // toast already raised by hook
        }
    }

    const primaryLabel = busy
        ? 'Saving…'
        : validRows.length > 0
            ? `Save ${validRows.length} cost${validRows.length === 1 ? '' : 's'} & advance`
            : 'Advance without cost'

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size="lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Receipt className="h-4 w-4 text-primary" />
                        Complete stage &amp; record costs
                    </DialogTitle>
                </DialogHeader>
                <DialogBody className="space-y-4">
                    {/* Stage transition summary */}
                    <div className="rounded-xl border bg-muted/30 p-3">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>Step {stepNumber}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">{stageLabel}</span>
                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                            {isFinal ? (
                                <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                                    <CheckCircle2 className="h-3 w-3 mr-1" /> Activate visa
                                </Badge>
                            ) : (
                                <span className="text-sm text-muted-foreground">{nextStageLabel ?? 'Next step'}</span>
                            )}
                        </div>
                    </div>

                    <p className="text-xs text-muted-foreground">
                        Costs are tagged to <span className="font-medium text-foreground">{stageLabel}</span> for full
                        per-stage history. Leave a row blank if there were none.
                    </p>

                    <div className="space-y-3">
                        {classified.map(({ row, touched, amountOk, dateOk }, idx) => {
                            const showAmountErr = touched && !isAmountEmpty(row.amount) && !amountOk
                            const showDateErr = touched && !dateOk
                            const removable = rows.length > 1 || touched
                            return (
                                <div
                                    key={idx}
                                    className={cn(
                                        'rounded-xl border bg-background p-3 space-y-3 transition-colors',
                                        showAmountErr || showDateErr ? 'border-destructive/40' : '',
                                    )}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                            Cost {idx + 1}
                                        </span>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                            onClick={() => removeRow(idx)}
                                            disabled={busy || !removable}
                                            aria-label="Remove cost row"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <Label htmlFor={`cat-${idx}`}>Category</Label>
                                            <Select
                                                value={row.category}
                                                onValueChange={v => patch(idx, { category: v as CostCategory })}
                                                disabled={busy}
                                            >
                                                <SelectTrigger id={`cat-${idx}`}><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {CATEGORIES.map(c => (
                                                        <SelectItem key={c} value={c}>{COST_CATEGORY_LABELS[c]}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor={`amt-${idx}`}>Amount (AED)</Label>
                                            <Input
                                                id={`amt-${idx}`}
                                                type="text"
                                                inputMode="decimal"
                                                placeholder="0.00"
                                                value={row.amount}
                                                onChange={e => {
                                                    const v = e.target.value
                                                    if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) patch(idx, { amount: v })
                                                }}
                                                disabled={busy}
                                                aria-invalid={showAmountErr || undefined}
                                            />
                                            {showAmountErr && (
                                                <p className="text-[11px] text-destructive">Enter a positive number (max 2 decimals)</p>
                                            )}
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor={`date-${idx}`}>Paid date</Label>
                                            <DatePicker
                                                id={`date-${idx}`}
                                                value={row.paidDate}
                                                onChange={v => patch(idx, { paidDate: v })}
                                                max={today}
                                                disabled={busy}
                                                aria-invalid={showDateErr || undefined}
                                            />
                                            {showDateErr && (
                                                <p className="text-[11px] text-destructive">Paid date is required</p>
                                            )}
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor={`ref-${idx}`}>
                                                Receipt ref <span className="text-muted-foreground font-normal">(optional)</span>
                                            </Label>
                                            <Input
                                                id={`ref-${idx}`}
                                                type="text"
                                                placeholder="INV-001"
                                                value={row.receiptRef}
                                                onChange={e => patch(idx, { receiptRef: e.target.value })}
                                                disabled={busy}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor={`desc-${idx}`}>
                                            Description <span className="text-muted-foreground font-normal">(optional)</span>
                                        </Label>
                                        <Input
                                            id={`desc-${idx}`}
                                            type="text"
                                            placeholder="e.g. GDRFA entry permit fee"
                                            value={row.description}
                                            onChange={e => patch(idx, { description: e.target.value })}
                                            disabled={busy}
                                        />
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={addRow}
                            disabled={busy}
                        >
                            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add cost
                        </Button>
                        {validRows.length > 0 && (
                            <div className="text-xs">
                                <span className="text-muted-foreground">Total: </span>
                                <span className="font-semibold tabular-nums">{formatCurrency(runningTotal)}</span>
                            </div>
                        )}
                    </div>
                </DialogBody>
                <DialogFooter className="gap-2">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={busy || blockingInvalid}>
                        {primaryLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
