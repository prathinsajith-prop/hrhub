import { useState } from 'react'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Calendar, Clock, CheckCircle2, XCircle, Ban, X, RefreshCcw } from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'
import { ConfirmDialog, toast } from '@/components/ui/overlays'
import { useCurrentEmployeeId } from '@/hooks/useCurrentEmployeeId'
import { useLeaveRequests, useCreateLeave, useLeaveBalance, useCancelLeave } from '@/hooks/useLeave'
import type { LeaveRequest } from '@/types'
import { LEAVE_TYPE_LABELS } from '@/lib/enums'
import { LEAVE_TYPE_OPTIONS, type SelectOption } from '@/lib/options'
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/form-controls'
import { DatePicker } from '@/components/ui/date-picker'
import { Textarea } from '@/components/ui/textarea'

const LEAVE_TYPE_COLORS: Record<string, string> = {
    annual: 'bg-blue-100 text-blue-700',
    sick: 'bg-red-100 text-red-700',
    maternity: 'bg-pink-100 text-pink-700',
    paternity: 'bg-primary/10 text-primary',
    compassionate: 'bg-slate-100 text-slate-700',
    hajj: 'bg-amber-100 text-amber-700',
    unpaid: 'bg-gray-100 text-gray-600',
}
const STATUS_VARIANT: Record<string, string> = {
    pending: 'warning', approved: 'success', rejected: 'destructive', cancelled: 'secondary',
}
const STATUS_ICON: Record<string, React.FC<{ className?: string }>> = {
    pending: Clock,
    approved: CheckCircle2,
    rejected: XCircle,
    cancelled: Ban,
}

