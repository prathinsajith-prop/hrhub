import { useMemo, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { ArrowRight, Check, ClipboardCheck, ShieldCheck, X } from 'lucide-react'

import { ApiError } from '@/lib/api'
import {
    CATEGORY_LABELS,
    FIELD_LABELS,
    useApproveChangeRequest,
    usePendingChangeRequests,
    useRejectChangeRequest,
    type PendingChangeRequest,
} from '@/hooks/useProfileChanges'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { cn, formatDate } from '@/lib/utils'

/**
 * Manager-side approval queue for employee-submitted profile changes. Each
 * card surfaces the side-by-side diff (current → proposed) of every changed
 * field. The reviewer must tick the "Verified" checkbox on every changed
 * field before the Approve button enables — that's the explicit
 * "check-and-verify" workflow the user asked for.
 */
export function ManagerProfileApprovalsPage() {
    const { data, isLoading } = usePendingChangeRequests()
    const items = data ?? []
    const [rejectTarget, setRejectTarget] = useState<PendingChangeRequest | null>(null)

    return (
        <div className="space-y-5">
            <PageHeader
                title="Profile change approvals"
                subtitle={items.length > 0 ? `${items.length} awaiting review` : undefined}
            />

            {isLoading ? (
                <div className="space-y-3">
                    <Skeleton className="h-40" />
                    <Skeleton className="h-40" />
                </div>
            ) : items.length === 0 ? (
                <EmptyState
                    icon={<ClipboardCheck className="size-8" />}
                    title="No profile changes awaiting your review"
                    description="When a team member updates their bank or contact details, they'll appear here."
                />
            ) : (
                <div className="space-y-3">
                    {items.map((req) => (
                        <RequestCard
                            key={req.id}
                            request={req}
                            onRejectClick={() => setRejectTarget(req)}
                        />
                    ))}
                </div>
            )}

            <RejectDialog target={rejectTarget} onClose={() => setRejectTarget(null)} />
        </div>
    )
}

function RequestCard({
    request,
    onRejectClick,
}: {
    request: PendingChangeRequest
    onRejectClick: () => void
}) {
    const approve = useApproveChangeRequest()

    const changedFields = useMemo(
        () =>
            Object.keys(request.proposedChanges).filter(
                (k) => (request.currentSnapshot[k] ?? null) !== (request.proposedChanges[k] ?? null),
            ),
        [request],
    )

    const [verified, setVerified] = useState<Record<string, boolean>>({})
    const [notes, setNotes] = useState('')
    const allVerified = changedFields.length > 0 && changedFields.every((f) => verified[f])

    function toggle(field: string) {
        setVerified((p) => ({ ...p, [field]: !p[field] }))
    }

    function onApprove() {
        if (!allVerified) return
        approve.mutate(
            {
                id: request.id,
                verifiedFields: changedFields,
                reviewerNotes: notes.trim() || undefined,
            },
            {
                onSuccess: () => toast.success(`${CATEGORY_LABELS[request.category]} approved`),
                onError: (err) =>
                    toast.error(err instanceof ApiError ? err.message : 'Approval failed'),
            },
        )
    }

    return (
        <Card className="border-border/70">
            <CardContent className="p-4">
                {/* ── Header ────────────────────────────────────────────── */}
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold">
                                {request.employeeName ?? 'Unknown employee'}
                            </span>
                            <Badge variant="outline" className="text-[10px]">
                                {CATEGORY_LABELS[request.category]}
                            </Badge>
                            <Badge className="border-0 bg-sky-100 text-[10px] uppercase tracking-wider text-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
                                pending
                            </Badge>
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {request.employeeNo ? `#${request.employeeNo}` : ''}
                            {request.employeeDepartment ? ` · ${request.employeeDepartment}` : ''}
                            {` · Submitted ${formatDate(request.createdAt)}`}
                        </p>
                    </div>
                </div>

                {/* ── Field-by-field diff with checkbox-verify ─────────── */}
                <div className="space-y-2 border-t border-border/60 pt-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <ShieldCheck className="size-3.5" />
                        Verify each change before approving
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

                {/* ── Reviewer notes ──────────────────────────────────── */}
                <div className="mt-3 space-y-1.5">
                    <Label htmlFor={`notes-${request.id}`} className="text-xs font-medium text-muted-foreground">
                        Notes <span className="text-[10px] font-normal">(optional)</span>
                    </Label>
                    <Textarea
                        id={`notes-${request.id}`}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={2}
                        placeholder="Verification notes"
                        className="resize-none text-sm"
                    />
                </div>

                {/* ── Actions ─────────────────────────────────────────── */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                    <p className="text-[11px] text-muted-foreground">
                        {allVerified ? (
                            <span className="font-medium text-emerald-700 dark:text-emerald-300">
                                All fields verified, ready to approve
                            </span>
                        ) : (
                            <>
                                {Object.values(verified).filter(Boolean).length} of {changedFields.length} fields verified
                            </>
                        )}
                    </p>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={onRejectClick} disabled={approve.isPending}>
                            <X className="size-4" /> Reject
                        </Button>
                        <Button
                            size="sm"
                            onClick={onApprove}
                            loading={approve.isPending}
                            disabled={!allVerified}
                        >
                            <Check className="size-4" /> Approve & apply
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
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
                'flex cursor-pointer items-start gap-3 rounded-lg border bg-card/40 p-3 transition-colors',
                verified ? 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-800/60 dark:bg-emerald-950/20' : 'border-border hover:bg-card/70',
            )}
        >
            <input
                type="checkbox"
                checked={verified}
                onChange={onToggle}
                className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-border accent-emerald-600"
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
                    <ArrowRight className="size-3 text-muted-foreground" />
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

function RejectDialog({
    target,
    onClose,
}: {
    target: PendingChangeRequest | null
    onClose: () => void
}) {
    const reject = useRejectChangeRequest()
    const [reason, setReason] = useState('')

    function onSubmit(e: FormEvent) {
        e.preventDefault()
        if (!target) return
        const trimmed = reason.trim()
        if (!trimmed) {
            toast.error('Please provide a reason')
            return
        }
        reject.mutate(
            { id: target.id, reason: trimmed },
            {
                onSuccess: () => {
                    toast.success('Change request rejected')
                    setReason('')
                    onClose()
                },
                onError: (err) =>
                    toast.error(err instanceof ApiError ? err.message : 'Rejection failed'),
            },
        )
    }

    return (
        <Dialog open={!!target} onOpenChange={(v) => { if (!v) { setReason(''); onClose() } }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Reject change request</DialogTitle>
                    {target ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            Tell {target.employeeName ?? 'the employee'} why their{' '}
                            {CATEGORY_LABELS[target.category].toLowerCase()} update was rejected.
                        </p>
                    ) : null}
                </DialogHeader>
                <form onSubmit={onSubmit} className="space-y-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="pcr-reject-reason">Reason *</Label>
                        <Input
                            id="pcr-reject-reason"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Reason for rejection"
                            required
                        />
                    </div>
                    <DialogFooter className="gap-2">
                        <Button type="button" variant="ghost" onClick={onClose} disabled={reject.isPending}>
                            Cancel
                        </Button>
                        <Button type="submit" variant="destructive" loading={reject.isPending}>
                            Reject request
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
