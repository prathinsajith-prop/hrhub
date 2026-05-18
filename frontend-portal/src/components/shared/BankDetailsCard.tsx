import { useMemo, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, Clock, History, Landmark, Pencil, XCircle } from 'lucide-react'

import { ApiError } from '@/lib/api'
import {
    CATEGORY_FIELDS,
    FIELD_LABELS,
    useMyChangeRequests,
    useSubmitChangeRequest,
    type ChangeRequest,
} from '@/hooks/useProfileChanges'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { cn, formatDate } from '@/lib/utils'
import type { Employee } from '@/types'

const BANK_FIELDS = CATEGORY_FIELDS.bank_details

/**
 * Bank details card on the employee Profile. Read-only by default; the
 * employee opens a dialog to propose changes, which submits as a `pending`
 * change request rather than writing directly to their record. The card
 * also surfaces the pending request inline ("Awaiting manager review")
 * and a history accordion of past approvals/rejections.
 */
export function BankDetailsCard({ employee }: { employee: Employee }) {
    const { data: history } = useMyChangeRequests()
    const [editing, setEditing] = useState(false)
    const [showHistory, setShowHistory] = useState(false)

    // Bucket the bank-details requests into pending / past in a single pass —
    // the inputs are small but this avoids re-running three array methods on
    // every render, and keeps the dependency stable.
    const { pending, past } = useMemo(() => {
        let pending: ChangeRequest | null = null
        const past: ChangeRequest[] = []
        for (const r of history ?? []) {
            if (r.category !== 'bank_details') continue
            if (r.status === 'pending') {
                if (!pending) pending = r
            } else {
                past.push(r)
            }
        }
        return { pending, past }
    }, [history])

    return (
        <>
            <Card className="overflow-hidden border-border/70">
                <CardContent className="p-5">
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            <Landmark className="size-3.5" /> Bank details
                        </h3>
                        {!pending ? (
                            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                                <Pencil className="size-3.5" /> Edit
                            </Button>
                        ) : null}
                    </div>

                    {pending ? <PendingBanner request={pending} /> : null}

                    <div className="grid gap-4 sm:grid-cols-2">
                        {BANK_FIELDS.map((f) => (
                            <Field
                                key={f}
                                label={FIELD_LABELS[f] ?? f}
                                value={(employee as unknown as Record<string, string | null>)[f] ?? '—'}
                                pendingValue={pending ? pending.proposedChanges[f] : undefined}
                            />
                        ))}
                    </div>

                    {past.length > 0 ? (
                        <div className="mt-4 border-t border-border/60 pt-3">
                            <button
                                type="button"
                                onClick={() => setShowHistory((s) => !s)}
                                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                            >
                                <History className="size-3.5" />
                                {showHistory ? 'Hide' : 'View'} change history
                                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">{past.length}</span>
                            </button>
                            {showHistory ? <HistoryList items={past} /> : null}
                        </div>
                    ) : null}
                </CardContent>
            </Card>

            {editing ? (
                <EditBankDialog
                    onClose={() => setEditing(false)}
                    employee={employee}
                />
            ) : null}
        </>
    )
}

function Field({ label, value, pendingValue }: { label: string; value: string; pendingValue?: string | null | undefined }) {
    const isProposed = pendingValue !== undefined
    return (
        <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className={cn('mt-1 break-words text-sm font-medium', isProposed && 'text-muted-foreground line-through')}>
                {value}
            </div>
            {isProposed ? (
                <div className="mt-0.5 text-xs font-medium text-sky-700 dark:text-sky-300">
                    → {pendingValue ?? <em className="italic">cleared</em>}
                </div>
            ) : null}
        </div>
    )
}

function PendingBanner({ request }: { request: ChangeRequest }) {
    const changedCount = Object.keys(request.proposedChanges).filter(
        (k) => (request.currentSnapshot[k] ?? null) !== (request.proposedChanges[k] ?? null),
    ).length
    return (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs dark:border-sky-900/60 dark:bg-sky-950/30">
            <Clock className="mt-0.5 size-3.5 shrink-0 text-sky-600 dark:text-sky-300" />
            <div className="flex-1">
                <div className="font-semibold text-sky-800 dark:text-sky-200">Awaiting manager approval</div>
                <div className="text-sky-700/80 dark:text-sky-300/80">
                    {changedCount} {changedCount === 1 ? 'field' : 'fields'} submitted on {formatDate(request.createdAt)}
                </div>
            </div>
        </div>
    )
}

