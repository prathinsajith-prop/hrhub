import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useExitRequests, useInitiateExit, useApproveExit, useMarkSettlementPaid, useSettlementPreview, type ExitRequest } from '@/hooks/useExit'
import { useEmployees } from '@/hooks/useEmployees'
import { LogOut, DollarSign, CheckCircle2, Clock, AlertCircle } from 'lucide-react'

const statusConfig: Record<string, { label: string; color: string }> = {
    pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    approved: { label: 'Approved', color: 'bg-blue-100 text-blue-800 border-blue-200' },
    rejected: { label: 'Rejected', color: 'bg-red-100 text-red-800 border-red-200' },
    completed: { label: 'Completed', color: 'bg-green-100 text-green-800 border-green-200' },
}

const exitTypeLabel: Record<string, string> = {
    resignation: 'Resignation',
    termination: 'Termination',
    contract_end: 'Contract End',
    retirement: 'Retirement',
}

function fmt(n: string | number | undefined) {
    if (n === undefined || n === null) return '—'
    return `AED ${Number(n).toLocaleString('en-AE', { minimumFractionDigits: 2 })}`
}

function fmtDate(d: string | undefined) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-AE')
}

function ExitCard({ req, onApprove, onPaid }: { req: ExitRequest; onApprove: (id: string) => void; onPaid: (id: string) => void }) {
    const sc = statusConfig[req.status]
    return (
        <Card className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="font-semibold text-sm">{exitTypeLabel[req.exitType]}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Exit Date: {fmtDate(req.exitDate)} · LWD: {fmtDate(req.lastWorkingDay)}</p>
                    {req.reason && <p className="text-xs text-muted-foreground mt-1 italic">{req.reason}</p>}
                </div>
                <Badge variant="outline" className={sc.color}>{sc.label}</Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                    <p className="text-xs text-muted-foreground">Gratuity</p>
                    <p className="font-medium">{fmt(req.gratuityAmount)}</p>
                </div>
                <div>
                    <p className="text-xs text-muted-foreground">Leave Encashment</p>
                    <p className="font-medium">{fmt(req.leaveEncashmentAmount)}</p>
                </div>
                <div>
                    <p className="text-xs text-muted-foreground">Unpaid Salary</p>
                    <p className="font-medium">{fmt(req.unpaidSalaryAmount)}</p>
                </div>
                <div>
                    <p className="text-xs text-muted-foreground font-semibold">Total Settlement</p>
                    <p className="font-bold text-primary">{fmt(req.totalSettlement)}</p>
                </div>
            </div>
            <div className="flex gap-2 pt-1">
                {req.status === 'pending' && (
                    <Button size="sm" onClick={() => onApprove(req.id)}>Approve</Button>
                )}
                {req.status === 'approved' && !req.settlementPaid && (
                    <Button size="sm" variant="outline" onClick={() => onPaid(req.id)}>
                        <DollarSign className="h-3.5 w-3.5 mr-1" /> Mark Settlement Paid
                    </Button>
                )}
                {req.settlementPaid && (
                    <div className="flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Settlement Paid {fmtDate(req.settlementPaidDate)}
                    </div>
                )}
            </div>
        </Card>
    )
}

interface InitiateForm {
    employeeId: string
    exitType: 'resignation' | 'termination' | 'contract_end' | 'retirement'
    exitDate: string
    lastWorkingDay: string
    noticePeriodDays: number
    reason: string
    notes: string
}

const defaultForm: InitiateForm = {
    employeeId: '',
    exitType: 'resignation',
    exitDate: '',
    lastWorkingDay: '',
    noticePeriodDays: 30,
    reason: '',
    notes: '',
}

