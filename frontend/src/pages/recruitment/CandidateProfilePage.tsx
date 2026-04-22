import { useParams, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, User, Mail, Phone, Globe, Briefcase, DollarSign, Star, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { useApplications, useUpdateApplicationStage } from '@/hooks/useRecruitment'
import { toast } from '@/components/ui/overlays'
import type { Candidate, ApplicationStage } from '@/types'

const stageLabel: Record<ApplicationStage, string> = {
    received: 'Received',
    screening: 'Screening',
    interview: 'Interview',
    assessment: 'Assessment',
    offer: 'Offer',
    pre_boarding: 'Pre-Boarding',
    rejected: 'Rejected',
}

const stageStyles: Record<ApplicationStage, string> = {
    received: 'bg-muted text-muted-foreground',
    screening: 'bg-info/10 text-info border-info/20',
    interview: 'bg-primary/10 text-primary border-primary/20',
    assessment: 'bg-warning/10 text-warning border-warning/20',
    offer: 'bg-success/10 text-success border-success/20',
    pre_boarding: 'bg-success/10 text-success border-success/20',
    rejected: 'bg-destructive/10 text-destructive border-destructive/20',
}

const stageOrder: ApplicationStage[] = ['received', 'screening', 'interview', 'assessment', 'offer', 'pre_boarding']

export function CandidateProfilePage() {
    const { t } = useTranslation()
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const { data, isLoading } = useApplications({ limit: 200 })
    const updateStage = useUpdateApplicationStage()
    const [rejectOpen, setRejectOpen] = useState(false)

    const candidates = (data?.data ?? []) as Candidate[]
    const candidate = candidates.find((c) => c.id === id)

    if (isLoading) {
        return (
            <PageWrapper>
                <PageHeader title={t('recruitment.candidates')} description={t('common.loading')} />
                <div className="grid grid-cols-1 gap-4">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
                </div>
            </PageWrapper>
        )
    }

    if (!candidate) {
        return (
            <PageWrapper>
                <PageHeader title="Candidate Profile" description="Not found" />
                <div className="flex flex-col items-center gap-4 py-16">
                    <XCircle className="h-12 w-12 text-muted-foreground" />
                    <p className="text-muted-foreground">Candidate not found.</p>
                    <Button variant="outline" onClick={() => navigate('/recruitment')}>
                        <ArrowLeft className="h-4 w-4 mr-2" /> Back to Recruitment
                    </Button>
                </div>
            </PageWrapper>
        )
    }

    function handleAdvanceStage() {
        const currentIdx = stageOrder.indexOf(candidate!.stage)
        if (currentIdx < stageOrder.length - 1) {
            const nextStage = stageOrder[currentIdx + 1]
            updateStage.mutate(
                { id: candidate!.id, stage: nextStage },
                {
                    onSuccess: () => toast.success(`Moved to ${stageLabel[nextStage]}`),
                    onError: () => toast.error('Failed to update stage'),
                },
            )
        }
    }

    function handleReject() {
        updateStage.mutate(
            { id: candidate!.id, stage: 'rejected' },
            {
                onSuccess: () => { toast.success('Candidate rejected'); navigate('/recruitment') },
                onError: () => toast.error('Failed to update stage'),
            },
        )
    }

    const currentStageIdx = stageOrder.indexOf(candidate.stage)
    const isRejected = candidate.stage === 'rejected'
    const isLastStage = currentStageIdx >= stageOrder.length - 1

    return (
        <PageWrapper>
            <PageHeader
                title={candidate.name}
                description={`Applied ${candidate.appliedDate ? new Date(candidate.appliedDate).toLocaleDateString() : ''}`}
                actions={
                    <Button variant="ghost" size="sm" onClick={() => navigate('/recruitment')}>
                        <ArrowLeft className="h-4 w-4 mr-2" /> Back
                    </Button>
                }
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Sidebar */}
                <div className="lg:col-span-1 space-y-4">
                    <Card className="p-5 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                                <User className="h-7 w-7 text-primary" />
                            </div>
                            <div>
                                <h3 className="font-semibold">{candidate.name}</h3>
                                <Badge variant="outline" className={cn('text-[11px] mt-1', stageStyles[candidate.stage])}>
                                    {stageLabel[candidate.stage]}
                                </Badge>
                            </div>
                        </div>

                        <dl className="space-y-2 text-sm">
                            <div className="flex items-center gap-2">
                                <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="truncate text-muted-foreground">{candidate.email}</span>
                            </div>
                            {candidate.phone && (
                                <div className="flex items-center gap-2">
                                    <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <span className="text-muted-foreground">{candidate.phone}</span>
                                </div>
                            )}
                            {candidate.nationality && (
                                <div className="flex items-center gap-2">
                                    <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <span className="text-muted-foreground">{candidate.nationality}</span>
                                </div>
                            )}
                            {candidate.experience !== undefined && (
                                <div className="flex items-center gap-2">
                                    <Briefcase className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <span className="text-muted-foreground">{candidate.experience} years exp.</span>
                                </div>
                            )}
                            {candidate.expectedSalary && (
                                <div className="flex items-center gap-2">
                                    <DollarSign className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <span className="text-muted-foreground">Expects AED {candidate.expectedSalary?.toLocaleString()}</span>
                                </div>
                            )}
                            {candidate.score !== undefined && (
                                <div className="flex items-center gap-2">
                                    <Star className="h-3.5 w-3.5 text-warning shrink-0" />
                                    <span className="text-muted-foreground">Score: <strong>{candidate.score}/100</strong></span>
                                </div>
                            )}
                        </dl>
                    </Card>

                    {!isRejected && (
                        <div className="space-y-2">
                            {!isLastStage && (
                                <Button
                                    className="w-full"
                                    onClick={handleAdvanceStage}
                                    disabled={updateStage.isPending}
                                >
                                    Move to {stageOrder[currentStageIdx + 1] ? stageLabel[stageOrder[currentStageIdx + 1]] : 'Next Stage'}
                                </Button>
                            )}
                            <Button
                                variant="outline"
                                className="w-full text-destructive border-destructive/30 hover:bg-destructive/5"
                                onClick={() => setRejectOpen(true)}
                                disabled={updateStage.isPending}
                            >
                                Reject Candidate
                            </Button>
                        </div>
                    )}
                </div>

                {/* Main content */}
                <div className="lg:col-span-2">
                    <Tabs defaultValue="pipeline">
                        <TabsList>
                            <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
                            <TabsTrigger value="notes">Notes</TabsTrigger>
                        </TabsList>

                        <TabsContent value="pipeline" className="mt-4">
                            <Card className="p-6">
                                <h3 className="font-semibold mb-6 text-sm">Recruitment Pipeline</h3>
                                <div className="space-y-4">
                                    {stageOrder.map((stage, i) => {
                                        const done = i < currentStageIdx
                                        const current = i === currentStageIdx && !isRejected
                                        return (
                                            <div key={stage} className="flex gap-4">
                                                <div className="flex flex-col items-center">
                                                    <div className={cn(
                                                        'h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold border-2',
                                                        done ? 'bg-success border-success text-success-foreground' :
                                                            current ? 'bg-primary border-primary text-primary-foreground' :
                                                                'bg-card border-border text-muted-foreground'
                                                    )}>
                                                        {done ? '✓' : i + 1}
                                                    </div>
                                                    {i < stageOrder.length - 1 && (
                                                        <div className={cn('w-0.5 flex-1 min-h-[24px] mt-1', done ? 'bg-success' : 'bg-border')} />
                                                    )}
                                                </div>
                                                <div className="pb-4 flex-1">
                                                    <p className={cn(
                                                        'font-medium text-sm',
                                                        done ? 'text-success' : current ? 'text-primary' : 'text-muted-foreground'
                                                    )}>
                                                        {stageLabel[stage]}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground mt-0.5">
                                                        {done ? 'Completed' : current ? 'Current Stage' : 'Upcoming'}
                                                    </p>
                                                </div>
                                            </div>
                                        )
                                    })}
                                    {isRejected && (
                                        <div className="flex gap-4">
                                            <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold border-2 bg-destructive border-destructive text-destructive-foreground">
                                                ✕
                                            </div>
                                            <div className="flex-1">
                                                <p className="font-medium text-sm text-destructive">Rejected</p>
                                                <p className="text-xs text-muted-foreground mt-0.5">Application closed</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </Card>
                        </TabsContent>

                        <TabsContent value="notes" className="mt-4">
                            <Card className="p-6">
                                <h3 className="font-semibold mb-4 text-sm">Notes</h3>
                                {candidate.notes ? (
                                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{candidate.notes}</p>
                                ) : (
                                    <p className="text-sm text-muted-foreground italic">No notes recorded for this candidate.</p>
                                )}
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>

            <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Reject this candidate?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will move <strong>{candidate.name}</strong> to the rejected stage. You can still
                            view their profile and history afterwards.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={handleReject}
                        >
                            Reject Candidate
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </PageWrapper>
    )
}