function HistoryList({ items }: { items: ChangeRequest[] }) {
    return (
        <ul className="mt-3 space-y-2">
            {items.map((r) => (
                <HistoryRow key={r.id} request={r} />
            ))}
        </ul>
    )
}

function HistoryRow({ request }: { request: ChangeRequest }) {
    const approved = request.status === 'approved'
    const changedFields = Object.keys(request.proposedChanges).filter(
        (k) => (request.currentSnapshot[k] ?? null) !== (request.proposedChanges[k] ?? null),
    )
    return (
        <li className="rounded-md border border-border/60 bg-card/40 p-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-2">
                <Badge
                    className={cn(
                        'border-0 text-[10px] uppercase tracking-wider',
                        approved
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
                    )}
                >
                    {approved ? <CheckCircle2 className="mr-1 size-2.5" /> : <XCircle className="mr-1 size-2.5" />}
                    {request.status}
                </Badge>
                <span className="text-muted-foreground">
                    {formatDate(request.reviewedAt ?? request.updatedAt)}
                </span>
            </div>
            <div className="mt-1 text-muted-foreground/90">
                {changedFields.map((f) => FIELD_LABELS[f] ?? f).join(', ')}
            </div>
            {!approved && request.rejectionReason ? (
                <div className="mt-1 italic text-rose-700 dark:text-rose-300">"{request.rejectionReason}"</div>
            ) : null}
        </li>
    )
}

function EditBankDialog({
    onClose,
    employee,
}: {
    onClose: () => void
    employee: Employee
}) {
    const submit = useSubmitChangeRequest()
    const empAsRecord = employee as unknown as Record<string, string | null>

    // Mounted only while open, so state initialiser captures the latest values
    // — no syncing effect needed.
    const initialValues = useMemo(() => {
        const o: Record<string, string> = {}
        for (const f of BANK_FIELDS) o[f] = empAsRecord[f] ?? ''
        return o
    }, [empAsRecord])

    const [form, setForm] = useState<Record<string, string>>(initialValues)

    function onChange(field: string, value: string) {
        setForm((p) => ({ ...p, [field]: value }))
    }

    function onSubmit(e: FormEvent) {
        e.preventDefault()
        // Send only fields that actually differ from the current value.
        const changes: Record<string, string | null> = {}
        for (const f of BANK_FIELDS) {
            const current = empAsRecord[f] ?? ''
            const next = form[f] ?? ''
            if (current.trim() === next.trim()) continue
            changes[f] = next.trim() === '' ? null : next.trim()
        }
        if (Object.keys(changes).length === 0) {
            toast.info('No changes to submit')
            return
        }
        submit.mutate(
            { category: 'bank_details', changes },
            {
                onSuccess: () => {
                    toast.success('Sent for manager approval')
                    onClose()
                },
                onError: (err) =>
                    toast.error(err instanceof ApiError ? err.message : 'Could not submit changes'),
            },
        )
    }

    return (
        <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Edit bank details</DialogTitle>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        Your manager will verify the new values before they're saved on your record.
                    </p>
                </DialogHeader>
                <form onSubmit={onSubmit} className="space-y-3">
                    {BANK_FIELDS.map((f) => (
                        <div key={f} className="space-y-1.5">
                            <Label htmlFor={`bank-${f}`} className="text-sm font-medium">
                                {FIELD_LABELS[f] ?? f}
                            </Label>
                            <Input
                                id={`bank-${f}`}
                                value={form[f] ?? ''}
                                onChange={(e) => onChange(f, e.target.value)}
                            />
                        </div>
                    ))}
                    <DialogFooter className="gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onClose()}
                            disabled={submit.isPending}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" loading={submit.isPending}>
                            Submit for approval
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
