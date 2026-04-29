import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { labelFor } from '@/lib/enums'
import { ArrowLeft, CheckCircle2, Clock, AlertTriangle, XCircle, FileText, Hash, Plus, Trash2, Receipt, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate, formatCurrency, cn } from '@/lib/utils'
import { useVisas, useAdvanceVisaWithCosts, useCancelVisa, useUpdateVisa, useVisaHistory, useVisaStepLabels } from '@/hooks/useVisa'
import { useVisaCosts, useAddVisaCost, useDeleteVisaCost, COST_CATEGORY_LABELS } from '@/hooks/useVisaCosts'
import type { CostCategory, AddCostInput } from '@/hooks/useVisaCosts'
import { toast } from '@/components/ui/overlays'
import { PromptDialog } from '@/components/ui/prompt-dialog'
import { AdvanceStageCostsDialog } from '@/components/visa/AdvanceStageCostsDialog'
import type { VisaApplication, VisaStatus } from '@/types'

const statusLabel: Record<VisaStatus, string> = {
    not_started: 'Not Started',
    entry_permit: 'Entry Permit',
    medical_pending: 'Medical',
    eid_pending: 'EID Pending',
    stamping: 'Stamping',
    active: 'Active',
    expiring_soon: 'Expiring Soon',
    expired: 'Expired',
    cancelled: 'Cancelled',
}

const statusStyles: Record<VisaStatus, string> = {
    not_started: 'bg-muted text-muted-foreground',
    entry_permit: 'bg-info/10 text-info border-info/20',
    medical_pending: 'bg-warning/10 text-warning border-warning/20',
    eid_pending: 'bg-warning/10 text-warning border-warning/20',
    stamping: 'bg-info/10 text-info border-info/20',
    active: 'bg-success/10 text-success border-success/20',
    expiring_soon: 'bg-warning/10 text-warning border-warning/20',
    expired: 'bg-destructive/10 text-destructive border-destructive/20',
    cancelled: 'bg-muted text-muted-foreground',
}

const FALLBACK_VISA_STEPS = [
    'Entry Permit Application',
    'Entry Permit Approval',
    'Employee Entry to UAE',
    'Medical Fitness Test',
    'Emirates ID Biometrics',
    'Visa Stamping',
    'Labour Card Issuance',
    'Completion',
]

function UrgencyIcon({ level }: { level: string }) {
    if (level === 'critical') return <AlertTriangle className="h-4 w-4 text-destructive" />
    if (level === 'urgent') return <Clock className="h-4 w-4 text-warning" />
    return <CheckCircle2 className="h-4 w-4 text-success" />
}

const CATEGORIES: CostCategory[] = ['govt_fee', 'medical', 'typing', 'translation', 'other']

