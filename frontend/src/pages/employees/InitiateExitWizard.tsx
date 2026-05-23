// ─── Initiate Exit Wizard ────────────────────────────────────────────────────
// Multi-step replacement for the old two-step (form + preview) dialog. Walks
// HR through the offboarding flow in the same order the runtime executes:
//
//   1. Employee     — who is leaving, and why
//   2. Dates        — exit / last-working-day / notice period
//   3. Process      — read-only preview of the clearance items + letters that
//                     will be auto-created from Org Settings → Offboarding Flow
//   4. Notes        — reason + free-text notes + deductions
//   5. Settlement   — calculated breakdown (UAE Labour Law) and the only step
//                     where the submit button appears
//
// Every step is a Prev/Next stop. Form state lives in this component so going
// back and forward never loses input. The actual exit_request row is inserted
// only on the final Submit — there's nothing to persist between steps in the
// DB.

import { useState } from 'react'
import {
    User,
    CalendarDays,
    ListChecks,
    FileText,
    DollarSign,
    AlertTriangle,
    Check,
    ChevronLeft,
    ChevronRight,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { NumericInput } from '@/components/ui/numeric-input'
import { DatePicker } from '@/components/ui/date-picker'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/overlays'
import { EmployeeSelect } from '@/components/shared'
import { InitialsAvatar } from '@/components/shared/Avatar'
import { useInitiateExit, useSettlementPreview } from '@/hooks/useExit'
import { useOffboardingSettings, useClearanceTemplates, useExitDocuments } from '@/hooks/useOffboardingFlow'
import { EXIT_TYPE_LABELS } from '@/lib/enums'
import { EXIT_TYPE_OPTIONS } from '@/lib/options'
import { ApiError } from '@/lib/api'
import { formatCurrency, formatDate, cn } from '@/lib/utils'

// ─── Types ──────────────────────────────────────────────────────────────────

interface WizardForm {
    employeeId: string
    exitType: 'resignation' | 'termination' | 'contract_end' | 'retirement'
    exitDate: string
    lastWorkingDay: string
    noticePeriodDays: number
    reason: string
    notes: string
    deductions: number
}

const EMPTY: WizardForm = {
    employeeId: '',
    exitType: 'resignation',
    exitDate: '',
    lastWorkingDay: '',
    noticePeriodDays: 30,
    reason: '',
    notes: '',
    deductions: 0,
}

type StepKey = 'employee' | 'dates' | 'process' | 'notes' | 'settlement'

interface StepDef {
    key: StepKey
    label: string
    icon: React.ElementType
    description: string
}

const STEPS: StepDef[] = [
    { key: 'employee', label: 'Employee', icon: User, description: 'Pick the employee and exit type.' },
    { key: 'dates', label: 'Dates', icon: CalendarDays, description: 'Exit date, last working day, and notice period.' },
    { key: 'process', label: 'Process', icon: ListChecks, description: 'Clearance items and letters that will be created.' },
    { key: 'notes', label: 'Notes', icon: FileText, description: 'Reason, notes, and any deductions.' },
    { key: 'settlement', label: 'Settlement', icon: DollarSign, description: 'Final settlement breakdown — submit when ready.' },
]

function fmt(n: string | number | undefined | null) {
    if (n === undefined || n === null) return '—'
    const num = Number(n)
    if (Number.isNaN(num)) return '—'
    return formatCurrency(num)
}

// ─── Wizard ────────────────────────────────────────────────────────────────

export function InitiateExitWizard({
    open,
    onOpenChange,
    onSubmitted,
}: {
    open: boolean
    onOpenChange: (next: boolean) => void
    onSubmitted?: () => void
}) {
    const initiate = useInitiateExit()
    const offboardingSettings = useOffboardingSettings()

    const [stepIndex, setStepIndex] = useState(0)
    const [form, setForm] = useState<WizardForm>(EMPTY)
    // Track which steps the user has visited so we can show validation hints
    // only on touched steps (not every step on first render).
    const [visited, setVisited] = useState<Record<StepKey, boolean>>({
        employee: false, dates: false, process: false, notes: false, settlement: false,
    })

    // Pre-seed notice period from the configured Offboarding Flow defaults
    // the first time the dialog opens with settings loaded.
    const configuredNoticeDays = (() => {
        const s = offboardingSettings.data
        if (!s || !s.noticePeriodEnabled) return 30
        return s.noticePeriodUnit === 'months' ? s.noticePeriodValue * 30 : s.noticePeriodValue
    })()
    const [lastSeed, setLastSeed] = useState(0)
    if (open && lastSeed !== configuredNoticeDays && form.noticePeriodDays === EMPTY.noticePeriodDays) {
        setLastSeed(configuredNoticeDays)
        setForm((f) => ({ ...f, noticePeriodDays: configuredNoticeDays }))
    }

    // Reset everything whenever the dialog closes — separate sync key keeps
    // this one-shot instead of running on every render.
    const [wasOpen, setWasOpen] = useState(false)
    if (open !== wasOpen) {
        setWasOpen(open)
        if (!open) {
            setStepIndex(0)
            setForm({ ...EMPTY, noticePeriodDays: configuredNoticeDays })
            setVisited({ employee: false, dates: false, process: false, notes: false, settlement: false })
        }
    }

    const currentStep = STEPS[stepIndex]
    const isFirst = stepIndex === 0
    const isLast = stepIndex === STEPS.length - 1

    // Validation per step — used to gate the Next button and to highlight
    // missing fields when the step has been visited.
    const stepValid: Record<StepKey, boolean> = {
        employee: !!form.employeeId,
        dates: !!form.exitDate && !!form.lastWorkingDay && form.noticePeriodDays >= 0,
        process: true, // pure preview, always valid
        notes: !!form.reason.trim(),
        settlement: true, // settlement is preview + submit
    }
    const canAdvance = stepValid[currentStep.key]

    function set<K extends keyof WizardForm>(key: K, value: WizardForm[K]) {
        setForm((prev) => ({ ...prev, [key]: value }))
    }

    function goNext() {
        if (!canAdvance) {
            setVisited((v) => ({ ...v, [currentStep.key]: true }))
            return
        }
        setVisited((v) => ({ ...v, [currentStep.key]: true }))
        if (!isLast) setStepIndex((i) => i + 1)
    }
    function goPrev() {
        if (!isFirst) setStepIndex((i) => i - 1)
    }
    function jumpTo(target: number) {
        // Allow jumping back to any visited / completed step. Forward jumps
        // require the chain in between to validate.
        if (target <= stepIndex) {
            setStepIndex(target)
            return
        }
        for (let i = stepIndex; i < target; i++) {
            if (!stepValid[STEPS[i].key]) {
                setStepIndex(i)
                setVisited((v) => ({ ...v, [STEPS[i].key]: true }))
                return
            }
        }
        setStepIndex(target)
    }

    async function submit() {
        try {
            await initiate.mutateAsync({
                employeeId: form.employeeId,
                exitType: form.exitType,
                exitDate: form.exitDate,
                lastWorkingDay: form.lastWorkingDay,
                noticePeriodDays: form.noticePeriodDays,
                reason: form.reason.trim() || undefined,
                notes: form.notes.trim() || undefined,
                deductions: form.deductions || undefined,
            })
            toast.success('Exit request initiated', 'Clearance items and notifications have been queued.')
            onOpenChange(false)
            onSubmitted?.()
        } catch (err) {
            toast.error('Failed', err instanceof ApiError ? err.message : 'Could not initiate exit.')
        }
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                if (initiate.isPending) return
                onOpenChange(o)
            }}
        >
            <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <currentStep.icon className="size-4 text-primary" />
                        Initiate Exit — {currentStep.label}
                    </DialogTitle>
                    <DialogDescription>{currentStep.description}</DialogDescription>
                </DialogHeader>

                {/* Step indicator row — clickable for already-visited steps */}
                <ol className="flex items-center gap-1.5 py-2 overflow-x-auto">
                    {STEPS.map((s, i) => {
                        const done = stepValid[s.key] && i < stepIndex
                        const active = i === stepIndex
                        const reachable = i <= stepIndex || (i > stepIndex && STEPS.slice(0, i).every(prev => stepValid[prev.key]))
                        return (
                            <li key={s.key} className="flex items-center gap-1.5 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => reachable && jumpTo(i)}
                                    disabled={!reachable}
                                    className={cn(
                                        'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                                        active ? 'bg-primary text-primary-foreground border-primary' :
                                            done ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/60 hover:bg-emerald-100' :
                                                reachable ? 'bg-background text-muted-foreground border-border hover:bg-muted' :
                                                    'bg-muted text-muted-foreground/50 border-border cursor-not-allowed',
                                    )}
                                >
                                    <span className={cn(
                                        'size-5 rounded-full flex items-center justify-center text-[10px] font-bold',
                                        active ? 'bg-primary-foreground/20' :
                                            done ? 'bg-emerald-500/15' :
                                                'bg-muted-foreground/15',
                                    )}>
                                        {done ? <Check className="size-3" /> : i + 1}
                                    </span>
                                    <span>{s.label}</span>
                                </button>
                                {i < STEPS.length - 1 && (
                                    <span className={cn('w-3 h-px', done ? 'bg-emerald-300' : 'bg-border')} />
                                )}
                            </li>
                        )
                    })}
                </ol>

                <div className="py-2 min-h-[320px]">
                    {currentStep.key === 'employee' && (
                        <EmployeeStep form={form} set={set} touched={visited.employee} />
                    )}
                    {currentStep.key === 'dates' && (
                        <DatesStep form={form} set={set} touched={visited.dates} configuredNoticeDays={configuredNoticeDays} noticeEnabled={!!offboardingSettings.data?.noticePeriodEnabled} />
                    )}
                    {currentStep.key === 'process' && (
                        <ProcessStep />
                    )}
                    {currentStep.key === 'notes' && (
                        <NotesStep form={form} set={set} touched={visited.notes} />
                    )}
                    {currentStep.key === 'settlement' && (
                        <SettlementStep form={form} />
                    )}
                </div>

                <DialogFooter className="border-t pt-3 gap-2 flex-wrap">
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={initiate.isPending}
                    >
                        Cancel
                    </Button>
                    <div className="ms-auto flex items-center gap-2">
                        <Button
                            variant="outline"
                            onClick={goPrev}
                            disabled={isFirst || initiate.isPending}
                        >
                            <ChevronLeft className="size-3.5 me-1" /> Previous
                        </Button>
                        {isLast ? (
                            <Button onClick={submit} disabled={initiate.isPending || !stepValid.employee || !stepValid.dates || !stepValid.notes}>
                                {initiate.isPending ? 'Submitting…' : 'Submit Exit Request'}
                            </Button>
                        ) : (
                            <Button onClick={goNext} disabled={!canAdvance}>
                                Next <ChevronRight className="size-3.5 ms-1" />
                            </Button>
                        )}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ─── Steps ──────────────────────────────────────────────────────────────────

function EmployeeStep({ form, set, touched }: { form: WizardForm; set: <K extends keyof WizardForm>(k: K, v: WizardForm[K]) => void; touched: boolean }) {
    const showEmployeeError = touched && !form.employeeId
    return (
        <div className="space-y-4">
            <div className="space-y-1.5">
                <Label required>Employee</Label>
                <EmployeeSelect value={form.employeeId} onValueChange={(v) => set('employeeId', v)} />
                {showEmployeeError && (
                    <p className="text-[11px] text-rose-600">Please pick the exiting employee.</p>
                )}
            </div>
            <div className="space-y-1.5">
                <Label required>Exit Type</Label>
                <Select value={form.exitType} onValueChange={(v) => set('exitType', v as WizardForm['exitType'])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {EXIT_TYPE_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                    Drives the settlement rules and downstream workflow triggers.
                </p>
            </div>
        </div>
    )
}

function DatesStep({
    form,
    set,
    touched,
    configuredNoticeDays,
    noticeEnabled,
}: {
    form: WizardForm
    set: <K extends keyof WizardForm>(k: K, v: WizardForm[K]) => void
    touched: boolean
    configuredNoticeDays: number
    noticeEnabled: boolean
}) {
    const exitMissing = touched && !form.exitDate
    const lwdMissing = touched && !form.lastWorkingDay
    return (
        <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <Label required>Exit Date</Label>
                    <DatePicker value={form.exitDate} onChange={(v) => set('exitDate', v)} />
                    {exitMissing && <p className="text-[11px] text-rose-600">Required.</p>}
                </div>
                <div className="space-y-1.5">
                    <Label required>Last Working Day</Label>
                    <DatePicker value={form.lastWorkingDay} min={form.exitDate || undefined} onChange={(v) => set('lastWorkingDay', v)} />
                    {lwdMissing && <p className="text-[11px] text-rose-600">Required.</p>}
                </div>
            </div>
            <div className="space-y-1.5">
                <Label>Notice Period (days)</Label>
                <NumericInput
                    decimal={false}
                    value={form.noticePeriodDays}
                    onChange={(e) => set('noticePeriodDays', Number(e.target.value) || 0)}
                />
                {form.noticePeriodDays === configuredNoticeDays && noticeEnabled && (
                    <p className="text-[10px] text-muted-foreground leading-tight">
                        Default from Org Settings → Offboarding Flow ({configuredNoticeDays} days).
                    </p>
                )}
            </div>
        </div>
    )
}

function ProcessStep() {
    // Read-only preview of what will be auto-instantiated on submit. Pulls
    // the live config so HR sees exactly what their employee is about to
    // experience.
    const { data: clearances, isLoading: clearLoad } = useClearanceTemplates()
    const { data: documents, isLoading: docLoad } = useExitDocuments()

    return (
        <div className="space-y-5">
            <p className="text-xs text-muted-foreground">
                These items are configured under <strong>Org Settings → Offboarding Flow</strong> and will be created automatically when you submit. Edit them there if anything looks off.
            </p>

            {/* Clearance preview */}
            <section className="rounded-lg border bg-card">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30">
                    <ListChecks className="size-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Clearance items</span>
                    <Badge variant="secondary" className="ms-auto text-[10px]">
                        {clearLoad ? '…' : clearances?.length ?? 0}
                    </Badge>
                </div>
                <div className="p-3">
                    {clearLoad ? (
                        <Skeleton className="h-16 w-full" />
                    ) : !clearances || clearances.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic px-2 py-3">
                            No clearance templates configured. The exit will be created without a clearance checklist.
                        </p>
                    ) : (
                        <ul className="space-y-1.5">
                            {clearances.map((c) => (
                                <li key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/20 text-sm">
                                    <span className="size-1.5 rounded-full bg-primary shrink-0" />
                                    <span className="font-medium">{c.name}</span>
                                    <span className="text-xs text-muted-foreground">— {c.endOffsetDays} days before relieving</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </section>

            {/* Documents preview */}
            <section className="rounded-lg border bg-card">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30">
                    <FileText className="size-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Documents to issue</span>
                    <Badge variant="secondary" className="ms-auto text-[10px]">
                        {docLoad ? '…' : documents?.length ?? 0}
                    </Badge>
                </div>
                <div className="p-3">
                    {docLoad ? (
                        <Skeleton className="h-12 w-full" />
                    ) : !documents || documents.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic px-2 py-3">
                            No exit documents configured.
                        </p>
                    ) : (
                        <ul className="space-y-1.5">
                            {documents.map((d) => (
                                <li key={d.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/20 text-sm">
                                    <FileText className="size-3 text-muted-foreground shrink-0" />
                                    <span className="font-medium">{d.name}</span>
                                    {d.required && (
                                        <Badge variant="secondary" className="ms-auto text-[10px]">Required</Badge>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </section>
        </div>
    )
}

function NotesStep({ form, set, touched }: { form: WizardForm; set: <K extends keyof WizardForm>(k: K, v: WizardForm[K]) => void; touched: boolean }) {
    const reasonMissing = touched && !form.reason.trim()
    return (
        <div className="space-y-4">
            <div className="space-y-1.5">
                <Label required>Reason</Label>
                <Textarea
                    value={form.reason}
                    onChange={(e) => set('reason', e.target.value)}
                    rows={3}
                    placeholder="Resignation reason / termination cause / contract end note…"
                />
                {reasonMissing && <p className="text-[11px] text-rose-600">Required.</p>}
            </div>
            <div className="space-y-1.5">
                <Label>Internal notes (optional)</Label>
                <Textarea
                    value={form.notes}
                    onChange={(e) => set('notes', e.target.value)}
                    rows={3}
                    placeholder="Hand-over status, escalation history, any context for finance / approvers…"
                />
            </div>
            <div className="space-y-1.5">
                <Label>Deductions (AED)</Label>
                <NumericInput
                    value={form.deductions}
                    onChange={(e) => set('deductions', Number(e.target.value) || 0)}
                    placeholder="0.00"
                />
                <p className="text-[11px] text-muted-foreground">
                    Pending loans, unreturned assets, or any other deduction. Subtracted from the final settlement.
                </p>
            </div>
        </div>
    )
}

function SettlementStep({ form }: { form: WizardForm }) {
    // Only fetch the settlement preview when we have enough data — keeps
    // the API quiet if the user jumped here without filling earlier steps.
    const ready = !!form.employeeId && !!form.exitDate && !!form.exitType
    const { data: preview, isLoading } = useSettlementPreview(
        ready ? form.employeeId : undefined,
        ready ? form.exitDate : undefined,
        ready ? form.exitType : undefined,
        ready ? form.deductions : undefined,
    )

    if (!ready) {
        return (
            <div className="rounded-lg border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
                Complete the earlier steps to calculate the settlement.
            </div>
        )
    }

    if (isLoading) {
        return (
            <div className="py-10 text-center text-sm text-muted-foreground">
                <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-3" />
                Calculating settlement…
            </div>
        )
    }

    if (!preview) {
        return (
            <div className="rounded-lg border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
                Could not load settlement preview. Please verify the dates.
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border">
                <InitialsAvatar name={preview.employeeName} size="sm" />
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{preview.employeeName}</p>
                    <p className="text-xs text-muted-foreground">
                        {preview.yearsOfService} years of service · {EXIT_TYPE_LABELS[form.exitType] ?? form.exitType}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        Basic {fmt(preview.basicSalary)} · Total {fmt(preview.totalSalary)} · LWD {formatDate(form.lastWorkingDay)}
                    </p>
                </div>
            </div>

            <div className="rounded-lg border divide-y text-sm overflow-hidden">
                {(
                    [
                        ['Gratuity (UAE Labour Law 2022)', fmt(preview.gratuityAmount)],
                        [`Leave Encashment (${preview.unusedLeaveDays} unused days)`, fmt(preview.leaveEncashmentAmount)],
                        ['Unpaid Salary (current month prorate)', fmt(preview.unpaidSalaryAmount)],
                        ...(preview.deductions > 0 ? [['Deductions', `− ${fmt(preview.deductions)}`]] : []),
                    ] as Array<[string, string]>
                ).map(([label, val]) => (
                    <div key={label} className="flex justify-between px-4 py-2.5">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium tabular-nums">{val}</span>
                    </div>
                ))}
                <div className="flex justify-between px-4 py-3 bg-muted/50">
                    <span className="font-semibold">Total Settlement</span>
                    <span className="font-bold text-primary text-base tabular-nums">{fmt(preview.totalSettlement)}</span>
                </div>
            </div>

            {preview.yearsOfService < 1 && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2.5 text-xs text-amber-700 dark:bg-amber-950/30 dark:border-amber-900/60 dark:text-amber-300">
                    <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                    <span>Employee has less than 1 year of service — gratuity is not payable under UAE Labour Law.</span>
                </div>
            )}
        </div>
    )
}
