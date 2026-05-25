// ─── Exit Detail Wizard ──────────────────────────────────────────────────────
// Stepper view of a single in-flight exit. Replaces the long-scroll dialog
// with a 5-stage wizard so HR can work through Submitted → Clearance →
// Interview → Approval → Settlement in order, with explicit Previous / Next
// navigation.
//
// Form state is non-persistent for now — each stage either shows
// information or routes to an action (approve / reject / mark paid). The
// per-step cards from the previous design are preserved as the body content
// of each stage; the surrounding dialog chrome adds the stepper rail and
// the prev/next footer.

import { useRef, useState } from 'react'
import {
    CalendarDays,
    ListChecks,
    MessageSquare,
    CheckCircle2,
    DollarSign,
    ChevronLeft,
    ChevronRight,
    AlertTriangle,
    Check,
    XCircle,
    FileText,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/overlays'
import { InitialsAvatar } from '@/components/shared/Avatar'
import {
    useApproveExit,
    useRejectExit,
    useMarkSettlementPaid,
    useExitApprovalReadiness,
    type ExitRequest,
} from '@/hooks/useExit'
import { ExitClearancePanel } from './ExitClearancePanel'
import { ExitInterviewSection, type ExitInterviewSectionHandle } from './ExitInterviewSection'
import { ExitStagesTimeline } from './ExitStagesTimeline'
import { usePermissions } from '@/hooks/usePermissions'
import { formatDate, formatCurrency, cn } from '@/lib/utils'
import { ApiError } from '@/lib/api'
import { EXIT_TYPE_LABELS } from '@/lib/enums'

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: string | number | undefined | null) {
    if (n === undefined || n === null) return '—'
    const num = Number(n)
    if (Number.isNaN(num)) return '—'
    return formatCurrency(num)
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
    // Stack label + value on the smallest viewports so neither gets crushed.
    // Switches to the side-by-side grid from sm: upward (≥640px).
    return (
        <div className="flex flex-col gap-0.5 sm:grid sm:grid-cols-[110px_1fr] md:grid-cols-[140px_1fr] py-2 border-b last:border-b-0 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium">{value}</span>
        </div>
    )
}

const exitTypeColor: Record<string, string> = {
    resignation: 'bg-amber-100 text-amber-700',
    termination: 'bg-red-100 text-red-700',
    contract_end: 'bg-blue-100 text-blue-700',
    retirement: 'bg-emerald-100 text-emerald-700',
}

const statusVariant: Record<string, 'success' | 'warning' | 'destructive' | 'info' | 'secondary'> = {
    pending: 'warning',
    approved: 'info',
    rejected: 'destructive',
    completed: 'success',
}

// ─── Step definitions ──────────────────────────────────────────────────────

type StepKey = 'info' | 'clearance' | 'interview' | 'approval' | 'settlement'

interface StepDef {
    key: StepKey
    label: string
    icon: React.ElementType
    description: string
}

const STEPS: StepDef[] = [
    { key: 'info', label: 'Exit Information', icon: CalendarDays, description: 'The details captured when the exit was initiated.' },
    { key: 'clearance', label: 'Clearance', icon: ListChecks, description: 'Tasks owners need to complete before relieving date.' },
    { key: 'interview', label: 'Exit Interview', icon: MessageSquare, description: 'Configured questions and the employee\'s responses.' },
    { key: 'approval', label: 'Approval', icon: CheckCircle2, description: 'HR sign-off. Blocked until all clearances complete.' },
    { key: 'settlement', label: 'Settlement', icon: DollarSign, description: 'UAE Labour Law breakdown and final payment.' },
]

/**
 * Computes whether a wizard step has been "completed" — used to turn the
 * pill above emerald. Driven by the same data the big timeline uses so the
 * two views never disagree.
 *   • info       — always considered done (it's just read-only context)
 *   • clearance  — every clearance item terminal OR no items configured
 *   • interview  — required questions all answered (or none required)
 *   • approval   — status moved past pending (approved/completed)
 *   • settlement — settlementPaid is true
 */
function isStepDone(
    key: StepDef['key'],
    exit: ExitRequest,
    readiness: { interviewRequired: boolean; pendingRequiredQuestions: string[] } | null | undefined,
): boolean {
    if (key === 'info') return true
    if (key === 'clearance') {
        const total = exit.clearanceTotal ?? 0
        const done = exit.clearanceCompleted ?? 0
        return total === 0 || done >= total
    }
    if (key === 'interview') {
        if (!readiness) return !!exit.interviewSubmitted
        if (!readiness.interviewRequired) return true
        return readiness.pendingRequiredQuestions.length === 0
    }
    if (key === 'approval') {
        return exit.status === 'approved' || exit.status === 'completed'
    }
    if (key === 'settlement') {
        return !!exit.settlementPaid
    }
    return false
}

