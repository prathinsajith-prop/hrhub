import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, CheckCircle2, Clock, AlertTriangle, XCircle, FileText, Hash } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate, cn } from '@/lib/utils'
import { useVisas, useAdvanceVisaStep, useCancelVisa } from '@/hooks/useVisa'
import { toast } from '@/components/ui/overlays'
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

const visaSteps = [
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

export function VisaDetailPage() {
    const { t } = useTranslation()
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const { data, isLoading } = useVisas({ limit: 100 })
    const advanceStep = useAdvanceVisaStep()
    const cancelVisa = useCancelVisa()

    const visas = (data?.data ?? []) as VisaApplication[]
    const visa = visas.find((v) => v.id === id)

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
        advanceStep.mutate(visa!.id, {
            onSuccess: () => toast.success(t('common.savedSuccess')),
            onError: () => toast.error(t('common.saveFailed')),
        })
    }

    function handleCancel() {
        const reason = window.prompt(
            'Please provide a reason for cancelling this visa application (optional):',
            '',
        )
        // `null` means the user dismissed the prompt — abort. Empty string is allowed.
        if (reason === null) return
        cancelVisa.mutate({ id: visa!.id, reason: reason.trim() || undefined }, {
            onSuccess: () => { toast.success(t('common.cancelled')); navigate('/visa') },
            onError: () => toast.error(t('common.saveFailed')),
        })
    }

    return (
        <PageWrapper>
            <PageHeader
                title={visa.employeeName}
                description={`${visa.visaType.replace(/_/g, ' ')} · Application ID: ${visa.id.slice(0, 8).toUpperCase()}`}
                actions={
                    <Button variant="ghost" size="sm" onClick={() => navigate('/visa')}>
                        <ArrowLeft className="h-4 w-4 mr-2" /> Back
                    </Button>
                }
            />

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
                                        disabled={advanceStep.isPending}
                                    >
                                        {advanceStep.isPending ? (
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
                                        onClick={() => {
                                            const ref = window.prompt('Enter MOHRE / GDRFA reference for stamping:')
                                            if (ref && ref.trim()) {
                                                toast.success(`Reference recorded: ${ref.trim()}`)
                                                // TODO: wire to useUpdateVisa({ id, mohreRef: ref })
                                            }
                                        }}
                                    >
                                        <Hash className="h-3.5 w-3.5 mr-2" />
                                        Record stamping reference
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="w-full justify-start text-xs"
                                        onClick={() => {
                                            const days = window.prompt('Stamping appointment in how many days?', '7')
                                            if (days) toast.info(`Reminder set in ${days} day(s)`)
                                        }}
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
                <Card className="lg:col-span-2 p-6">
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
                                                    disabled={advanceStep.isPending}
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
        </PageWrapper>
    )
}
