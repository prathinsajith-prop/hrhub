import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { usePerformanceReviews, useCreateReview, useUpdateReview, type PerformanceReview } from '@/hooks/usePerformance'
import { useEmployees } from '@/hooks/useEmployees'
import { Star, TrendingUp, Plus } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

const statusConfig: Record<string, { label: string; color: string }> = {
    draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700 border-gray-200' },
    submitted: { label: 'Submitted', color: 'bg-blue-100 text-blue-800 border-blue-200' },
    acknowledged: { label: 'Acknowledged', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    completed: { label: 'Completed', color: 'bg-green-100 text-green-800 border-green-200' },
}

function RatingStars({ rating }: { rating?: number }) {
    if (!rating) return <span className="text-muted-foreground text-xs">Not rated</span>
    return (
        <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map(i => (
                <Star key={i} className={`h-3.5 w-3.5 ${i <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} />
            ))}
        </div>
    )
}

function ScoreBar({ label, score }: { label: string; score?: number }) {
    if (!score) return null
    return (
        <div className="space-y-0.5">
            <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium">{score}/5</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: `${score * 20}%` }} />
            </div>
        </div>
    )
}

interface ReviewForm {
    employeeId: string
    period: string
    reviewDate: string
    overallRating: number
    qualityScore: number
    productivityScore: number
    teamworkScore: number
    attendanceScore: number
    initiativeScore: number
    strengths: string
    improvements: string
    goals: string
    managerComments: string
}

const defaultForm: ReviewForm = {
    employeeId: '', period: '', reviewDate: '', overallRating: 3,
    qualityScore: 3, productivityScore: 3, teamworkScore: 3, attendanceScore: 3, initiativeScore: 3,
    strengths: '', improvements: '', goals: '', managerComments: '',
}

export function PerformancePage() {
    const { t } = useTranslation()
    const [searchParams, setSearchParams] = useSearchParams()
    const lockedEmployeeId = searchParams.get('employeeId') ?? ''
    const { data: reviews, isLoading } = usePerformanceReviews()
    const { data: employees } = useEmployees({ limit: 1000 })
    const createReview = useCreateReview()
    const updateReview = useUpdateReview()

    const [showDialog, setShowDialog] = useState(!!lockedEmployeeId)
    const [form, setForm] = useState<ReviewForm>(() =>
        lockedEmployeeId ? { ...defaultForm, employeeId: lockedEmployeeId } : defaultForm,
    )
    const [activeTab, setActiveTab] = useState<'all' | 'draft' | 'completed'>('all')

    const set = (k: keyof ReviewForm, v: string | number) => setForm(f => ({ ...f, [k]: v }))

    async function handleSubmit() {
        await createReview.mutateAsync(form)
        setShowDialog(false)
        setForm(defaultForm)
        if (lockedEmployeeId) {
            const next = new URLSearchParams(searchParams)
            next.delete('employeeId')
            setSearchParams(next, { replace: true })
        }
    }

    function handleDialogChange(open: boolean) {
        setShowDialog(open)
        if (!open && lockedEmployeeId) {
            const next = new URLSearchParams(searchParams)
            next.delete('employeeId')
            setSearchParams(next, { replace: true })
            setForm(defaultForm)
        }
    }

    const empList = Array.isArray(employees) ? employees : (employees as any)?.data ?? []
    const reviewList: PerformanceReview[] = Array.isArray(reviews) ? reviews : []
    const filtered = activeTab === 'all' ? reviewList : reviewList.filter(r => r.status === activeTab || (activeTab === 'completed' && r.status === 'completed'))

    return (
        <PageWrapper>
            <PageHeader
                title={t('performance.title')}
                description={t('performance.description')}
                actions={
                    <Button onClick={() => setShowDialog(true)}>
                        <Plus className="h-4 w-4 mr-2" /> New Review
                    </Button>
                }
            />

            <div className="flex gap-2 mb-6">
                {(['all', 'draft', 'completed'] as const).map(tab => (
                    <Button key={tab} variant={activeTab === tab ? 'default' : 'outline'} size="sm"
                        onClick={() => setActiveTab(tab)} className="capitalize">{tab}</Button>
                ))}
            </div>

            {isLoading && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="rounded-xl border p-5 space-y-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="space-y-1.5 flex-1">
                                    <Skeleton className="h-4 w-40" />
                                    <Skeleton className="h-3 w-32" />
                                    <div className="flex gap-1 mt-2">
                                        {Array.from({ length: 5 }).map((_, j) => <Skeleton key={j} className="h-4 w-4 rounded" />)}
                                    </div>
                                </div>
                                <Skeleton className="h-5 w-20 rounded-full" />
                            </div>
                            {['Quality', 'Productivity', 'Teamwork', 'Attendance', 'Initiative'].map(label => (
                                <div key={label} className="flex items-center gap-3">
                                    <Skeleton className="h-3 w-20 shrink-0" />
                                    <Skeleton className="h-2 flex-1 rounded-full" />
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            )}

            {!isLoading && filtered.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-16">
                    <TrendingUp className="h-10 w-10 text-muted-foreground" />
                    <p className="text-muted-foreground text-sm">No reviews found.</p>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filtered.map((rev: PerformanceReview) => {
                    const emp = empList.find((e: any) => e.id === rev.employeeId)
                    const sc = statusConfig[rev.status]
                    return (
                        <Card key={rev.id} className="p-5 space-y-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="font-semibold text-sm">{emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown'}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">{rev.period} · {rev.reviewDate ?? 'No date'}</p>
                                    <div className="mt-2">
                                        <RatingStars rating={rev.overallRating} />
                                    </div>
                                </div>
                                <Badge variant="outline" className={sc.color}>{sc.label}</Badge>
                            </div>
                            <div className="space-y-2">
                                <ScoreBar label="Quality" score={rev.qualityScore} />
                                <ScoreBar label="Productivity" score={rev.productivityScore} />
                                <ScoreBar label="Teamwork" score={rev.teamworkScore} />
                                <ScoreBar label="Attendance" score={rev.attendanceScore} />
                                <ScoreBar label="Initiative" score={rev.initiativeScore} />
                            </div>
                            {rev.strengths && <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Strengths:</span> {rev.strengths}</p>}
                            {rev.status === 'draft' && (
                                <Button size="sm" variant="outline" onClick={() => updateReview.mutate({ id: rev.id, status: 'submitted' })}>
                                    Submit Review
                                </Button>
                            )}
                        </Card>
                    )
                })}
            </div>

            <Dialog open={showDialog} onOpenChange={handleDialogChange}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>New Performance Review</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>Employee</Label>
                                <Select value={form.employeeId} onValueChange={v => set('employeeId', v)} disabled={!!lockedEmployeeId}>
                                    <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                                    <SelectContent>
                                        {empList.map((e: any) => (
                                            <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {lockedEmployeeId && (
                                    <p className="text-[11px] text-muted-foreground">Employee preselected from profile.</p>
                                )}
                            </div>
                            <div className="space-y-1.5">
                                <Label>Period (e.g. 2024-Q2)</Label>
                                <Input value={form.period} onChange={e => set('period', e.target.value)} placeholder="2024-Q2" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>Review Date</Label>
                                <DatePicker value={form.reviewDate} max={new Date().toISOString().split('T')[0]} onChange={v => set('reviewDate', v)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Overall Rating: {form.overallRating}/5</Label>
                                <Input type="range" min={1} max={5} step={1} value={form.overallRating}
                                    onChange={e => set('overallRating', Number(e.target.value))} className="accent-primary" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            {(['qualityScore', 'productivityScore', 'teamworkScore', 'attendanceScore', 'initiativeScore'] as const).map(k => (
                                <div key={k} className="space-y-1.5">
                                    <Label className="capitalize">{k.replace('Score', '').replace(/([A-Z])/g, ' $1')}: {form[k]}/5</Label>
                                    <Input type="range" min={1} max={5} step={1} value={form[k]}
                                        onChange={e => set(k, Number(e.target.value))} className="accent-primary" />
                                </div>
                            ))}
                        </div>
                        <div className="space-y-1.5">
                            <Label>Strengths</Label>
                            <Textarea value={form.strengths} onChange={e => set('strengths', e.target.value)} rows={2} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Areas for Improvement</Label>
                            <Textarea value={form.improvements} onChange={e => set('improvements', e.target.value)} rows={2} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Goals for Next Period</Label>
                            <Textarea value={form.goals} onChange={e => set('goals', e.target.value)} rows={2} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Manager Comments</Label>
                            <Textarea value={form.managerComments} onChange={e => set('managerComments', e.target.value)} rows={2} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => handleDialogChange(false)}>Cancel</Button>
                        <Button onClick={handleSubmit} disabled={createReview.isPending || !form.employeeId || !form.period}>
                            {createReview.isPending ? 'Saving...' : 'Save Review'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </PageWrapper>
    )
}