export function VisaDetailPage() {
    const { t } = useTranslation()
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const { data, isLoading } = useVisas({ limit: 100 })
    const advanceWithCosts = useAdvanceVisaWithCosts()
    const cancelVisa = useCancelVisa()
    const updateVisa = useUpdateVisa()
    const { data: stepLabels } = useVisaStepLabels()
    // Convert the backend Record<number,string> into a 0-based array for index access
    const visaSteps = stepLabels
        ? Object.keys(stepLabels).sort((a, b) => Number(a) - Number(b)).map(k => stepLabels[Number(k)])
        : FALLBACK_VISA_STEPS

    const { data: costs, isLoading: costsLoading } = useVisaCosts(id ?? '')
    const { data: history } = useVisaHistory(id ?? '')
    const addCost = useAddVisaCost(id ?? '')
    const deleteCost = useDeleteVisaCost(id ?? '')

    const [showAddCost, setShowAddCost] = useState(false)
    const [advanceDialogOpen, setAdvanceDialogOpen] = useState(false)
    const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
    const [stampingRefDialogOpen, setStampingRefDialogOpen] = useState(false)
    const [stampingApptDialogOpen, setStampingApptDialogOpen] = useState(false)
    const [costForm, setCostForm] = useState<AddCostInput>({
        employeeId: '',
        category: 'govt_fee',
        amount: 0,
        paidDate: new Date().toISOString().split('T')[0],
    })

    const visas = (data?.data ?? []) as VisaApplication[]
    const visa = visas.find((v) => v.id === id)
    const costList = costs ?? []
    const costTotal = costList.reduce((s, c) => s + Number(c.amount), 0)

    function handleAddCost() {
        if (!visa || costForm.amount <= 0 || !costForm.paidDate) return
        const input = { ...costForm, employeeId: visa.employeeId }
        addCost.mutate(input, {
            onSuccess: () => { toast.success('Cost added'); setShowAddCost(false); setCostForm({ employeeId: '', category: 'govt_fee', amount: 0, paidDate: new Date().toISOString().split('T')[0] }) },
            onError: () => toast.error('Failed to save cost'),
        })
    }

    if (isLoading) {
        return (
            <PageWrapper>
                <PageHeader title={t('visa.title')} description={t('common.loading')} />
                <div className="grid grid-cols-1 gap-4">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
                </div>
            </PageWrapper>
        )
    }

    if (!visa) {
        return (
            <PageWrapper>
                <PageHeader title={t('visa.title')} description={t('errors.notFound')} />
                <div className="flex flex-col items-center gap-4 py-16">
                    <XCircle className="h-12 w-12 text-muted-foreground" />
                    <p className="text-muted-foreground">{t('visa.noVisa')}</p>
                    <Button variant="outline" onClick={() => navigate('/visa')}>
                        <ArrowLeft className="h-4 w-4 mr-2" /> {t('common.back')}
                    </Button>
                </div>
            </PageWrapper>
        )
    }

    const isDone = visa.currentStep >= visa.totalSteps
    const isCancelled = visa.status === 'cancelled' || visa.status === 'expired'
    const progress = Math.round((visa.currentStep / visa.totalSteps) * 100)

    function handleAdvance() {
        // The dialog calls the atomic /advance endpoint itself with any captured
        // costs, so this just opens it.
        setAdvanceDialogOpen(true)
    }

    function handleCancel() {
        setCancelDialogOpen(true)
    }

    function submitCancel(reason: string) {
        cancelVisa.mutate({ id: visa!.id, reason: reason.trim() || undefined }, {
            onSuccess: () => {
                toast.success(t('common.cancelled'))
                setCancelDialogOpen(false)
                navigate('/visa')
            },
            onError: () => toast.error(t('common.saveFailed')),
        })
    }

    function submitStampingRef(ref: string) {
        const trimmed = ref.trim()
        if (!trimmed) return
        if (trimmed === (visa!.mohreRef ?? '')) {
            toast.info('No change', 'Reference is already set to that value.')
            setStampingRefDialogOpen(false)
            return
        }
        updateVisa.mutate({ id: visa!.id, data: { mohreRef: trimmed } }, {
            onSuccess: () => {
                toast.success('Reference saved', `Reference recorded: ${trimmed}`)
                setStampingRefDialogOpen(false)
            },
            onError: () => toast.error('Failed', 'Could not save the reference.'),
        })
    }

    function submitStampingAppt(daysStr: string) {
        const days = Number(daysStr)
        if (!Number.isFinite(days) || days <= 0) {
            toast.error('Invalid value', 'Please enter a positive number of days.')
            return
        }
        toast.info(`Reminder set in ${days} day(s)`)
        setStampingApptDialogOpen(false)
    }

    return (
        <PageWrapper>
            <PageHeader
                title={visa.employeeName}
                description={`${labelFor(visa.visaType)} · Application ID: ${visa.id.slice(0, 8).toUpperCase()}`}
                actions={
                    <Button variant="ghost" size="sm" onClick={() => navigate('/visa')}>
                        <ArrowLeft className="h-4 w-4 mr-2" /> Back
                    </Button>
                }
            />

            <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left: Summary */}
                    <div className="lg:col-span-1 space-y-4">
                        <Card className="p-5 space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="font-semibold text-sm">{t('common.status')}</h3>
                                <Badge variant="outline" className={statusStyles[visa.status]}>
                                    {statusLabel[visa.status]}
                                </Badge>
                            </div>
                            <div className="space-y-1">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">{t('common.progress')}</span>
                                    <span className="font-medium">{visa.currentStep}/{visa.totalSteps} steps</span>
                                </div>
                                <Progress value={progress} className="h-2" />
                                <p className="text-xs text-muted-foreground">{progress}% complete</p>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                                <UrgencyIcon level={visa.urgencyLevel} />
                                <span className="capitalize font-medium">{visa.urgencyLevel} {t('common.priority')}</span>
                            </div>
                        </Card>

                        <Card className="p-5 space-y-3">
                            <h3 className="font-semibold text-sm">{t('common.details')}</h3>
                            <dl className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <dt className="text-muted-foreground">{t('common.startDate')}</dt>
                                    <dd className="font-medium">{formatDate(visa.startDate)}</dd>
                                </div>
                                {visa.expiryDate && (
                                    <div className="flex justify-between">
                                        <dt className="text-muted-foreground">{t('visa.expiryDate')}</dt>
                                        <dd className="font-medium">{formatDate(visa.expiryDate)}</dd>
                                    </div>
                                )}
                                {visa.mohreRef && (
                                    <div className="flex justify-between">
                                        <dt className="text-muted-foreground">MOHRE Ref</dt>
                                        <dd className="font-medium font-mono text-xs">{visa.mohreRef}</dd>
                                    </div>
                                )}
                                {visa.gdfrRef && (
                                    <div className="flex justify-between">
                                        <dt className="text-muted-foreground">GDRFA Ref</dt>
                                        <dd className="font-medium font-mono text-xs">{visa.gdfrRef}</dd>
                                    </div>
                                )}
                            </dl>
                        </Card>

                        {!isCancelled && (
                            <div className="space-y-2">
                                {!isDone && (
                                    <>
                                        <Button
                                            className="w-full"
                                            onClick={handleAdvance}
                                            disabled={advanceWithCosts.isPending}
                                        >
                                            {advanceWithCosts.isPending ? (
                                                t('common.loading')
                                            ) : (
                                                <>
                                                    <CheckCircle2 className="h-4 w-4 mr-2" />
                                                    Mark "{visaSteps[visa.currentStep - 1] ?? `Step ${visa.currentStep}`}" complete
                                                </>
                                            )}
                                        </Button>
                                        {visa.currentStep < visa.totalSteps && (
                                            <p className="text-[11px] text-muted-foreground text-center">
                                                Next: {visaSteps[visa.currentStep] ?? `Step ${visa.currentStep + 1}`}
                                            </p>
                                        )}
                                    </>
                                )}

                                {/* Stamping-specific actions */}
                                {!isDone && visa.status === 'stamping' && (
                                    <div className="rounded-md border bg-info/5 p-3 space-y-2">
                                        <p className="text-[11px] font-semibold text-info uppercase tracking-wide">
                                            Stamping actions
                                        </p>
                                        {visa.mohreRef && (
                                            <div className="rounded border border-info/20 bg-background px-2.5 py-1.5">
                                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                                    Saved reference
                                                </p>
                                                <p className="text-xs font-medium font-mono break-all">{visa.mohreRef}</p>
                                            </div>
                                        )}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="w-full justify-start text-xs"
                                            onClick={() => navigate(`/documents?employeeId=${visa.employeeId}&category=visa`)}
                                        >
                                            <FileText className="h-3.5 w-3.5 mr-2" />
                                            Upload stamped passport page
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="w-full justify-start text-xs"
                                            onClick={() => setStampingRefDialogOpen(true)}
                                        >
                                            <Hash className="h-3.5 w-3.5 mr-2" />
                                            {visa.mohreRef ? 'Update stamping reference' : 'Record stamping reference'}
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="w-full justify-start text-xs"
                                            onClick={() => setStampingApptDialogOpen(true)}
                                        >
                                            <Clock className="h-3.5 w-3.5 mr-2" />
                                            Schedule stamping appointment
                                        </Button>
                                    </div>
                                )}

                                <Button
                                    variant="outline"
                                    className="w-full text-destructive border-destructive/30 hover:bg-destructive/5"
                                    onClick={handleCancel}
                                    disabled={cancelVisa.isPending}
                                >
                                    Cancel Application
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Right: Timeline */}
                    <div className="lg:col-span-2">
                        <Card className="p-6">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-2">
                                    <FileText className="h-5 w-5 text-primary" />
                                    <h3 className="font-semibold">Visa Process Timeline</h3>
                                </div>
                                {isDone && !isCancelled && (
                                    <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> All steps completed
                                    </Badge>
                                )}
                            </div>
                            <div className="space-y-4">
                                {Array.from({ length: visa.totalSteps }).map((_, i) => {
                                    const allDone = visa.status === 'active'
                                    const done = allDone || i < visa.currentStep - 1
                                    const current = !allDone && i === visa.currentStep - 1
                                    const pending = !allDone && i > visa.currentStep - 1
                                    const label = visaSteps[i] || `Step ${i + 1}`
                                    const isFinal = i === visa.totalSteps - 1

                                    return (
                                        <div key={i} className="flex gap-4">
                                            <div className="flex flex-col items-center">
                                                <div className={cn(
                                                    'h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold border-2',
                                                    done ? 'bg-success border-success text-success-foreground' :
                                                        current ? 'bg-primary border-primary text-primary-foreground' :
                                                            'bg-card border-border text-muted-foreground'
                                                )}>
                                                    {done ? '✓' : i + 1}
                                                </div>
                                                {i < visa.totalSteps - 1 && (
                                                    <div className={cn('w-0.5 flex-1 min-h-[24px] mt-1', done ? 'bg-success' : 'bg-border')} />
                                                )}
                                            </div>
                                            <div className="pb-4 flex-1">
                                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                                    <p className={cn(
                                                        'font-medium text-sm',
                                                        done ? 'text-success' : current ? 'text-primary' : 'text-muted-foreground'
                                                    )}>
                                                        {label}
                                                    </p>
                                                    {current && !isCancelled && (
                                                        <Button
                                                            size="sm"
                                                            variant={isFinal ? 'default' : 'secondary'}
                                                            onClick={handleAdvance}
                                                            disabled={advanceWithCosts.isPending}
                                                            className="h-7 text-xs"
                                                        >
                                                            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                                                            {isFinal ? 'Complete & activate visa' : `Mark ${label} complete`}
                                                        </Button>
                                                    )}
                                                </div>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    {done ? t('common.completed') : current ? t('common.inProgress') : pending ? t('common.pending') : ''}
                                                </p>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </Card>
                    </div>
                </div>

                {/* ── Cost Log — separate section, not part of the process timeline ── */}
                <Card className="p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <Receipt className="h-5 w-5 text-primary" />
                            <div>
                                <h3 className="font-semibold">Cost Log</h3>
                                <p className="text-xs text-muted-foreground">
                                    {costList.length > 0
                                        ? `${costList.length} entr${costList.length === 1 ? 'y' : 'ies'} · Total: ${formatCurrency(costTotal)}`
                                        : 'Track expenses for this visa application'}
                                </p>
                            </div>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => setShowAddCost(v => !v)}>
                            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Cost
                        </Button>
                    </div>

                    {/* Inline add form */}
                    {showAddCost && (
                        <div className="mb-4 rounded-xl border bg-muted/30 p-4 space-y-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">New Expense</p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="space-y-1">
                                    <label className="text-xs text-muted-foreground">Category</label>
                                    <select
                                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                                        value={costForm.category}
                                        onChange={e => setCostForm(f => ({ ...f, category: e.target.value as CostCategory }))}
                                    >
                                        {CATEGORIES.map(c => (
                                            <option key={c} value={c}>{COST_CATEGORY_LABELS[c]}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-muted-foreground">Amount (AED)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                                        value={costForm.amount || ''}
                                        onChange={e => setCostForm(f => ({ ...f, amount: Number(e.target.value) }))}
                                        placeholder="0.00"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-muted-foreground">Paid Date</label>
                                    <input
                                        type="date"
                                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                                        value={costForm.paidDate}
                                        onChange={e => setCostForm(f => ({ ...f, paidDate: e.target.value }))}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-muted-foreground">Receipt Ref (optional)</label>
                                    <input
                                        type="text"
                                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                                        value={costForm.receiptRef ?? ''}
                                        onChange={e => setCostForm(f => ({ ...f, receiptRef: e.target.value || undefined }))}
                                        placeholder="INV-001"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Description (optional)</label>
                                <input
                                    type="text"
                                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                                    value={costForm.description ?? ''}
                                    onChange={e => setCostForm(f => ({ ...f, description: e.target.value || undefined }))}
                                    placeholder="e.g. GDRFA entry permit fee"
                                />
                            </div>
                            <div className="flex gap-2 justify-end">
                                <Button size="sm" variant="ghost" onClick={() => setShowAddCost(false)}>Cancel</Button>
                                <Button size="sm" onClick={handleAddCost} disabled={addCost.isPending || costForm.amount <= 0}>
                                    {addCost.isPending ? 'Saving…' : 'Save Cost'}
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Cost list */}
                    {costsLoading ? (
                        <div className="space-y-2">
                            {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
                        </div>
                    ) : costList.length === 0 ? (
                        <div className="py-8 text-center">
                            <DollarSign className="h-7 w-7 text-muted-foreground/40 mx-auto mb-2" />
                            <p className="text-xs text-muted-foreground">No costs recorded for this application</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-border/50">
                            {costList.map(cost => (
                                <div key={cost.id} className="flex items-center gap-3 py-2.5">
                                    <div className="h-8 w-8 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">
                                        <Receipt className="h-3.5 w-3.5 text-primary" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">
                                            {COST_CATEGORY_LABELS[cost.category]}{cost.description ? ` — ${cost.description}` : ''}
                                        </p>
                                        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                                            <span>{formatDate(cost.paidDate)}</span>
                                            {cost.stepLabel && (
                                                <>
                                                    <span>·</span>
                                                    <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal">
                                                        {cost.stepLabel}
                                                    </Badge>
                                                </>
                                            )}
                                            {cost.receiptRef && <><span>·</span><span>{cost.receiptRef}</span></>}
                                        </p>
                                    </div>
                                    <span className="text-sm font-bold tabular-figures shrink-0">{formatCurrency(Number(cost.amount))}</span>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
                                        onClick={() => deleteCost.mutate(cost.id, { onSuccess: () => toast.success('Removed'), onError: () => toast.error('Failed') })}
                                        disabled={deleteCost.isPending}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>

                {/* ── Stage History — append-only journal of every step transition ── */}
                {history && history.length > 0 && (
                    <Card className="p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <Clock className="h-5 w-5 text-primary" />
                            <div>
                                <h3 className="font-semibold">Stage History</h3>
                                <p className="text-xs text-muted-foreground">
                                    {history.length} transition{history.length === 1 ? '' : 's'} recorded
                                </p>
                            </div>
                        </div>
                        <div className="space-y-3">
                            {history.map(h => (
                                <div key={h.id} className="rounded-lg border bg-background p-3 space-y-1.5">
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                        <div className="flex items-center gap-1.5 text-sm font-medium">
                                            <span>{h.fromStepLabel}</span>
                                            <span className="text-muted-foreground">→</span>
                                            <span className="text-primary">{h.toStepLabel ?? '—'}</span>
                                        </div>
                                        <span className="text-[11px] text-muted-foreground tabular-nums">
                                            {formatDate(h.createdAt)}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                                        {h.advancedByName && (
                                            <span>by {h.advancedByName}{h.advancedByRole ? ` (${h.advancedByRole})` : ''}</span>
                                        )}
                                        {h.costsCount > 0 && (
                                            <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal">
                                                {h.costsCount} cost{h.costsCount === 1 ? '' : 's'} · {formatCurrency(Number(h.costsTotal))}
                                            </Badge>
                                        )}
                                    </div>
                                    {h.notes && (
                                        <p className="text-xs text-muted-foreground italic">{h.notes}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </Card>
                )}
            </div>

            <AdvanceStageCostsDialog
                open={advanceDialogOpen}
                onOpenChange={setAdvanceDialogOpen}
                visaId={visa.id}
                employeeId={visa.employeeId}
                stepNumber={visa.currentStep}
                stageLabel={visaSteps[visa.currentStep - 1] ?? `Step ${visa.currentStep}`}
                nextStageLabel={visaSteps[visa.currentStep] ?? undefined}
                isFinal={visa.currentStep >= visa.totalSteps}
                onAdvanced={() => toast.success(t('common.savedSuccess'))}
            />

            <PromptDialog
                open={cancelDialogOpen}
                onOpenChange={setCancelDialogOpen}
                title="Cancel visa application"
                description="This will mark the application as cancelled and notify the audit log."
                label="Reason (optional)"
                placeholder="e.g. Employee withdrew offer"
                multiline
                allowEmpty
                confirmLabel="Cancel application"
                cancelLabel="Keep open"
                submitting={cancelVisa.isPending}
                onSubmit={submitCancel}
            />

            <PromptDialog
                open={stampingRefDialogOpen}
                onOpenChange={setStampingRefDialogOpen}
                title={visa.mohreRef ? 'Update stamping reference' : 'Record stamping reference'}
                description="Enter the MOHRE or GDRFA reference number for this stamping."
                label="Reference number"
                placeholder="e.g. MOHRE-2025-XXXX"
                defaultValue={visa.mohreRef ?? ''}
                hint={visa.mohreRef ? `Current: ${visa.mohreRef}` : 'Saved against the visa application and recorded in the activity log.'}
                confirmLabel={visa.mohreRef ? 'Update reference' : 'Save reference'}
                submitting={updateVisa.isPending}
                onSubmit={submitStampingRef}
            />

            <PromptDialog
                open={stampingApptDialogOpen}
                onOpenChange={setStampingApptDialogOpen}
                title="Schedule stamping appointment"
                description="We'll create a reminder this many days from today."
                label="Days from now"
                inputType="number"
                integer
                min={1}
                max={365}
                defaultValue="7"
                hint="Between 1 and 365 days."
                confirmLabel="Set reminder"
                onSubmit={submitStampingAppt}
            />
        </PageWrapper>
    )
}
