import { useState } from 'react'
import type { ChangeEvent } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter, toast } from '@/components/ui/overlays'
import { Label, Input } from '@/components/ui/primitives'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/form-controls'
import { useCreateJob } from '@/hooks/useRecruitment'
import { useCreateVisa } from '@/hooks/useVisa'
import { useCreateLeave } from '@/hooks/useLeave'
import { useCreateEmployee, useUpdateEmployee, useEmployees } from '@/hooks/useEmployees'
import type { Employee } from '@/types'

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

// ─── Add Employee Dialog (3-step wizard) ───────────────────────────────────
type Step = 1 | 2 | 3

interface EmpForm {
    // Step 1 — Personal
    firstName: string
    lastName: string
    dateOfBirth: string
    gender: string
    nationality: string
    passportNo: string
    mobileNo: string
    personalEmail: string
    maritalStatus: string
    emergencyContact: string
    // Step 2 — Employment
    employeeNo: string
    department: string
    designation: string
    joinDate: string
    contractType: string
    workLocation: string
    managerName: string
    gradeLevel: string
    status: string
    // Step 3 — Salary
    basicSalary: string
    housingAllowance: string
    transportAllowance: string
    otherAllowances: string
    paymentMethod: string
    bankName: string
    iban: string
    emiratisationCategory: string
}

const EMPTY_FORM: EmpForm = {
    firstName: '', lastName: '', dateOfBirth: '', gender: 'male', nationality: '', passportNo: '',
    mobileNo: '', personalEmail: '', maritalStatus: 'single', emergencyContact: '',
    employeeNo: '', department: '', designation: '', joinDate: new Date().toISOString().split('T')[0],
    contractType: 'permanent', workLocation: '', managerName: '', gradeLevel: '', status: 'onboarding',
    basicSalary: '', housingAllowance: '', transportAllowance: '', otherAllowances: '',
    paymentMethod: 'bank_transfer', bankName: '', iban: '', emiratisationCategory: 'expat',
}

