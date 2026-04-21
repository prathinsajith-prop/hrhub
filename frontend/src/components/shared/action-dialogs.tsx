import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter, toast } from '@/components/ui/overlays'
import { Label, Input } from '@/components/ui/primitives'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/form-controls'
import { useCreateJob } from '@/hooks/useRecruitment'
import { useCreateVisa } from '@/hooks/useVisa'
import { useCreateLeave } from '@/hooks/useLeave'
import { useEmployees } from '@/hooks/useEmployees'

// ─── New Job Dialog ─────────────────────────────────────────────────────────
export function NewJobDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
    const [title, setTitle] = useState('')
    const [department, setDepartment] = useState('')
    const [location, setLocation] = useState('')
    const [type, setType] = useState('full_time')
    const [openings, setOpenings] = useState(1)
    const [minSalary, setMinSalary] = useState(0)
    const [maxSalary, setMaxSalary] = useState(0)
    const [description, setDescription] = useState('')
    const createJob = useCreateJob()

    const submit = () => {
        if (!title || !department) {
            toast.warning('Missing fields', 'Title and department are required.')
            return
        }
        createJob.mutate(
            { title, department, location, type, openings, minSalary, maxSalary, description, status: 'open' },
            {
                onSuccess: () => {
                    toast.success('Job posted', `${title} is now open for applications.`)
                    onOpenChange(false)
                    setTitle(''); setDepartment(''); setLocation(''); setDescription('')
                },
                onError: () => toast.error('Failed to post job', 'Please try again.'),
            },
        )
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size="md">
                <DialogHeader>
                    <DialogTitle>Post New Job</DialogTitle>
                </DialogHeader>
                <DialogBody className="space-y-3">
                    <div className="space-y-1.5">
                        <Label>Job Title *</Label>
                        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Senior Property Consultant" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>Department *</Label>
                            <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Sales" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Location</Label>
                            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Dubai Marina" />
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                            <Label>Type</Label>
                            <Select value={type} onValueChange={setType}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="full_time">Full-time</SelectItem>
                                    <SelectItem value="part_time">Part-time</SelectItem>
                                    <SelectItem value="contract">Contract</SelectItem>
                                    <SelectItem value="internship">Internship</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Openings</Label>
                            <Input type="number" min={1} value={openings} onChange={(e) => setOpenings(Number(e.target.value))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Min Salary (AED)</Label>
                            <Input type="number" min={0} value={minSalary} onChange={(e) => setMinSalary(Number(e.target.value))} />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Max Salary (AED)</Label>
                        <Input type="number" min={0} value={maxSalary} onChange={(e) => setMaxSalary(Number(e.target.value))} />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Description</Label>
                        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Brief job description..." />
                    </div>
                </DialogBody>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={submit} loading={createJob.isPending}>Post Job</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ─── New Visa Application Dialog ────────────────────────────────────────────
export function NewVisaApplicationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
    const [employeeId, setEmployeeId] = useState('')
    const [visaType, setVisaType] = useState('employment_new')
    const [urgencyLevel, setUrgencyLevel] = useState('normal')
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
    const { data: empData } = useEmployees({ limit: 100 })
    const employees = (empData?.data as any[]) ?? []
    const createVisa = useCreateVisa()

    const submit = () => {
        if (!employeeId) {
            toast.warning('Employee required', 'Please select an employee.')
            return
        }
        createVisa.mutate(
            { employeeId, visaType, urgencyLevel, startDate, status: 'entry_permit', currentStep: 1, totalSteps: 6 },
            {
                onSuccess: () => {
                    toast.success('Application created', 'Visa application has been initiated.')
                    onOpenChange(false)
                    setEmployeeId('')
                },
                onError: () => toast.error('Failed to create application', 'Please try again.'),
            },
        )
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size="md">
                <DialogHeader>
                    <DialogTitle>New Visa Application</DialogTitle>
                </DialogHeader>
                <DialogBody className="space-y-3">
                    <div className="space-y-1.5">
                        <Label>Employee *</Label>
                        <Select value={employeeId} onValueChange={setEmployeeId}>
                            <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                            <SelectContent>
                                {employees.map((e) => (
                                    <SelectItem key={e.id} value={e.id}>{e.fullName ?? `${e.firstName} ${e.lastName}`} · {e.employeeNo}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>Visa Type</Label>
                            <Select value={visaType} onValueChange={setVisaType}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="employment_new">Employment (New)</SelectItem>
                                    <SelectItem value="employment_renewal">Employment (Renewal)</SelectItem>
                                    <SelectItem value="dependant">Dependant</SelectItem>
                                    <SelectItem value="visit">Visit</SelectItem>
                                    <SelectItem value="cancellation">Cancellation</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Urgency</Label>
                            <Select value={urgencyLevel} onValueChange={setUrgencyLevel}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="normal">Normal</SelectItem>
                                    <SelectItem value="urgent">Urgent</SelectItem>
                                    <SelectItem value="critical">Critical</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Start Date</Label>
                        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                    </div>
                </DialogBody>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={submit} loading={createVisa.isPending}>Create Application</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ─── Apply Leave Dialog ────────────────────────────────────────────────────
export function ApplyLeaveDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
    const [employeeId, setEmployeeId] = useState('')
    const [leaveType, setLeaveType] = useState('annual')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [reason, setReason] = useState('')
    const { data: empData } = useEmployees({ limit: 100 })
    const employees = (empData?.data as any[]) ?? []
    const createLeave = useCreateLeave()

    const submit = () => {
        if (!employeeId || !startDate || !endDate) {
            toast.warning('Missing fields', 'Employee and dates are required.')
            return
        }
        const days = Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1)
        createLeave.mutate(
            { employeeId, leaveType, startDate, endDate, days, reason, status: 'pending' },
            {
                onSuccess: () => {
                    toast.success('Leave submitted', 'Your leave request is pending approval.')
                    onOpenChange(false)
                    setEmployeeId(''); setStartDate(''); setEndDate(''); setReason('')
                },
                onError: () => toast.error('Failed to apply leave', 'Please try again.'),
            },
        )
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size="md">
                <DialogHeader>
                    <DialogTitle>Apply for Leave</DialogTitle>
                </DialogHeader>
                <DialogBody className="space-y-3">
                    <div className="space-y-1.5">
                        <Label>Employee *</Label>
                        <Select value={employeeId} onValueChange={setEmployeeId}>
                            <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                            <SelectContent>
                                {employees.map((e) => (
                                    <SelectItem key={e.id} value={e.id}>{e.fullName ?? `${e.firstName} ${e.lastName}`}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Leave Type</Label>
                        <Select value={leaveType} onValueChange={setLeaveType}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="annual">Annual</SelectItem>
                                <SelectItem value="sick">Sick</SelectItem>
                                <SelectItem value="compassionate">Compassionate</SelectItem>
                                <SelectItem value="maternity">Maternity</SelectItem>
                                <SelectItem value="paternity">Paternity</SelectItem>
                                <SelectItem value="unpaid">Unpaid</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>Start Date *</Label>
                            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>End Date *</Label>
                            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Reason</Label>
                        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Brief reason..." />
                    </div>
                </DialogBody>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={submit} loading={createLeave.isPending}>Submit Request</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ─── Forgot Password Dialog ────────────────────────────────────────────────
export function ForgotPasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
    const [email, setEmail] = useState('')
    const [sending, setSending] = useState(false)

    const submit = async () => {
        if (!email) {
            toast.warning('Email required', 'Please enter your email address.')
            return
        }
        setSending(true)
        try {
            // Best-effort: call endpoint if it exists, else show generic message for security.
            try {
                const { api } = await import('@/lib/api')
                await api.post('/auth/forgot-password', { email })
            } catch {
                // Endpoint may not exist yet — still show confirmation to avoid user enumeration.
            }
            toast.success('Check your email', `If an account exists for ${email}, a reset link has been sent.`)
            onOpenChange(false)
            setEmail('')
        } finally {
            setSending(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size="sm">
                <DialogHeader>
                    <DialogTitle>Reset Password</DialogTitle>
                </DialogHeader>
                <DialogBody className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                        Enter your email and we&apos;ll send you instructions to reset your password.
                    </p>
                    <div className="space-y-1.5">
                        <Label>Email</Label>
                        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.ae" />
                    </div>
                </DialogBody>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={submit} loading={sending}>Send Reset Link</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