// ─── Wizard component ──────────────────────────────────────────────────────

export function ExitDetailWizard({
    exit,
    open,
    onClose,
    onRequestReject,
    onRequestForceApprove,
}: {
    exit: ExitRequest
    open: boolean
    onClose: () => void
    onRequestReject: () => void
    onRequestForceApprove: () => void
}) {
    const { can } = usePermissions()
    const canManage = can('manage_exit')
    const approve = useApproveExit()
    const _reject = useRejectExit() // (rejection dialog is owned by the parent; this hook is unused here but kept for clarity)
    void _reject
    const markPaid = useMarkSettlementPaid()

    const readinessQ = useExitApprovalReadiness(exit.status === 'pending' ? exit.id : null)
    const readiness = readinessQ.data

    const [stepIndex, setStepIndex] = useState(0)
    const currentStep = STEPS[stepIndex]
    const isFirst = stepIndex === 0
    const isLast = stepIndex === STEPS.length - 1

    // Per-step ref handle for steps that hold unsaved local edits. Today
    // only the interview step has a dirty-buffer; clearance changes save
    // per-item immediately. Wizard's Save & Next consults this before
    // advancing. `interviewDirty` mirrors the ref's dirty flag so the
    // button label can rerender ("Next" → "Save & Next") without React
    // touching the ref during render (which the linter forbids).
    const interviewRef = useRef<ExitInterviewSectionHandle>(null)
    const [interviewDirty, setInterviewDirty] = useState(false)
    const [advancing, setAdvancing] = useState(false)

    async function advance() {
        // If the active step has unsaved edits, flush them first. We only
        // block forward navigation on failed save — if persist returns
        // false, the section has already toast'd the error.
        setAdvancing(true)
        try {
            if (currentStep.key === 'interview' && interviewRef.current?.isDirty()) {
                const ok = await interviewRef.current.save()
                if (!ok) return
            }
            setStepIndex((i) => Math.min(STEPS.length - 1, i + 1))
        } finally {
            setAdvancing(false)
        }
    }

    // Reset to step 1 each time the dialog opens against a different exit.
    const [lastExitId, setLastExitId] = useState<string | null>(null)
    if (open && exit.id !== lastExitId) {
        setLastExitId(exit.id)
        setStepIndex(0)
    }

    function jumpTo(key: StepKey) {
        const idx = STEPS.findIndex(s => s.key === key)
        if (idx >= 0) setStepIndex(idx)
    }

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
            <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileText className="size-4" /> Exit Request — {currentStep.label}
                    </DialogTitle>
                    <DialogDescription>{currentStep.description}</DialogDescription>
                </DialogHeader>

                {/* Employee header */}
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border">
                    <InitialsAvatar name={exit.employeeName ?? '—'} src={exit.employeeAvatarUrl ?? undefined} size="md" />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{exit.employeeName}</p>
                        <p className="text-xs text-muted-foreground truncate">
                            {[exit.employeeNo, exit.employeeDesignation, exit.employeeDepartment].filter(Boolean).join(' · ')}
                        </p>
                    </div>
                    <Badge variant={statusVariant[exit.status] ?? 'secondary'} className="capitalize shrink-0">
                        {exit.status}
                    </Badge>
                </div>

                {/* Stages timeline — clicking jumps directly to that step */}
                <div className="rounded-lg border bg-card p-4">
                    <div className="flex items-center justify-between gap-2 mb-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Offboarding Flow
                        </p>
                        <span className="text-[11px] text-muted-foreground">
                            Clearance {exit.clearanceCompleted ?? 0} / {exit.clearanceTotal ?? 0}
                            {exit.interviewSubmitted ? ' · Interview submitted' : ''}
                        </span>
                    </div>
                    <ExitStagesTimeline
                        exit={exit}
                        onStageClick={(stage) => {
                            // Map the timeline's 6 stages to our 5 wizard
                            // steps. "submitted" and "closed" both land on
                            // the Info / Settlement step respectively.
                            if (stage === 'submitted') jumpTo('info')
                            else if (stage === 'clearance') jumpTo('clearance')
                            else if (stage === 'interview') jumpTo('interview')
                            else if (stage === 'approval') jumpTo('approval')
                            else if (stage === 'settlement' || stage === 'closed') jumpTo('settlement')
                        }}
                    />
                </div>

                {/* Step pills — second click target. Each pill turns
                    emerald the moment its underlying stage completes (clearance
                    fully done, interview required-answers in, etc.) so HR
                    gets visual feedback as they work through the flow. */}
                <ol className="flex items-center gap-1.5 overflow-x-auto py-1">
                    {STEPS.map((s, i) => {
                        const active = i === stepIndex
                        const done = isStepDone(s.key, exit, readiness)
                        return (
                            <li key={s.key} className="shrink-0 flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => setStepIndex(i)}
                                    className={cn(
                                        'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                                        active
                                            ? 'bg-primary text-primary-foreground border-primary'
                                            : done
                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/60 hover:bg-emerald-100 dark:hover:bg-emerald-950/40'
                                                : 'bg-background text-muted-foreground border-border hover:bg-muted',
                                    )}
                                    aria-current={active ? 'step' : undefined}
                                    aria-label={`Step ${i + 1}: ${s.label}${done ? ' (complete)' : ''}`}
                                >
                                    <span className={cn(
                                        'size-5 rounded-full flex items-center justify-center text-[10px] font-bold',
                                        active
                                            ? 'bg-primary-foreground/20'
                                            : done
                                                ? 'bg-emerald-500 text-white'
                                                : 'bg-muted',
                                    )}>
                                        {done && !active ? <Check className="size-3" /> : i + 1}
                                    </span>
                                    <s.icon className="size-3" />
                                    <span>{s.label}</span>
                                </button>
                                {i < STEPS.length - 1 && (
                                    <span className={cn(
                                        'w-3 h-px',
                                        done ? 'bg-emerald-300' : 'bg-border',
                                    )} />
                                )}
                            </li>
                        )
                    })}
                </ol>

                {/* Step body */}
                <div className="min-h-[280px]">
                    {currentStep.key === 'info' && <InfoStep exit={exit} />}
                    {currentStep.key === 'clearance' && <ExitClearancePanel exitId={exit.id} />}
                    {currentStep.key === 'interview' && (
                        <ExitInterviewSection
                            ref={interviewRef}
                            exitId={exit.id}
                            submitted={!!exit.interviewSubmitted}
                            onDirtyChange={setInterviewDirty}
                        />
                    )}
                    {currentStep.key === 'approval' && (
                        <ApprovalStep
                            exit={exit}
                            canManage={canManage}
                            readiness={readiness ?? null}
                            approvePending={approve.isPending}
                            onApprove={() => {
                                approve.mutate({ id: exit.id }, {
                                    onSuccess: () => {
                                        toast.success('Approved', 'Exit request approved.')
                                        onClose()
                                    },
                                    onError: (e) => {
                                        const err = e as ApiError
                                        if (err?.statusCode === 409) toast.error('Approval blocked', err.message)
                                        else toast.error('Failed', err?.message ?? 'Could not approve exit.')
                                    },
                                })
                            }}
                            onForceApprove={onRequestForceApprove}
                            onReject={onRequestReject}
                            onGotoClearance={() => jumpTo('clearance')}
                            onGotoInterview={() => jumpTo('interview')}
                        />
                    )}
                    {currentStep.key === 'settlement' && (
                        <SettlementStep
                            exit={exit}
                            canManage={canManage}
                            markPending={markPaid.isPending}
                            onMarkPaid={() => {
                                markPaid.mutate(exit.id, {
                                    onSuccess: () => {
                                        toast.success('Settlement paid', 'Marked as paid. Workflows fired.')
                                        onClose()
                                    },
                                    onError: () => toast.error('Failed', 'Could not update settlement.'),
                                })
                            }}
                        />
                    )}
                </div>

                <DialogFooter className="border-t pt-3 gap-2 flex-wrap">
                    <Button variant="outline" onClick={onClose}>Close</Button>
                    <div className="ms-auto flex items-center gap-2">
                        <Button
                            variant="outline"
                            onClick={() => setStepIndex(i => Math.max(0, i - 1))}
                            disabled={isFirst || advancing}
                        >
                            <ChevronLeft className="size-3.5 me-1" /> Previous
                        </Button>
                        <Button
                            onClick={advance}
                            disabled={isLast || advancing}
                        >
                            {currentStep.key === 'interview' && interviewDirty
                                ? <>Save &amp; Next <ChevronRight className="size-3.5 ms-1" /></>
                                : <>Next <ChevronRight className="size-3.5 ms-1" /></>}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ─── Step bodies ───────────────────────────────────────────────────────────

function InfoStep({ exit }: { exit: ExitRequest }) {
    return (
        <div className="rounded-lg border divide-y text-sm overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/30">
                <CalendarDays className="size-3.5 text-muted-foreground" />
                <span className="font-medium text-xs uppercase tracking-wide text-muted-foreground">Exit Information</span>
            </div>
            <div className="px-4">
                <DetailRow label="Exit Type" value={
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${exitTypeColor[exit.exitType] ?? 'bg-gray-100 text-gray-700'}`}>
                        {EXIT_TYPE_LABELS[exit.exitType] ?? exit.exitType}
                    </span>
                } />
                <DetailRow label="Exit Date" value={formatDate(exit.exitDate)} />
                <DetailRow label="Last Working Day" value={formatDate(exit.lastWorkingDay)} />
                <DetailRow label="Notice Period" value={`${exit.noticePeriodDays} days`} />
                {exit.reason && <DetailRow label="Reason" value={exit.reason} />}
                {exit.notes && <DetailRow label="Notes" value={exit.notes} />}
            </div>
        </div>
    )
}

function ApprovalStep({
    exit,
    canManage,
    readiness,
    approvePending,
    onApprove,
    onForceApprove,
    onReject,
    onGotoClearance,
    onGotoInterview,
}: {
    exit: ExitRequest
    canManage: boolean
    readiness: { canApprove: boolean; pendingClearances: { id: string; name: string }[]; interviewRequired: boolean; interviewSubmitted: boolean; pendingRequiredQuestions: string[] } | null
    approvePending: boolean
    onApprove: () => void
    onForceApprove: () => void
    onReject: () => void
    onGotoClearance: () => void
    onGotoInterview: () => void
}) {
    if (exit.status !== 'pending') {
        // Already approved / rejected / completed — show what happened.
        return (
            <div className="rounded-lg border bg-card p-6 text-center">
                <CheckCircle2 className={cn(
                    'size-8 mx-auto mb-2',
                    exit.status === 'rejected' ? 'text-rose-500' : 'text-emerald-500',
                )} />
                <p className="text-sm font-medium capitalize">{exit.status}</p>
                <p className="text-xs text-muted-foreground mt-1">
                    {exit.status === 'rejected'
                        ? 'This exit request was rejected. No further action on this stage.'
                        : 'Approval recorded. Proceed to settlement.'}
                </p>
            </div>
        )
    }

    if (!canManage) {
        return (
            <div className="rounded-lg border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                Approval is reserved for HR managers and super-admins.
            </div>
        )
    }

    const pending = readiness?.pendingClearances ?? []
    const clearanceBlocked = pending.length > 0
    const interviewBlocked = !!readiness && readiness.interviewRequired && readiness.pendingRequiredQuestions.length > 0
    const blocked = clearanceBlocked || interviewBlocked

    return (
        <div className="rounded-lg border bg-card overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/30 border-b">
                <CheckCircle2 className="size-3.5 text-muted-foreground" />
                <span className="font-medium text-xs uppercase tracking-wide text-muted-foreground">Approval Decision</span>
            </div>
            <div className="p-4 space-y-3">
                {blocked ? (
                    <div className="rounded-lg border border-amber-400/40 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5 text-xs space-y-2">
                        <div className="flex items-start gap-2">
                            <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-amber-900 dark:text-amber-100">Approval blocked</p>
                                <p className="text-amber-800 dark:text-amber-200/80 mt-0.5">
                                    Resolve the following before approving (or use Force Approve as HR).
                                </p>
                            </div>
                        </div>
                        {clearanceBlocked && (
                            <div className="ps-6">
                                <p className="font-medium text-amber-900 dark:text-amber-100 text-[11px]">
                                    {pending.length} clearance item{pending.length === 1 ? '' : 's'} pending
                                </p>
                                <ul className="mt-1 space-y-0.5 text-[11px] text-amber-900 dark:text-amber-100/90">
                                    {pending.slice(0, 5).map(p => (
                                        <li key={p.id} className="flex items-center gap-1.5">
                                            <span className="size-1 rounded-full bg-amber-600 dark:bg-amber-400" />
                                            {p.name}
                                        </li>
                                    ))}
                                    {pending.length > 5 && (
                                        <li className="text-amber-800/70 dark:text-amber-200/60 ms-2.5">
                                            +{pending.length - 5} more…
                                        </li>
                                    )}
                                </ul>
                                <Button size="sm" variant="link" className="px-0 h-auto text-amber-800 dark:text-amber-200 mt-1.5" onClick={onGotoClearance}>
                                    Go to Clearance →
                                </Button>
                            </div>
                        )}
                        {interviewBlocked && readiness && (
                            <div className="ps-6">
                                <p className="font-medium text-amber-900 dark:text-amber-100 text-[11px]">
                                    {readiness.pendingRequiredQuestions.length} required interview question{readiness.pendingRequiredQuestions.length === 1 ? '' : 's'} unanswered
                                </p>
                                <ul className="mt-1 space-y-0.5 text-[11px] text-amber-900 dark:text-amber-100/90">
                                    {readiness.pendingRequiredQuestions.slice(0, 3).map((q, i) => (
                                        <li key={i} className="flex items-start gap-1.5">
                                            <span className="size-1 rounded-full bg-amber-600 dark:bg-amber-400 shrink-0 mt-1.5" />
                                            <span className="line-clamp-1">{q}</span>
                                        </li>
                                    ))}
                                    {readiness.pendingRequiredQuestions.length > 3 && (
                                        <li className="text-amber-800/70 dark:text-amber-200/60 ms-2.5">
                                            +{readiness.pendingRequiredQuestions.length - 3} more…
                                        </li>
                                    )}
                                </ul>
                                <Button size="sm" variant="link" className="px-0 h-auto text-amber-800 dark:text-amber-200 mt-1.5" onClick={onGotoInterview}>
                                    Go to Exit Interview →
                                </Button>
                            </div>
                        )}
                    </div>
                ) : (
                    <p className="text-xs text-muted-foreground">
                        All approval prerequisites are complete. Approving will mark the employee as terminated and fire the approval workflow.
                    </p>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                    {blocked ? (
                        <Button
                            size="sm"
                            variant="outline"
                            className="border-amber-400/60 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                            onClick={onForceApprove}
                            disabled={approvePending}
                        >
                            Force Approve
                        </Button>
                    ) : (
                        <Button size="sm" onClick={onApprove} disabled={approvePending || !readiness}>
                            <Check className="size-3.5 me-1" /> Approve Exit
                        </Button>
                    )}
                    <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={onReject}
                    >
                        <XCircle className="size-3.5 me-1" /> Reject
                    </Button>
                </div>
            </div>
        </div>
    )
}

function SettlementStep({
    exit,
    canManage,
    markPending,
    onMarkPaid,
}: {
    exit: ExitRequest
    canManage: boolean
    markPending: boolean
    onMarkPaid: () => void
}) {
    return (
        <div className="rounded-lg border divide-y text-sm overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/30">
                <DollarSign className="size-3.5 text-muted-foreground" />
                <span className="font-medium text-xs uppercase tracking-wide text-muted-foreground">Settlement Breakdown</span>
                {exit.settlementPaid && (
                    <Badge variant="success" className="ms-auto text-[10px]">Paid</Badge>
                )}
            </div>
            <div className="px-4">
                <DetailRow label="Gratuity (UAE Labour Law 2022)" value={fmt(exit.gratuityAmount)} />
                <DetailRow label="Leave Encashment" value={fmt(exit.leaveEncashmentAmount)} />
                <DetailRow label="Unpaid Salary" value={fmt(exit.unpaidSalaryAmount)} />
                {Number(exit.deductions ?? 0) > 0 && (
                    <DetailRow label="Deductions" value={`− ${fmt(exit.deductions)}`} />
                )}
            </div>
            <div className="flex justify-between items-center px-4 py-3 bg-muted/50">
                <span className="font-semibold">Total Settlement</span>
                <span className="font-bold text-primary text-base tabular-nums">{fmt(exit.totalSettlement)}</span>
            </div>
            {exit.settlementPaidDate && (
                <div className="px-4">
                    <DetailRow label="Paid On" value={formatDate(exit.settlementPaidDate)} />
                </div>
            )}
            {canManage && exit.status === 'approved' && !exit.settlementPaid && (
                <div className="px-4 py-3 bg-card">
                    <Button size="sm" onClick={onMarkPaid} disabled={markPending}>
                        <DollarSign className="size-3.5 me-1" /> Mark Settlement Paid
                    </Button>
                </div>
            )}
            {exit.status === 'pending' && (
                <div className="px-4 py-3 bg-muted/20 text-xs text-muted-foreground">
                    Settlement payout becomes available once the exit is approved.
                </div>
            )}
        </div>
    )
}