function ApplyDialog({ employeeId, onClose }: { employeeId: string; onClose: () => void }) {
    const create = useCreateLeave()
    const [form, setForm] = useState({ leaveType: 'annual', startDate: '', endDate: '', reason: '' })

    async function submit() {
        if (!form.startDate || !form.endDate) return toast.error('Dates required', 'Please select start and end dates.')
        if (form.endDate < form.startDate) return toast.error('Invalid dates', 'End date must be after start date.')
        try {
            await create.mutateAsync({ ...form, employeeId })
            toast.success('Submitted', 'Your leave request has been submitted.')
            onClose()
        } catch {
            toast.error('Error', 'Could not submit leave request.')
        }
    }

    return (
        <Dialog open onOpenChange={o => { if (!o) onClose() }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Apply for Leave</DialogTitle>
                    <DialogDescription>Submit a new leave request for approval.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-1">
                    <div className="space-y-1.5">
                        <Label>Leave Type</Label>
                        <Select value={form.leaveType} onValueChange={v => setForm(f => ({ ...f, leaveType: v }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {LEAVE_TYPE_OPTIONS.map((o: SelectOption) => (
                                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>Start Date</Label>
                            <DatePicker value={form.startDate} onChange={v => setForm(f => ({ ...f, startDate: v }))} placeholder="Select start date" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>End Date</Label>
                            <DatePicker value={form.endDate} onChange={v => setForm(f => ({ ...f, endDate: v }))} min={form.startDate || undefined} placeholder="Select end date" />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Reason <span className="text-muted-foreground text-xs">(optional)</span></Label>
                        <Textarea rows={2} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="Brief reason for leave…" />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={submit} disabled={create.isPending}>
                        {create.isPending ? 'Submitting…' : 'Submit Request'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function BalanceSummary({ employeeId }: { employeeId: string }) {
    const year = new Date().getFullYear()
    const { data: balanceData, isLoading } = useLeaveBalance(employeeId, year)
    const balance = balanceData?.balance

    if (isLoading) return <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
    if (!balance) return null

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.entries(balance).filter(([t]) => LEAVE_TYPE_LABELS[t]).map(([type, b]) => {
                const available = b.available === -1 ? '∞' : b.available
                const isCritical = b.available !== -1 && b.available === 0
                return (
                    <div key={type} className="border rounded-xl p-3 space-y-1.5 bg-card">
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-semibold">{LEAVE_TYPE_LABELS[type]?.replace(' Leave', '')}</span>
                            <span className={cn('text-sm font-bold', isCritical ? 'text-destructive' : 'text-success')}>{available}d</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">Used: {b.taken}d{b.pending > 0 ? ` · Pending: ${b.pending}d` : ''}</p>
                    </div>
                )
            })}
        </div>
    )
}

export function MyLeavePage() {
    const employeeId = useCurrentEmployeeId()
    const [applying, setApplying] = useState(false)
    const [cancelTarget, setCancelTarget] = useState<string | null>(null)
    const cancelLeave = useCancelLeave()

    const { data, isLoading, isFetching, refetch } = useLeaveRequests({ employeeId: employeeId ?? undefined, limit: 50 })
    const leaves = (data?.data ?? []) as LeaveRequest[]

    return (
        <PageWrapper>
            <PageHeader
                title="My Leave"
                description="View your leave balance and manage your requests."
                actions={
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" leftIcon={<RefreshCcw className={isFetching ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />} onClick={() => refetch()} disabled={isFetching}>
                            Refresh
                        </Button>
                        {employeeId && (
                            <Button onClick={() => setApplying(true)} leftIcon={<Plus className="h-4 w-4" />}>
                                Apply for Leave
                            </Button>
                        )}
                    </div>
                }
            />

            {employeeId && (
                <div className="space-y-6">
                    <div>
                        <p className="text-sm font-semibold mb-3">Leave Balance — {new Date().getFullYear()}</p>
                        <BalanceSummary employeeId={employeeId} />
                    </div>

                    <div>
                        <p className="text-sm font-semibold mb-3">My Requests</p>
                        {isLoading ? (
                            <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
                        ) : leaves.length === 0 ? (
                            <div className="flex flex-col items-center gap-2 py-12 text-center">
                                <Calendar className="h-9 w-9 text-muted-foreground" />
                                <p className="text-sm text-muted-foreground">No leave requests yet. Apply for leave to get started.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {leaves.map(req => {
                                    const StatusIcon = STATUS_ICON[req.status] ?? Clock
                                    return (
                                        <div key={req.id} className="flex items-center gap-3 rounded-xl border px-4 py-3 bg-card">
                                            <span className={cn('text-xs font-semibold px-2 py-1 rounded-md', LEAVE_TYPE_COLORS[req.leaveType] ?? 'bg-muted text-muted-foreground')}>
                                                {LEAVE_TYPE_LABELS[req.leaveType] ?? req.leaveType}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium">
                                                    {formatDate(req.startDate)} — {formatDate(req.endDate)}
                                                    <span className="ml-2 text-muted-foreground text-xs">{req.days} day{req.days !== 1 ? 's' : ''}</span>
                                                </p>
                                                {req.reason && <p className="text-xs text-muted-foreground truncate">{req.reason}</p>}
                                            </div>
                                            <Badge variant={STATUS_VARIANT[req.status] as 'warning' | 'success' | 'destructive' | 'secondary'} className="gap-1 shrink-0">
                                                <StatusIcon className="h-3 w-3" />
                                                {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                                            </Badge>
                                            {req.status === 'pending' && (
                                                <Button
                                                    size="icon-sm"
                                                    variant="ghost"
                                                    className="text-muted-foreground hover:text-destructive shrink-0"
                                                    onClick={() => setCancelTarget(req.id)}
                                                    aria-label="Cancel request"
                                                >
                                                    <X className="h-3.5 w-3.5" />
                                                </Button>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {!employeeId && (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                    <Calendar className="h-10 w-10 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Your account is not linked to an employee record.</p>
                </div>
            )}

            {applying && employeeId && <ApplyDialog employeeId={employeeId} onClose={() => setApplying(false)} />}

            <ConfirmDialog
                open={!!cancelTarget}
                onOpenChange={o => !o && setCancelTarget(null)}
                title="Cancel Leave Request"
                description="Are you sure you want to cancel this leave request?"
                confirmLabel="Cancel Request"
                variant="destructive"
                onConfirm={() => {
                    if (!cancelTarget) return
                    cancelLeave.mutate(cancelTarget, {
                        onSuccess: () => toast.success('Request cancelled', 'Your leave request has been cancelled.'),
                    })
                    setCancelTarget(null)
                }}
            />
        </PageWrapper>
    )
}