function StepIndicator({ step }: { step: Step }) {
    const steps = ['Personal Info', 'Employment', 'Salary & Payroll']
    return (
        <div className="flex items-center gap-0 mb-5">
            {steps.map((label, i) => {
                const idx = (i + 1) as Step
                const isActive = step === idx
                const isDone = step > idx
                return (
                    <div key={label} className="flex items-center flex-1 last:flex-none">
                        <div className="flex flex-col items-center gap-1">
                            <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                                ${isDone ? 'bg-success text-white' : isActive ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>
                                {isDone ? '✓' : idx}
                            </div>
                            <span className={`text-[10px] font-medium whitespace-nowrap ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
                        </div>
                        {i < steps.length - 1 && (
                            <div className={`flex-1 h-px mx-2 mt-[-14px] transition-colors ${isDone ? 'bg-success' : 'bg-border'}`} />
                        )}
                    </div>
                )
            })}
        </div>
    )
}

export function AddEmployeeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
    const [step, setStep] = useState<Step>(1)
    const [form, setForm] = useState<EmpForm>(EMPTY_FORM)
    const createEmployee = useCreateEmployee()

    const set = (field: keyof EmpForm) => (e: ChangeEvent<HTMLInputElement>) =>
        setForm(f => ({ ...f, [field]: e.target.value }))

    const close = () => { onOpenChange(false); setTimeout(() => { setStep(1); setForm(EMPTY_FORM) }, 300) }

    const validateStep1 = () => {
        if (!form.firstName.trim() || !form.lastName.trim()) {
            toast.warning('Missing fields', 'First name and last name are required.')
            return false
        }
        return true
    }

    const validateStep2 = () => {
        if (!form.joinDate) {
            toast.warning('Missing fields', 'Join date is required.')
            return false
        }
        return true
    }

    const submit = () => {
        const empNo = form.employeeNo || `EMP-${new Date().toISOString().slice(0, 7).replace('-', '')}-${Math.floor(1000 + Math.random() * 9000)}`
        const basic = parseFloat(form.basicSalary) || 0
        const housing = parseFloat(form.housingAllowance) || 0
        const transport = parseFloat(form.transportAllowance) || 0
        const other = parseFloat(form.otherAllowances) || 0
        createEmployee.mutate(
            {
                firstName: form.firstName, lastName: form.lastName,
                dateOfBirth: form.dateOfBirth || undefined,
                gender: (form.gender as any) || undefined,
                nationality: form.nationality || undefined,
                passportNo: form.passportNo || undefined,
                mobileNo: form.mobileNo || undefined,
                personalEmail: form.personalEmail || undefined,
                maritalStatus: (form.maritalStatus as any) || undefined,
                emergencyContact: form.emergencyContact || undefined,
                employeeNo: empNo,
                department: form.department || undefined,
                designation: form.designation || undefined,
                joinDate: form.joinDate,
                contractType: (form.contractType as any) || undefined,
                workLocation: form.workLocation || undefined,
                managerName: form.managerName || undefined,
                gradeLevel: form.gradeLevel || undefined,
                status: form.status as any,
                basicSalary: basic || undefined,
                housingAllowance: housing || undefined,
                transportAllowance: transport || undefined,
                otherAllowances: other || undefined,
                totalSalary: basic + housing + transport + other || undefined,
                paymentMethod: (form.paymentMethod as any) || undefined,
                bankName: form.bankName || undefined,
                iban: form.iban || undefined,
                emiratisationCategory: (form.emiratisationCategory as any) || 'expat',
            } as any,
            {
                onSuccess: () => {
                    toast.success('Employee added', `${form.firstName} ${form.lastName} has been onboarded.`)
                    close()
                },
                onError: (err: any) => toast.error('Failed to add employee', err?.message ?? 'Please try again.'),
            },
        )
    }

    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogContent size="lg">
                <DialogHeader>
                    <DialogTitle>Add New Employee</DialogTitle>
                </DialogHeader>
                <DialogBody>
                    <StepIndicator step={step} />

                    {step === 1 && (
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label>First Name *</Label>
                                    <Input value={form.firstName} onChange={set('firstName')} placeholder="Ahmed" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Last Name *</Label>
                                    <Input value={form.lastName} onChange={set('lastName')} placeholder="Al Mansouri" />
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div className="space-y-1.5">
                                    <Label>Date of Birth</Label>
                                    <Input type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Gender</Label>
                                    <Select value={form.gender} onValueChange={v => setForm(f => ({ ...f, gender: v }))}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="male">Male</SelectItem>
                                            <SelectItem value="female">Female</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Marital Status</Label>
                                    <Select value={form.maritalStatus} onValueChange={v => setForm(f => ({ ...f, maritalStatus: v }))}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="single">Single</SelectItem>
                                            <SelectItem value="married">Married</SelectItem>
                                            <SelectItem value="divorced">Divorced</SelectItem>
                                            <SelectItem value="widowed">Widowed</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label>Nationality</Label>
                                    <Input value={form.nationality} onChange={set('nationality')} placeholder="e.g. Emirati" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Passport No</Label>
                                    <Input value={form.passportNo} onChange={set('passportNo')} placeholder="A12345678" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label>Mobile</Label>
                                    <Input value={form.mobileNo} onChange={set('mobileNo')} placeholder="+971 50 000 0000" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Personal Email</Label>
                                    <Input type="email" value={form.personalEmail} onChange={set('personalEmail')} placeholder="ahmed@gmail.com" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Emergency Contact</Label>
                                <Input value={form.emergencyContact} onChange={set('emergencyContact')} placeholder="Name — +971 50 000 0000" />
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label>Employee No</Label>
                                    <Input value={form.employeeNo} onChange={set('employeeNo')} placeholder="Auto-generated if blank" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Join Date *</Label>
                                    <Input type="date" value={form.joinDate} onChange={set('joinDate')} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label>Department</Label>
                                    <Input value={form.department} onChange={set('department')} placeholder="e.g. Sales" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Designation / Title</Label>
                                    <Input value={form.designation} onChange={set('designation')} placeholder="e.g. Sales Manager" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label>Contract Type</Label>
                                    <Select value={form.contractType} onValueChange={v => setForm(f => ({ ...f, contractType: v }))}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="permanent">Permanent</SelectItem>
                                            <SelectItem value="contract">Contract</SelectItem>
                                            <SelectItem value="part_time">Part-time</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Work Location</Label>
                                    <Input value={form.workLocation} onChange={set('workLocation')} placeholder="e.g. Dubai HQ" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label>Reporting Manager</Label>
                                    <Input value={form.managerName} onChange={set('managerName')} placeholder="Manager name" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Grade Level</Label>
                                    <Input value={form.gradeLevel} onChange={set('gradeLevel')} placeholder="e.g. L4" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Status</Label>
                                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="onboarding">Onboarding</SelectItem>
                                        <SelectItem value="probation">Probation</SelectItem>
                                        <SelectItem value="active">Active</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label>Basic Salary (AED)</Label>
                                    <Input type="number" min={0} value={form.basicSalary} onChange={set('basicSalary')} placeholder="0.00" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Housing Allowance (AED)</Label>
                                    <Input type="number" min={0} value={form.housingAllowance} onChange={set('housingAllowance')} placeholder="0.00" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label>Transport Allowance (AED)</Label>
                                    <Input type="number" min={0} value={form.transportAllowance} onChange={set('transportAllowance')} placeholder="0.00" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Other Allowances (AED)</Label>
                                    <Input type="number" min={0} value={form.otherAllowances} onChange={set('otherAllowances')} placeholder="0.00" />
                                </div>
                            </div>
                            {(parseFloat(form.basicSalary) || 0) + (parseFloat(form.housingAllowance) || 0) + (parseFloat(form.transportAllowance) || 0) + (parseFloat(form.otherAllowances) || 0) > 0 && (
                                <div className="flex justify-between items-center px-3 py-2 bg-muted rounded-lg text-sm">
                                    <span className="text-muted-foreground">Total Package</span>
                                    <span className="font-bold">AED {((parseFloat(form.basicSalary) || 0) + (parseFloat(form.housingAllowance) || 0) + (parseFloat(form.transportAllowance) || 0) + (parseFloat(form.otherAllowances) || 0)).toLocaleString()}</span>
                                </div>
                            )}
                            <div className="space-y-1.5">
                                <Label>Payment Method</Label>
                                <Select value={form.paymentMethod} onValueChange={v => setForm(f => ({ ...f, paymentMethod: v }))}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="bank_transfer">Bank Transfer (WPS)</SelectItem>
                                        <SelectItem value="cash">Cash</SelectItem>
                                        <SelectItem value="cheque">Cheque</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            {form.paymentMethod === 'bank_transfer' && (
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label>Bank Name</Label>
                                        <Input value={form.bankName} onChange={set('bankName')} placeholder="e.g. Emirates NBD" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>IBAN</Label>
                                        <Input value={form.iban} onChange={set('iban')} placeholder="AE070331234567890123456" />
                                    </div>
                                </div>
                            )}
                            <div className="space-y-1.5">
                                <Label>Emiratisation Category</Label>
                                <Select value={form.emiratisationCategory} onValueChange={v => setForm(f => ({ ...f, emiratisationCategory: v }))}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="expat">Expat</SelectItem>
                                        <SelectItem value="emirati">Emirati (UAE National)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}
                </DialogBody>
                <DialogFooter>
                    {step > 1 ? (
                        <Button variant="outline" onClick={() => setStep(s => (s - 1) as Step)}>Back</Button>
                    ) : (
                        <Button variant="outline" onClick={close}>Cancel</Button>
                    )}
                    {step < 3 ? (
                        <Button onClick={() => {
                            if (step === 1 && !validateStep1()) return
                            if (step === 2 && !validateStep2()) return
                            setStep(s => (s + 1) as Step)
                        }}>Next →</Button>
                    ) : (
                        <Button onClick={submit} loading={createEmployee.isPending}>Add Employee</Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ─── Edit Employee Dialog ────────────────────────────────────────────────────
export function EditEmployeeDialog({
    open, onOpenChange, employee,
}: { open: boolean; onOpenChange: (o: boolean) => void; employee: Employee }) {
    const [step, setStep] = useState<Step>(1)
    const [form, setForm] = useState<EmpForm>({
        firstName: employee.firstName ?? '',
        lastName: employee.lastName ?? '',
        dateOfBirth: employee.dateOfBirth ?? '',
        gender: employee.gender ?? 'male',
        nationality: employee.nationality ?? '',
        passportNo: employee.passportNo ?? '',
        mobileNo: employee.mobileNo ?? employee.phone ?? '',
        personalEmail: employee.personalEmail ?? employee.email ?? '',
        maritalStatus: employee.maritalStatus ?? 'single',
        emergencyContact: employee.emergencyContact ?? '',
        employeeNo: employee.employeeNo ?? '',
        department: employee.department ?? '',
        designation: employee.designation ?? '',
        joinDate: employee.joinDate ?? new Date().toISOString().split('T')[0],
        contractType: employee.contractType ?? 'permanent',
        workLocation: employee.workLocation ?? '',
        managerName: employee.managerName ?? '',
        gradeLevel: employee.gradeLevel ?? '',
        status: employee.status ?? 'active',
        basicSalary: String(employee.basicSalary ?? ''),
        housingAllowance: String(employee.housingAllowance ?? ''),
        transportAllowance: String(employee.transportAllowance ?? ''),
        otherAllowances: String(employee.otherAllowances ?? ''),
        paymentMethod: employee.paymentMethod ?? 'bank_transfer',
        bankName: employee.bankName ?? '',
        iban: employee.iban ?? '',
        emiratisationCategory: employee.emiratisationCategory ?? 'expat',
    })
    const updateEmployee = useUpdateEmployee(employee.id)

    const set = (field: keyof EmpForm) => (e: ChangeEvent<HTMLInputElement>) =>
        setForm(f => ({ ...f, [field]: e.target.value }))

    const close = () => { onOpenChange(false); setTimeout(() => setStep(1), 300) }

    const submit = () => {
        if (!form.firstName.trim() || !form.lastName.trim()) {
            toast.warning('Missing fields', 'First name and last name are required.')
            return
        }
        const basic = parseFloat(form.basicSalary) || 0
        const housing = parseFloat(form.housingAllowance) || 0
        const transport = parseFloat(form.transportAllowance) || 0
        const other = parseFloat(form.otherAllowances) || 0
        updateEmployee.mutate(
            {
                firstName: form.firstName, lastName: form.lastName,
                dateOfBirth: form.dateOfBirth || undefined,
                gender: (form.gender as any) || undefined,
                nationality: form.nationality || undefined,
                passportNo: form.passportNo || undefined,
                mobileNo: form.mobileNo || undefined,
                personalEmail: form.personalEmail || undefined,
                maritalStatus: (form.maritalStatus as any) || undefined,
                emergencyContact: form.emergencyContact || undefined,
                employeeNo: form.employeeNo || undefined,
                department: form.department || undefined,
                designation: form.designation || undefined,
                joinDate: form.joinDate,
                contractType: (form.contractType as any) || undefined,
                workLocation: form.workLocation || undefined,
                managerName: form.managerName || undefined,
                gradeLevel: form.gradeLevel || undefined,
                status: form.status as any,
                basicSalary: basic || undefined,
                housingAllowance: housing || undefined,
                transportAllowance: transport || undefined,
                otherAllowances: other || undefined,
                totalSalary: basic + housing + transport + other || undefined,
                paymentMethod: (form.paymentMethod as any) || undefined,
                bankName: form.bankName || undefined,
                iban: form.iban || undefined,
                emiratisationCategory: (form.emiratisationCategory as any) || 'expat',
            } as any,
            {
                onSuccess: () => {
                    toast.success('Employee updated', `${form.firstName} ${form.lastName} has been updated.`)
                    close()
                },
                onError: (err: any) => toast.error('Failed to update employee', err?.message ?? 'Please try again.'),
            },
        )
    }

    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogContent size="lg">
                <DialogHeader>
                    <DialogTitle>Edit Employee — {employee.fullName}</DialogTitle>
                </DialogHeader>
                <DialogBody>
                    <StepIndicator step={step} />

                    {step === 1 && (
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5"><Label>First Name *</Label><Input value={form.firstName} onChange={set('firstName')} /></div>
                                <div className="space-y-1.5"><Label>Last Name *</Label><Input value={form.lastName} onChange={set('lastName')} /></div>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div className="space-y-1.5"><Label>Date of Birth</Label><Input type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} /></div>
                                <div className="space-y-1.5">
                                    <Label>Gender</Label>
                                    <Select value={form.gender} onValueChange={v => setForm(f => ({ ...f, gender: v }))}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="male">Male</SelectItem>
                                            <SelectItem value="female">Female</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Marital Status</Label>
                                    <Select value={form.maritalStatus} onValueChange={v => setForm(f => ({ ...f, maritalStatus: v }))}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="single">Single</SelectItem>
                                            <SelectItem value="married">Married</SelectItem>
                                            <SelectItem value="divorced">Divorced</SelectItem>
                                            <SelectItem value="widowed">Widowed</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5"><Label>Nationality</Label><Input value={form.nationality} onChange={set('nationality')} /></div>
                                <div className="space-y-1.5"><Label>Passport No</Label><Input value={form.passportNo} onChange={set('passportNo')} /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5"><Label>Mobile</Label><Input value={form.mobileNo} onChange={set('mobileNo')} /></div>
                                <div className="space-y-1.5"><Label>Personal Email</Label><Input type="email" value={form.personalEmail} onChange={set('personalEmail')} /></div>
                            </div>
                            <div className="space-y-1.5"><Label>Emergency Contact</Label><Input value={form.emergencyContact} onChange={set('emergencyContact')} /></div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5"><Label>Employee No</Label><Input value={form.employeeNo} onChange={set('employeeNo')} /></div>
                                <div className="space-y-1.5"><Label>Join Date *</Label><Input type="date" value={form.joinDate} onChange={set('joinDate')} /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5"><Label>Department</Label><Input value={form.department} onChange={set('department')} /></div>
                                <div className="space-y-1.5"><Label>Designation</Label><Input value={form.designation} onChange={set('designation')} /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label>Contract Type</Label>
                                    <Select value={form.contractType} onValueChange={v => setForm(f => ({ ...f, contractType: v }))}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="permanent">Permanent</SelectItem>
                                            <SelectItem value="contract">Contract</SelectItem>
                                            <SelectItem value="part_time">Part-time</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5"><Label>Work Location</Label><Input value={form.workLocation} onChange={set('workLocation')} /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5"><Label>Reporting Manager</Label><Input value={form.managerName} onChange={set('managerName')} /></div>
                                <div className="space-y-1.5"><Label>Grade Level</Label><Input value={form.gradeLevel} onChange={set('gradeLevel')} /></div>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Status</Label>
                                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="active">Active</SelectItem>
                                        <SelectItem value="onboarding">Onboarding</SelectItem>
                                        <SelectItem value="probation">Probation</SelectItem>
                                        <SelectItem value="suspended">Suspended</SelectItem>
                                        <SelectItem value="terminated">Terminated</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5"><Label>Basic Salary (AED)</Label><Input type="number" min={0} value={form.basicSalary} onChange={set('basicSalary')} /></div>
                                <div className="space-y-1.5"><Label>Housing Allowance (AED)</Label><Input type="number" min={0} value={form.housingAllowance} onChange={set('housingAllowance')} /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5"><Label>Transport Allowance (AED)</Label><Input type="number" min={0} value={form.transportAllowance} onChange={set('transportAllowance')} /></div>
                                <div className="space-y-1.5"><Label>Other Allowances (AED)</Label><Input type="number" min={0} value={form.otherAllowances} onChange={set('otherAllowances')} /></div>
                            </div>
                            {(parseFloat(form.basicSalary) || 0) + (parseFloat(form.housingAllowance) || 0) + (parseFloat(form.transportAllowance) || 0) + (parseFloat(form.otherAllowances) || 0) > 0 && (
                                <div className="flex justify-between items-center px-3 py-2 bg-muted rounded-lg text-sm">
                                    <span className="text-muted-foreground">Total Package</span>
                                    <span className="font-bold">AED {((parseFloat(form.basicSalary) || 0) + (parseFloat(form.housingAllowance) || 0) + (parseFloat(form.transportAllowance) || 0) + (parseFloat(form.otherAllowances) || 0)).toLocaleString()}</span>
                                </div>
                            )}
                            <div className="space-y-1.5">
                                <Label>Payment Method</Label>
                                <Select value={form.paymentMethod} onValueChange={v => setForm(f => ({ ...f, paymentMethod: v }))}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="bank_transfer">Bank Transfer (WPS)</SelectItem>
                                        <SelectItem value="cash">Cash</SelectItem>
                                        <SelectItem value="cheque">Cheque</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            {form.paymentMethod === 'bank_transfer' && (
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5"><Label>Bank Name</Label><Input value={form.bankName} onChange={set('bankName')} /></div>
                                    <div className="space-y-1.5"><Label>IBAN</Label><Input value={form.iban} onChange={set('iban')} /></div>
                                </div>
                            )}
                            <div className="space-y-1.5">
                                <Label>Emiratisation Category</Label>
                                <Select value={form.emiratisationCategory} onValueChange={v => setForm(f => ({ ...f, emiratisationCategory: v }))}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="expat">Expat</SelectItem>
                                        <SelectItem value="emirati">Emirati (UAE National)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}
                </DialogBody>
                <DialogFooter>
                    {step > 1 ? (
                        <Button variant="outline" onClick={() => setStep(s => (s - 1) as Step)}>Back</Button>
                    ) : (
                        <Button variant="outline" onClick={close}>Cancel</Button>
                    )}
                    {step < 3 ? (
                        <Button onClick={() => setStep(s => (s + 1) as Step)}>Next →</Button>
                    ) : (
                        <Button onClick={submit} loading={updateEmployee.isPending}>Save Changes</Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
