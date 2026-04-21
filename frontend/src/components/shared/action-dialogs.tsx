import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter, toast } from '@/components/ui/overlays'
import { Label, Input } from '@/components/ui/primitives'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/form-controls'
import { useCreateJob } from '@/hooks/useRecruitment'
import { useCreateVisa } from '@/hooks/useVisa'
import { useCreateLeave } from '@/hooks/useLeave'
import { useCreateEmployee, useEmployees } from '@/hooks/useEmployees'

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

// ─── Add Employee Dialog ────────────────────────────────────────────────────
export function AddEmployeeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
    const [firstName, setFirstName] = useState('')
    const [lastName, setLastName] = useState('')
    const [email, setEmail] = useState('')
    const [phone, setPhone] = useState('')
    const [department, setDepartment] = useState('')
    const [designation, setDesignation] = useState('')
    const [nationality, setNationality] = useState('')
    const [joinDate, setJoinDate] = useState(new Date().toISOString().split('T')[0])
    const [basicSalary, setBasicSalary] = useState(0)
    const [emiratisationCategory, setEmiratisationCategory] = useState('expat')
    const createEmployee = useCreateEmployee()

    const reset = () => {
        setFirstName(''); setLastName(''); setEmail(''); setPhone('')
        setDepartment(''); setDesignation(''); setNationality('')
        setJoinDate(new Date().toISOString().split('T')[0])
        setBasicSalary(0); setEmiratisationCategory('expat')
    }

    const submit = () => {
        if (!firstName || !lastName || !joinDate) {
            toast.warning('Missing fields', 'First name, last name and join date are required.')
            return
        }
        // Generate employee number: EMP-YYYYMM-XXXX
        const empNo = `EMP-${new Date().toISOString().slice(0, 7).replace('-', '')}-${Math.floor(1000 + Math.random() * 9000)}`
        createEmployee.mutate(
            {
                firstName, lastName, email: email || undefined, phone: phone || undefined,
                department: department || undefined, designation: designation || undefined,
                nationality: nationality || undefined, joinDate, basicSalary: basicSalary || undefined,
                totalSalary: basicSalary || undefined, emiratisationCategory: emiratisationCategory as any,
                employeeNo: empNo, status: 'onboarding',
            } as any,
            {
                onSuccess: () => {
                    toast.success('Employee added', `${firstName} ${lastName} has been onboarded.`)
                    onOpenChange(false)
                    reset()
                },
                onError: (err: any) => toast.error('Failed to add employee', err?.message ?? 'Please try again.'),
            },
        )
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size="lg">
                <DialogHeader>
                    <DialogTitle>Add New Employee</DialogTitle>
                </DialogHeader>
                <DialogBody className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>First Name *</Label>
                            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Ahmed" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Last Name *</Label>
                            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Al Mansouri" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>Work Email</Label>
                            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ahmed@company.ae" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Mobile</Label>
                            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+971 50 000 0000" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>Department</Label>
                            <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Sales" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Designation / Title</Label>
                            <Input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Sales Manager" />
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                            <Label>Nationality</Label>
                            <Input value={nationality} onChange={(e) => setNationality(e.target.value)} placeholder="e.g. Emirati" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Join Date *</Label>
                            <Input type="date" value={joinDate} onChange={(e) => setJoinDate(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Category</Label>
                            <Select value={emiratisationCategory} onValueChange={setEmiratisationCategory}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="expat">Expat</SelectItem>
                                    <SelectItem value="emirati">Emirati</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Basic Salary (AED)</Label>
                        <Input type="number" min={0} value={basicSalary} onChange={(e) => setBasicSalary(Number(e.target.value))} placeholder="0.00" />
                    </div>
                </DialogBody>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={submit} loading={createEmployee.isPending}>Add Employee</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