export function ExitPage() {
    const { t } = useTranslation()
    const { data: exits, isLoading } = useExitRequests()
    const { data: employees } = useEmployees({ limit: 200 })
    const initiate = useInitiateExit()
    const approve = useApproveExit()
    const markPaid = useMarkSettlementPaid()

    const [showDialog, setShowDialog] = useState(false)
    const [form, setForm] = useState<InitiateForm>(defaultForm)
    const [step, setStep] = useState<'form' | 'preview'>('form')

    const previewEnabled = !!form.employeeId && !!form.exitDate && !!form.exitType
    const { data: preview, isLoading: previewLoading } = useSettlementPreview(
        previewEnabled ? form.employeeId : undefined,
        previewEnabled ? form.exitDate : undefined,
        previewEnabled ? form.exitType : undefined
    )

    const set = (k: keyof InitiateForm, v: string | number) => setForm(f => ({ ...f, [k]: v }))

    async function handleSubmit() {
        await initiate.mutateAsync(form)
        setShowDialog(false)
        setForm(defaultForm)
        setStep('form')
    }

    const empList = Array.isArray(employees) ? employees : (employees as any)?.data ?? []
    const exitList = Array.isArray(exits) ? exits : (exits as any)?.data ?? []

    const pending = exitList.filter((e: ExitRequest) => e.status === 'pending').length
    const total = exitList.length

    return (
        <PageWrapper>
            <PageHeader
                title={t('exit.title')}
                description={t('exit.description')}
                actions={
                    <Button onClick={() => { setShowDialog(true); setStep('form') }}>
                        <LogOut className="h-4 w-4 mr-2" /> Initiate Exit
                    </Button>
                }
            />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <Card className="p-4 text-center">
                    <p className="text-2xl font-bold">{total}</p>
                    <p className="text-xs text-muted-foreground mt-1">Total Requests</p>
                </Card>
                <Card className="p-4 text-center">
                    <p className="text-2xl font-bold text-yellow-600">{pending}</p>
                    <p className="text-xs text-muted-foreground mt-1">Pending Approval</p>
                </Card>
                <Card className="p-4 text-center">
                    <p className="text-2xl font-bold text-blue-600">{exitList.filter((e: ExitRequest) => e.status === 'approved').length}</p>
                    <p className="text-xs text-muted-foreground mt-1">Approved</p>
                </Card>
                <Card className="p-4 text-center">
                    <p className="text-2xl font-bold text-green-600">{exitList.filter((e: ExitRequest) => e.status === 'completed').length}</p>
                    <p className="text-xs text-muted-foreground mt-1">Completed</p>
                </Card>
            </div>

            {isLoading && (
                <div className="flex items-center justify-center py-16">
                    <Clock className="h-6 w-6 text-muted-foreground animate-spin" />
                </div>
            )}

            {!isLoading && exitList.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                    <AlertCircle className="h-10 w-10 text-muted-foreground" />
                    <p className="text-muted-foreground">No exit requests yet.</p>
                </div>
            )}

            <div className="space-y-4">
                {exitList.map((req: ExitRequest) => (
                    <ExitCard
                        key={req.id}
                        req={req}
                        onApprove={(id) => approve.mutate(id)}
                        onPaid={(id) => markPaid.mutate(id)}
                    />
                ))}
            </div>

            <Dialog open={showDialog} onOpenChange={setShowDialog}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Initiate Employee Exit</DialogTitle>
                    </DialogHeader>

                    {step === 'form' && (
                        <div className="space-y-4 py-2">
                            <div className="space-y-1.5">
                                <Label>Employee</Label>
                                <Select value={form.employeeId} onValueChange={v => set('employeeId', v)}>
                                    <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                                    <SelectContent>
                                        {empList.map((e: any) => (
                                            <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Exit Type</Label>
                                <Select value={form.exitType} onValueChange={v => set('exitType', v)}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="resignation">Resignation</SelectItem>
                                        <SelectItem value="termination">Termination</SelectItem>
                                        <SelectItem value="contract_end">Contract End</SelectItem>
                                        <SelectItem value="retirement">Retirement</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label>Exit Date</Label>
                                    <Input type="date" value={form.exitDate} min={new Date().toISOString().split('T')[0]} onChange={e => set('exitDate', e.target.value)} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Last Working Day</Label>
                                    <Input type="date" value={form.lastWorkingDay} min={form.exitDate || new Date().toISOString().split('T')[0]} onChange={e => set('lastWorkingDay', e.target.value)} />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Notice Period (days)</Label>
                                <Input type="number" value={form.noticePeriodDays} onChange={e => set('noticePeriodDays', Number(e.target.value))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Reason</Label>
                                <Textarea value={form.reason} onChange={e => set('reason', e.target.value)} rows={2} />
                            </div>
                        </div>
                    )}

                    {step === 'preview' && preview && (
                        <div className="space-y-4 py-2">
                            <p className="text-sm font-medium">{preview.employeeName} · {preview.yearsOfService} years of service</p>
                            <div className="divide-y rounded-lg border overflow-hidden text-sm">
                                {[
                                    ['Gratuity (UAE Labour Law)', fmt(preview.gratuityAmount)],
                                    [`Leave Encashment (${preview.unusedLeaveDays} days)`, fmt(preview.leaveEncashmentAmount)],
                                    ['Unpaid Salary (current month)', fmt(preview.unpaidSalaryAmount)],
                                    ['Deductions', fmt(preview.deductions)],
                                ].map(([label, val]) => (
                                    <div key={label} className="flex justify-between px-4 py-2.5">
                                        <span className="text-muted-foreground">{label}</span>
                                        <span className="font-medium">{val}</span>
                                    </div>
                                ))}
                                <div className="flex justify-between px-4 py-3 bg-muted/50 font-semibold">
                                    <span>Total Settlement</span>
                                    <span className="text-primary">{fmt(preview.totalSettlement)}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 'preview' && previewLoading && (
                        <div className="py-8 text-center text-sm text-muted-foreground">Calculating settlement...</div>
                    )}

                    <DialogFooter>
                        {step === 'form' && (
                            <>
                                <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
                                <Button
                                    onClick={() => setStep('preview')}
                                    disabled={!form.employeeId || !form.exitDate || !form.lastWorkingDay}
                                >
                                    Preview Settlement
                                </Button>
                            </>
                        )}
                        {step === 'preview' && (
                            <>
                                <Button variant="outline" onClick={() => setStep('form')}>Back</Button>
                                <Button onClick={handleSubmit} disabled={initiate.isPending}>
                                    {initiate.isPending ? 'Submitting...' : 'Confirm & Submit'}
                                </Button>
                            </>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </PageWrapper>
    )
}
