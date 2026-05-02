import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DatePicker } from '@/components/ui/date-picker'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmployeeSelect } from '@/components/shared/EmployeeSelect'
import { useCreateReview } from '@/hooks/usePerformance'
import { toast } from '@/components/ui/overlays'

export interface ReviewForm {
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

const defaultForm = (): ReviewForm => ({
    employeeId: '', period: '', reviewDate: '', overallRating: 3,
    qualityScore: 3, productivityScore: 3, teamworkScore: 3, attendanceScore: 3, initiativeScore: 3,
    strengths: '', improvements: '', goals: '', managerComments: '',
})

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** When set, locks the employee selector to this ID */
    lockedEmployeeId?: string
    onSuccess?: () => void
}

export function CreatePerformanceReviewDialog({ open, onOpenChange, lockedEmployeeId, onSuccess }: Props) {
    const createReview = useCreateReview()
    const [form, setForm] = useState<ReviewForm>(() =>
        lockedEmployeeId ? { ...defaultForm(), employeeId: lockedEmployeeId } : defaultForm(),
    )

    const set = (k: keyof ReviewForm, v: string | number) => setForm(f => ({ ...f, [k]: v }))

    function handleClose(nextOpen: boolean) {
        if (!nextOpen) {
            setForm(lockedEmployeeId ? { ...defaultForm(), employeeId: lockedEmployeeId } : defaultForm())
        }
        onOpenChange(nextOpen)
    }

    async function handleSubmit() {
        if (!form.employeeId) { toast.error('Validation', 'Please select an employee.'); return }
        if (!form.period) { toast.error('Validation', 'Review period is required.'); return }
        try {
            await createReview.mutateAsync({ ...form, status: 'draft' })
            toast.success('Review created', 'Performance review saved as draft.')
            handleClose(false)
            onSuccess?.()
        } catch {
            toast.error('Save failed', 'Could not save the performance review.')
        }
    }

    const currentYear = new Date().getFullYear()
    const years = [currentYear - 1, currentYear, currentYear + 1]
    const [selYear, selQ] = form.period?.includes('-Q')
        ? [form.period.split('-Q')[0]!, `Q${form.period.split('-Q')[1]!}`]
        : [String(currentYear), '']

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>New Performance Review</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>Employee <span className="text-destructive">*</span></Label>
                            <EmployeeSelect
                                value={form.employeeId}
                                onValueChange={v => set('employeeId', v)}
                                disabled={!!lockedEmployeeId}
                            />
                            {lockedEmployeeId && (
                                <p className="text-[11px] text-muted-foreground">Preselected from employee profile.</p>
                            )}
                        </div>
                        <div className="space-y-1.5">
                            <Label>Period <span className="text-destructive">*</span></Label>
                            <div className="flex gap-2">
                                <Select value={selYear} onValueChange={v => set('period', selQ ? `${v}-${selQ}` : v)}>
                                    <SelectTrigger className="flex-1"><SelectValue placeholder="Year" /></SelectTrigger>
                                    <SelectContent>
                                        {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <Select value={selQ} onValueChange={v => set('period', `${selYear}-${v}`)}>
                                    <SelectTrigger className="flex-1"><SelectValue placeholder="Quarter" /></SelectTrigger>
                                    <SelectContent>
                                        {['Q1', 'Q2', 'Q3', 'Q4'].map(q => (
                                            <SelectItem key={q} value={q}>
                                                {q} ({q === 'Q1' ? 'Jan–Mar' : q === 'Q2' ? 'Apr–Jun' : q === 'Q3' ? 'Jul–Sep' : 'Oct–Dec'})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            {form.period && <p className="text-xs text-muted-foreground">Period: {form.period}</p>}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>Review Date</Label>
                            <DatePicker
                                value={form.reviewDate}
                                max={new Date().toISOString().split('T')[0]}
                                onChange={v => set('reviewDate', v ?? '')}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Overall Rating: {form.overallRating}/5</Label>
                            <Input
                                type="range" min={1} max={5} step={1}
                                value={form.overallRating}
                                onChange={e => set('overallRating', Number(e.target.value))}
                                className="accent-primary"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {(['qualityScore', 'productivityScore', 'teamworkScore', 'attendanceScore', 'initiativeScore'] as const).map(k => {
                            const label = k.replace('Score', '').replace(/([A-Z])/g, ' $1').trim()
                            return (
                                <div key={k} className="space-y-1.5">
                                    <Label className="capitalize">{label}: {form[k]}/5</Label>
                                    <Input
                                        type="range" min={1} max={5} step={1}
                                        value={form[k]}
                                        onChange={e => set(k, Number(e.target.value))}
                                        className="accent-primary"
                                    />
                                </div>
                            )
                        })}
                    </div>

                    <div className="space-y-1.5">
                        <Label>Strengths</Label>
                        <Textarea value={form.strengths} onChange={e => set('strengths', e.target.value)} rows={2} placeholder="Key strengths…" />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Areas for Improvement</Label>
                        <Textarea value={form.improvements} onChange={e => set('improvements', e.target.value)} rows={2} placeholder="Areas to improve…" />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Goals for Next Period</Label>
                        <Textarea value={form.goals} onChange={e => set('goals', e.target.value)} rows={2} placeholder="Goals for next period…" />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Manager Comments</Label>
                        <Textarea value={form.managerComments} onChange={e => set('managerComments', e.target.value)} rows={2} placeholder="Additional comments…" />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => handleClose(false)} disabled={createReview.isPending}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={createReview.isPending || !form.employeeId || !form.period}
                    >
                        {createReview.isPending ? 'Saving…' : 'Save Review'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
