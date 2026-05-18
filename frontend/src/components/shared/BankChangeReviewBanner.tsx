import { useMemo, useState, type FormEvent } from 'react'
import { ArrowRight, Check, Clock, ShieldCheck, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ApiError } from '@/lib/api'
import { toast } from '@/components/ui/overlays'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
    FIELD_LABELS,
    useApproveProfileChange,
    useProfileChangeHistory,
    useRejectProfileChange,
    type ProfileChangeRequest,
} from '@/hooks/useProfileChanges'

interface Props {
    employeeId: string
    /** Auto-open the review dialog when this id matches the pending request. */
    autoOpenRequestId?: string | null
}

/**
 * Renders inside the Bank Details card on EmployeeDetailPage. If the employee
 * has a pending profile change request (bank category), shows a sticky banner
 * with the changed-field count and a "Review & approve" button. Clicking
 * opens a dialog with the field-by-field diff and the checkbox-verify gate.
 *
 * Hidden when there's nothing pending — zero visual weight at rest.
 */
export function BankChangeReviewBanner({ employeeId, autoOpenRequestId }: Props) {
    const { data } = useProfileChangeHistory({ employeeId, status: 'pending' })
    const pending = useMemo(
        () => (data ?? []).find((r) => r.category === 'bank_details') ?? null,
        [data],
    )

    // Auto-open when the user navigated in via the notification deep-link.
    const [forceOpen, setForceOpen] = useState<string | null>(null)
    const shouldAutoOpen =
        autoOpenRequestId && pending && pending.id === autoOpenRequestId && forceOpen !== pending.id
    if (shouldAutoOpen && pending) setForceOpen(pending.id)

    const [open, setOpen] = useState(false)
    const isOpen = open || forceOpen === pending?.id

    if (!pending) return null

    const changedCount = countChanges(pending)

    return (
        <>
            <div className="flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 p-3 dark:border-sky-900/60 dark:bg-sky-950/30">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-300" />
                <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-sky-900 dark:text-sky-100">
                        Bank details update pending review
                    </div>
                    <p className="mt-0.5 text-xs text-sky-800/80 dark:text-sky-200/80">
                        {pending.employeeName ?? 'Employee'} submitted {changedCount}{' '}
                        {changedCount === 1 ? 'field' : 'fields'} for approval.
                    </p>
                </div>
                <Button size="sm" onClick={() => setOpen(true)}>
                    Review &amp; approve
                </Button>
            </div>

            {isOpen ? (
                <ReviewDialog
                    request={pending}
                    onClose={() => {
                        setOpen(false)
                        setForceOpen(null)
                    }}
                />
            ) : null}
        </>
    )
}

function countChanges(req: ProfileChangeRequest): number {
    return Object.keys(req.proposedChanges).filter(
        (k) => (req.currentSnapshot[k] ?? null) !== (req.proposedChanges[k] ?? null),
    ).length
}

function ReviewDialog({ request, onClose }: { request: ProfileChangeRequest; onClose: () => void }) {
    const approve = useApproveProfileChange()
    const reject = useRejectProfileChange()

    const changedFields = useMemo(
        () =>
            Object.keys(request.proposedChanges).filter(
                (k) => (request.currentSnapshot[k] ?? null) !== (request.proposedChanges[k] ?? null),
            ),
        [request],
    )

    const [verified, setVerified] = useState<Record<string, boolean>>({})
    const [notes, setNotes] = useState('')
    const [rejectMode, setRejectMode] = useState(false)
    const [rejectReason, setRejectReason] = useState('')

    const allVerified = changedFields.length > 0 && changedFields.every((f) => verified[f])

    function toggle(field: string) {
        setVerified((p) => ({ ...p, [field]: !p[field] }))
    }

    function onApprove() {
        if (!allVerified) return
        approve.mutate(
            { id: request.id, verifiedFields: changedFields, reviewerNotes: notes.trim() || undefined },
            {
                onSuccess: () => {
                    toast.success('Approved', 'Bank details applied to the employee record')
                    onClose()
                },
                onError: (err) =>
                    toast.error('Approval failed', err instanceof ApiError ? err.message : 'Unknown error'),
            },
        )
    }

    function onReject(e: FormEvent) {
        e.preventDefault()
        const reason = rejectReason.trim()
        if (!reason) {
            toast.error('Reason required', 'Tell the employee why this was rejected.')
            return
        }
        reject.mutate(
            { id: request.id, reason },
            {
                onSuccess: () => {
                    toast.success('Rejected', 'Change request rejected.')
                    onClose()
                },
                onError: (err) =>
                    toast.error('Rejection failed', err instanceof ApiError ? err.message : 'Unknown error'),
            },
        )
    }

    return (
        <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Review bank details change</DialogTitle>
                </DialogHeader>

                {rejectMode ? (
                    <form onSubmit={onReject} className="space-y-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="pcr-reject-reason">Reason *</Label>
                            <Input
                                id="pcr-reject-reason"
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                placeholder="e.g. IBAN didn't match the bank certificate"
                                required
                            />
                        </div>
                        <DialogFooter className="gap-2">
                            <Button type="button" variant="ghost" onClick={() => setRejectMode(false)} disabled={reject.isPending}>
                                Back
                            </Button>
                            <Button type="submit" variant="destructive" loading={reject.isPending}>
                                Reject request
                            </Button>
                        </DialogFooter>
                    </form>
                ) : (
                    <>
                        <div className="space-y-2">
                            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                <ShieldCheck className="h-3.5 w-3.5" /> Verify each change before approving
                            </div>
                            {changedFields.map((f) => (
                                <FieldDiff
                                    key={f}
                                    field={f}
                                    current={request.currentSnapshot[f] ?? null}
                                    proposed={request.proposedChanges[f] ?? null}
                                    verified={!!verified[f]}
                                    onToggle={() => toggle(f)}
                                />
                            ))}
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="pcr-notes" className="text-xs text-muted-foreground">
                                Notes <span className="text-[10px] font-normal">(optional)</span>
                            </Label>
                            <Textarea
                                id="pcr-notes"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                rows={2}
                                placeholder="e.g. Confirmed against IBAN letter received 18 May"
                                className="resize-none text-sm"
                            />
                        </div>

                        <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
                            <p className="text-[11px] text-muted-foreground">
                                {allVerified ? (
                                    <span className="font-medium text-emerald-700 dark:text-emerald-300">
                                        All fields verified
                                    </span>
                                ) : (
                                    <>{Object.values(verified).filter(Boolean).length} of {changedFields.length} verified</>
                                )}
                            </p>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => setRejectMode(true)}>
                                    <X className="h-4 w-4" /> Reject
                                </Button>
                                <Button size="sm" onClick={onApprove} loading={approve.isPending} disabled={!allVerified}>
                                    <Check className="h-4 w-4" /> Approve &amp; apply
                                </Button>
                            </div>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}

function FieldDiff({
    field,
    current,
    proposed,
    verified,
    onToggle,
}: {
    field: string
    current: string | null
    proposed: string | null
    verified: boolean
    onToggle: () => void
}) {
    return (
        <label
            className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                verified
                    ? 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-800/60 dark:bg-emerald-950/20'
                    : 'border-border hover:bg-muted/30',
            )}
        >
            <input
                type="checkbox"
                checked={verified}
                onChange={onToggle}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-emerald-600"
                aria-label={`Verify ${FIELD_LABELS[field] ?? field}`}
            />
            <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {FIELD_LABELS[field] ?? field}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded bg-muted px-2 py-0.5 font-mono text-foreground/70">
                        {current ?? <em className="text-muted-foreground">empty</em>}
                    </span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span
                        className={cn(
                            'rounded px-2 py-0.5 font-mono font-semibold',
                            verified
                                ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200'
                                : 'bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200',
                        )}
                    >
                        {proposed ?? <em className="italic">cleared</em>}
                    </span>
                </div>
            </div>
        </label>
    )
}
