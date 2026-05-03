import { useState, useEffect, useMemo } from 'react'
import type { ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter, toast } from '@/components/ui/overlays'
import { Label, Input } from '@/components/ui/primitives'
import { NumericInput } from '@/components/ui/numeric-input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/form-controls'
import { DatePicker } from '@/components/ui/date-picker'
import { useAssets, useAssignAsset, type Asset } from '@/hooks/useAssets'
import { useCreateJob, useUpdateJob } from '@/hooks/useRecruitment'
import { useCreateVisa } from '@/hooks/useVisa'
import { useCreateLeave } from '@/hooks/useLeave'
import { useCreateEmployee, useUpdateEmployee, useEmployees } from '@/hooks/useEmployees'
import { useOrgUnits, type OrgUnit } from '@/hooks/useOrgUnits'
import { useDesignations, useCreateDesignation } from '@/hooks/useDesignations'
import { useTeams } from '@/hooks/useTeams'
import { useUpdateDocument } from '@/hooks/useDocuments'
import { PhoneInput, CountrySelect, resolveCountryIso, countryNameFromIso } from '@/components/shared/PhoneInput'
import { FormField } from '@/components/shared/FormField'
import { api, apiErrorToFieldMap } from '@/lib/api'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { employeeStep1Schema, employeeStep2Schema, employeeSalaryRuleSchema, jobPostSchema, visaApplicationSchema, leaveRequestSchema, documentMetaSchema, zodToFieldErrors } from '@/lib/schemas'
import {
    JOB_TYPE_OPTIONS, JOB_STATUS_OPTIONS,
    VISA_APPLICATION_TYPE_OPTIONS, VISA_PRIORITY_OPTIONS,
    LEAVE_TYPE_OPTIONS,
    GENDER_OPTIONS, MARITAL_STATUS_OPTIONS, CONTRACT_TYPE_OPTIONS,
    PAYMENT_METHOD_OPTIONS, EMIRATISATION_OPTIONS,
    NEW_EMPLOYEE_STATUS_OPTIONS, EDIT_EMPLOYEE_STATUS_OPTIONS,
    EDIT_DOC_CATEGORY_OPTIONS,
    type SelectOption,
} from '@/lib/options'
import type { Employee } from '@/types'

// Searchable reporting-manager picker.
function ManagerPicker({
    value, onChange, excludeId,
}: {
    value: string
    onChange: (id: string, name: string) => void
    excludeId?: string
}) {
    const { data } = useEmployees({ limit: 100 })
    const employees = (data?.data ?? []) as Employee[]
    const opts: ComboboxOption[] = [
        { value: '__none__', label: '— No manager (top-level) —' },
        ...employees
            .filter(e => e.id !== excludeId)
            .map(e => ({
                value: e.id,
                label: `${e.firstName} ${e.lastName}`,
                secondary: e.designation ?? undefined,
            })),
    ]
    return (
        <Combobox
            value={value || '__none__'}
            onValueChange={v => {
                if (!v || v === '__none__') return onChange('', '')
                const picked = employees.find(e => e.id === v)
                onChange(v, picked ? `${picked.firstName} ${picked.lastName}` : '')
            }}
            options={opts}
            placeholder="— No manager (top-level) —"
            searchPlaceholder="Search employees…"
            clearable
        />
    )
}

// Build flat department options with hierarchy path for the org structure picker.
export function buildOrgOptions(units: OrgUnit[]): Array<ComboboxOption & { branchId: string; divisionId: string; headEmployeeId: string | null; headEmployeeName: string | null }> {
    return units
        .filter(u => u.type === 'department' && u.isActive)
        .map(dept => {
            const division = units.find(u => u.id === dept.parentId)
            const branch = division ? units.find(u => u.id === division.parentId) : null
            const path = [branch?.name, division?.name].filter(Boolean).join(' → ')
            return {
                value: dept.id,
                label: dept.name,
                secondary: path || undefined,
                branchId: branch?.id ?? '',
                divisionId: division?.id ?? '',
                headEmployeeId: dept.headEmployeeId ?? null,
                headEmployeeName: dept.headEmployeeName ?? null,
            }
        })
}

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

    useEffect(() => {
        if (!open) {
            setTitle(''); setDepartment(''); setLocation(''); setType('full_time')
            setOpenings(1); setMinSalary(0); setMaxSalary(0); setDescription('')
        }
    }, [open])

    const submit = () => {
        const { ok, errors } = zodToFieldErrors(jobPostSchema, { title, department })
        if (!ok) {
            toast.warning('Missing fields', Object.values(errors)[0] ?? 'Please fill required fields.')
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
                        <Label required>Job Title</Label>
                        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Senior Property Consultant" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label required>Department</Label>
                            <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Sales" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Location</Label>
                            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Dubai Marina" />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                            <Label>Type</Label>
                            <Select value={type} onValueChange={setType}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {JOB_TYPE_OPTIONS.map((o: SelectOption) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Openings</Label>
                            <NumericInput decimal={false} value={openings} onChange={(e) => setOpenings(Number(e.target.value))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Min Salary (AED)</Label>
                            <NumericInput value={minSalary} onChange={(e) => setMinSalary(Number(e.target.value))} />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Max Salary (AED)</Label>
                        <NumericInput value={maxSalary} onChange={(e) => setMaxSalary(Number(e.target.value))} />
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
    const today = new Date().toISOString().split('T')[0]
    const { data: empData } = useEmployees({ limit: 100 })
    const employees = (empData?.data as Employee[]) ?? []
    const createVisa = useCreateVisa()

    useEffect(() => {
        if (!open) {
            setEmployeeId(''); setVisaType('employment_new'); setUrgencyLevel('normal')
            setStartDate(new Date().toISOString().split('T')[0])
        }
    }, [open])

    const submit = () => {
        const { ok, errors } = zodToFieldErrors(visaApplicationSchema, { employeeId })
        if (!ok) {
            toast.warning('Employee required', Object.values(errors)[0] ?? 'Please select an employee.')
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
                        <Label required>Employee</Label>
                        <Select value={employeeId} onValueChange={setEmployeeId}>
                            <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                            <SelectContent>
                                {employees.map((e) => (
                                    <SelectItem key={e.id} value={e.id}>{e.fullName ?? `${e.firstName} ${e.lastName}`} · {e.employeeNo}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>Visa Type</Label>
                            <Select value={visaType} onValueChange={setVisaType}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {VISA_APPLICATION_TYPE_OPTIONS.map((o: SelectOption) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Urgency</Label>
                            <Select value={urgencyLevel} onValueChange={setUrgencyLevel}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {VISA_PRIORITY_OPTIONS.map((o: SelectOption) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Start Date</Label>
                        <DatePicker value={startDate} min={today} onChange={setStartDate} />
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
    const today = new Date().toISOString().split('T')[0]
    const { data: empData } = useEmployees({ limit: 100 })
    const employees = (empData?.data as Employee[]) ?? []
    const createLeave = useCreateLeave()

    useEffect(() => {
        if (!open) {
            setEmployeeId(''); setLeaveType('annual'); setStartDate(''); setEndDate(''); setReason('')
        }
    }, [open])

    const submit = () => {
        const { ok, errors } = zodToFieldErrors(leaveRequestSchema, { employeeId, startDate, endDate })
        if (!ok) {
            toast.warning('Please review', Object.values(errors)[0] ?? 'Fix the highlighted fields.')
            return
        }
        createLeave.mutate(
            { employeeId, leaveType: leaveType as import('@/hooks/useLeave').LeaveType, startDate, endDate, reason },
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
                        <Label required>Employee</Label>
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
                                {LEAVE_TYPE_OPTIONS.map((o: SelectOption) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label required>Start Date</Label>
                            <DatePicker value={startDate} min={today} onChange={setStartDate} />
                        </div>
                        <div className="space-y-1.5">
                            <Label required>End Date</Label>
                            <DatePicker value={endDate} min={startDate || today} onChange={setEndDate} />
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
    emergencyContactName: string
    emergencyContactPhone: string
    homeCountryAddress: string
    // Step 2 — Employment
    employeeNo: string
    workEmail: string
    divisionId: string
    departmentId: string
    branchId: string
    department: string
    designation: string
    joinDate: string
    contractType: string
    workLocation: string
    managerName: string
    reportingTo: string
    gradeLevel: string
    status: string
    teamId: string
    // Step 3 — Salary
    basicSalary: string
    housingAllowance: string
    transportAllowance: string
    otherAllowances: string
    paymentMethod: string
    bankName: string
    accountName: string
    accountNumber: string
    swiftCode: string
    bankBranch: string
    iban: string
    emiratisationCategory: string
}

const EMPTY_FORM: EmpForm = {
    firstName: '', lastName: '', dateOfBirth: '', gender: 'male', nationality: '', passportNo: '',
    mobileNo: '', personalEmail: '', maritalStatus: 'single', emergencyContact: '', emergencyContactName: '', emergencyContactPhone: '', homeCountryAddress: '',
    employeeNo: '', workEmail: '', divisionId: '', departmentId: '', branchId: '', department: '', designation: '',
    joinDate: new Date().toISOString().split('T')[0],
    contractType: 'permanent', workLocation: '', managerName: '', reportingTo: '', gradeLevel: '', status: 'onboarding', teamId: '',
    basicSalary: '', housingAllowance: '', transportAllowance: '', otherAllowances: '',
    paymentMethod: 'bank_transfer', bankName: '', accountName: '', accountNumber: '', swiftCode: '', bankBranch: '', iban: '', emiratisationCategory: 'expat',
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
    const [errors, setErrors] = useState<Record<string, string>>({})
    const createEmployee = useCreateEmployee()

    useEffect(() => {
        if (!open) { setTimeout(() => { setStep(1); setForm(EMPTY_FORM); setErrors({}) }, 300) }
    }, [open])
    const navigate = useNavigate()
    const { data: orgUnitsRaw = [] } = useOrgUnits()
    const { data: designationList = [] } = useDesignations()
    const createDesignation = useCreateDesignation()
    const { data: teamsRaw = [] } = useTeams()
    const orgUnits = Array.isArray(orgUnitsRaw) ? orgUnitsRaw as OrgUnit[] : []
    const orgOptions = buildOrgOptions(orgUnits)
    // Teams filtered by selected department (if any)
    const availableTeams = (Array.isArray(teamsRaw) ? teamsRaw : []).filter(
        t => !form.departmentId || !t.departmentId || t.departmentId === form.departmentId
    )
    const teamOptions: ComboboxOption[] = availableTeams.map(t => ({
        value: t.id,
        label: t.name,
        secondary: t.department ?? undefined,
    }))

    const set = (field: keyof EmpForm) => (e: ChangeEvent<HTMLInputElement>) => {
        setForm(f => ({ ...f, [field]: e.target.value }))
        if (errors[field]) setErrors(prev => { const n = { ...prev }; delete n[field]; return n })
    }
    const setDate = (field: keyof EmpForm) => (value: string) => {
        setForm(f => ({ ...f, [field]: value }))
        if (errors[field]) setErrors(prev => { const n = { ...prev }; delete n[field]; return n })
    }

    const close = () => { onOpenChange(false); setTimeout(() => { setStep(1); setForm(EMPTY_FORM); setErrors({}) }, 300) }

    const validateStep1 = () => {
        const { ok, errors: errs } = zodToFieldErrors(employeeStep1Schema, {
            firstName: form.firstName,
            lastName: form.lastName,
            nationality: form.nationality,
            personalEmail: form.personalEmail,
            mobileNo: form.mobileNo,
            dateOfBirth: form.dateOfBirth,
        })
        setErrors(errs)
        if (!ok) toast.warning('Fix the highlighted fields', 'Please correct the errors before continuing.')
        return ok
    }

    const validateStep2 = () => {
        const { ok, errors: errs } = zodToFieldErrors(employeeStep2Schema, { joinDate: form.joinDate })
        setErrors(errs)
        if (!ok) toast.warning('Fix the highlighted fields', 'Please correct the errors before continuing.')
        return ok
    }

    const submit = async () => {
        const empNo = form.employeeNo || undefined
        const basic = parseFloat(form.basicSalary) || 0
        const housing = parseFloat(form.housingAllowance) || 0
        const transport = parseFloat(form.transportAllowance) || 0
        const other = parseFloat(form.otherAllowances) || 0
        try {
            // Auto-create designation if it's a new name not in the existing list
            if (form.designation) {
                const exists = (Array.isArray(designationList) ? designationList : [])
                    .some((d: { name: string; isActive: boolean }) => d.isActive && d.name.toLowerCase() === form.designation.toLowerCase())
                if (!exists) await createDesignation.mutateAsync({ name: form.designation })
            }
            const newEmp = await createEmployee.mutateAsync({
                firstName: form.firstName, lastName: form.lastName,
                dateOfBirth: form.dateOfBirth || undefined,
                gender: (form.gender as Employee['gender']) || undefined,
                nationality: form.nationality || undefined,
                passportNo: form.passportNo || undefined,
                mobileNo: form.mobileNo || undefined,
                personalEmail: form.personalEmail || undefined,
                workEmail: form.workEmail || undefined,
                maritalStatus: (form.maritalStatus as Employee['maritalStatus']) || undefined,
                emergencyContact: form.emergencyContact || undefined,
                emergencyContactName: form.emergencyContactName || undefined,
                emergencyContactPhone: form.emergencyContactPhone || undefined,
                homeCountryAddress: form.homeCountryAddress || undefined,
                employeeNo: empNo || undefined,
                divisionId: form.divisionId || undefined,
                departmentId: form.departmentId || undefined,
                branchId: form.branchId || undefined,
                department: form.department || undefined,
                designation: form.designation || undefined,
                joinDate: form.joinDate,
                contractType: (form.contractType as Employee['contractType']) || undefined,
                workLocation: form.workLocation || undefined,
                managerName: form.managerName || undefined,
                reportingTo: form.reportingTo || null,
                gradeLevel: form.gradeLevel || undefined,
                status: form.status as Employee['status'],
                basicSalary: basic || undefined,
                housingAllowance: housing || undefined,
                transportAllowance: transport || undefined,
                otherAllowances: other || undefined,
                totalSalary: basic + housing + transport + other || undefined,
                paymentMethod: (form.paymentMethod as Employee['paymentMethod']) || undefined,
                bankName: form.bankName || undefined,
                accountName: form.accountName || undefined,
                accountNumber: form.accountNumber || undefined,
                swiftCode: form.swiftCode || undefined,
                bankBranch: form.bankBranch || undefined,
                iban: form.iban || undefined,
                emiratisationCategory: (form.emiratisationCategory as Employee['emiratisationCategory']) || 'expat',
            })
            // Assign to team if selected (best-effort — doesn't fail the whole create)
            if (form.teamId && newEmp?.id) {
                api.post(`/teams/${form.teamId}/members`, { employeeIds: [newEmp.id] }).catch(() => {})
            }
            toast.success('Employee added', `${form.firstName} ${form.lastName} has been onboarded.`)
            close()
        } catch (err: unknown) {
            const e = err as Error & { message?: string; statusCode?: number }
            if (e?.statusCode === 402 || (e?.message ?? '').includes('Employee limit reached')) {
                toast.error('Employee limit reached', e?.message ?? 'Upgrade your plan to add more employees.')
                onOpenChange(false)
                navigate('/organization-settings', { state: { tab: 'subscription' } })
                return
            }
            const fieldErrors = apiErrorToFieldMap(e)
            if (Object.keys(fieldErrors).length) {
                setErrors(fieldErrors)
                const step1Fields = ['firstName', 'lastName', 'dateOfBirth', 'gender', 'maritalStatus', 'nationality', 'passportNo', 'mobileNo', 'personalEmail', 'emergencyContact']
                const step3Fields = ['basicSalary', 'housingAllowance', 'transportAllowance', 'otherAllowances', 'totalSalary', 'paymentMethod', 'bankName', 'iban', 'emiratisationCategory']
                const keys = Object.keys(fieldErrors)
                if (keys.some(k => step1Fields.includes(k))) setStep(1)
                else if (keys.some(k => step3Fields.includes(k))) setStep(3)
                else setStep(2)
            }
            toast.error('Failed to add employee', e?.message ?? 'Please try again.')
        }
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
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <FormField label="First Name" required error={errors.firstName}>
                                    <Input value={form.firstName} onChange={set('firstName')} placeholder="Ahmed" aria-invalid={!!errors.firstName} className={errors.firstName ? 'border-destructive' : ''} />
                                </FormField>
                                <FormField label="Last Name" required error={errors.lastName}>
                                    <Input value={form.lastName} onChange={set('lastName')} placeholder="Al Mansouri" aria-invalid={!!errors.lastName} className={errors.lastName ? 'border-destructive' : ''} />
                                </FormField>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <FormField label="Date of Birth" error={errors.dateOfBirth}>
                                    <DatePicker value={form.dateOfBirth} max={(() => { const d = new Date(); d.setFullYear(d.getFullYear() - 10); return d.toISOString().split('T')[0] })()} min="1950-01-01" onChange={setDate('dateOfBirth')} aria-invalid={!!errors.dateOfBirth} className={errors.dateOfBirth ? 'border-destructive' : ''} />
                                </FormField>
                                <div className="space-y-1.5">
                                    <Label>Gender</Label>
                                    <Select value={form.gender} onValueChange={v => setForm(f => ({ ...f, gender: v }))}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {GENDER_OPTIONS.map((o: SelectOption) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Marital Status</Label>
                                    <Select value={form.maritalStatus} onValueChange={v => setForm(f => ({ ...f, maritalStatus: v }))}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {MARITAL_STATUS_OPTIONS.map((o: SelectOption) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <FormField label="Nationality" required error={errors.nationality}>
                                    <CountrySelect
                                        value={resolveCountryIso(form.nationality)}
                                        onChange={(iso) => {
                                            setForm((f) => ({ ...f, nationality: countryNameFromIso(iso) }))
                                            if (errors.nationality) setErrors(prev => { const n = { ...prev }; delete n.nationality; return n })
                                        }}
                                        placeholder="Select nationality"
                                    />
                                </FormField>
                                <div className="space-y-1.5">
                                    <Label>Passport No</Label>
                                    <Input value={form.passportNo} onChange={set('passportNo')} placeholder="A12345678" />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <FormField label="Mobile" error={errors.mobileNo}>
                                    <PhoneInput
                                        value={form.mobileNo}
                                        onChange={(v) => { setForm((f) => ({ ...f, mobileNo: v })); if (errors.mobileNo) setErrors(prev => { const n = { ...prev }; delete n.mobileNo; return n }) }}
                                        defaultCountry={resolveCountryIso(form.nationality) ?? 'AE'}
                                        invalid={!!errors.mobileNo}
                                    />
                                </FormField>
                                <FormField label="Personal Email" error={errors.personalEmail}>
                                    <Input type="email" value={form.personalEmail} onChange={set('personalEmail')} placeholder="ahmed@gmail.com" aria-invalid={!!errors.personalEmail} className={errors.personalEmail ? 'border-destructive' : ''} />
                                </FormField>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <FormField label="Emergency Contact Name">
                                    <Input value={form.emergencyContactName} onChange={set('emergencyContactName')} placeholder="Full name" />
                                </FormField>
                                <FormField label="Emergency Contact Phone">
                                    <Input value={form.emergencyContactPhone} onChange={set('emergencyContactPhone')} placeholder="+971 50 000 0000" />
                                </FormField>
                            </div>
                            <FormField label="Home Country Address">
                                <Textarea value={form.homeCountryAddress} onChange={e => setForm(f => ({ ...f, homeCountryAddress: e.target.value }))} placeholder="Street, City, Country" rows={2} />
                            </FormField>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-muted-foreground">Employee No</label>
                                    <div className="flex h-9 items-center rounded-md border bg-muted/50 px-3 text-sm text-muted-foreground select-none">
                                        Auto-generated on save
                                    </div>
                                </div>
                                <FormField label="Join Date" required error={errors.joinDate}>
                                    <DatePicker value={form.joinDate} min="1970-01-01" onChange={setDate('joinDate')} aria-invalid={!!errors.joinDate} className={errors.joinDate ? 'border-destructive' : ''} />
                                </FormField>
                            </div>
                            <FormField label="Work Email" error={errors.workEmail} hint="Used for login invites and official communications">
                                <Input type="email" value={form.workEmail} onChange={set('workEmail')} placeholder="ahmed@company.ae" aria-invalid={!!errors.workEmail} className={errors.workEmail ? 'border-destructive' : ''} />
                            </FormField>
                            {/* Department picker — Branch and Division auto-assigned */}
                            <div className="space-y-1.5">
                                <Label>Department</Label>
                                <Combobox
                                    value={form.departmentId}
                                    onValueChange={deptId => {
                                        const opt = orgOptions.find(o => o.value === deptId)
                                        setForm(f => ({
                                            ...f,
                                            departmentId: deptId,
                                            branchId: opt?.branchId ?? '',
                                            divisionId: opt?.divisionId ?? '',
                                            teamId: '',
                                            reportingTo: opt?.headEmployeeId ?? '',
                                            managerName: opt?.headEmployeeName ?? '',
                                        }))
                                    }}
                                    options={orgOptions}
                                    placeholder="Select department…"
                                    searchPlaceholder="Search by department, division or branch…"
                                    emptyMessage="No departments found. Add them in Org Structure settings."
                                    clearable
                                />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label>Division</Label>
                                    <div className="flex h-9 items-center rounded-md border bg-muted/50 px-3 text-sm text-muted-foreground select-none">
                                        {form.divisionId ? (orgUnits.find(u => u.id === form.divisionId)?.name ?? '—') : <span className="italic">Auto-assigned from department</span>}
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Branch</Label>
                                    <div className="flex h-9 items-center rounded-md border bg-muted/50 px-3 text-sm text-muted-foreground select-none">
                                        {form.branchId ? (orgUnits.find(u => u.id === form.branchId)?.name ?? '—') : <span className="italic">Auto-assigned from department</span>}
                                    </div>
                                </div>
                            </div>
                            {form.managerName && (
                                <p className="text-[11px] text-muted-foreground">
                                    Reporting to <span className="font-medium">{form.managerName}</span>.
                                </p>
                            )}
                            {/* Team — filtered to the selected department */}
                            {teamOptions.length > 0 && (
                                <div className="space-y-1.5">
                                    <Label>Team <span className="text-muted-foreground font-normal">(optional)</span></Label>
                                    <Combobox
                                        value={form.teamId}
                                        onValueChange={v => setForm(f => ({ ...f, teamId: v }))}
                                        options={teamOptions}
                                        placeholder="Assign to a team…"
                                        searchPlaceholder="Search teams…"
                                        clearable
                                    />
                                </div>
                            )}
                            <div className="space-y-1.5">
                                <Label>Designation / Title</Label>
                                <Combobox
                                    value={form.designation}
                                    onValueChange={v => setForm(f => ({ ...f, designation: v }))}
                                    options={(Array.isArray(designationList) ? designationList : [])
                                        .filter((d: { isActive: boolean }) => d.isActive)
                                        .map((d: { id: string; name: string }) => ({ value: d.name, label: d.name }))}
                                    placeholder="Select or type designation…"
                                    searchPlaceholder="Search or create…"
                                    clearable
                                    creatable
                                />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label>Contract Type</Label>
                                    <Select value={form.contractType} onValueChange={v => setForm(f => ({ ...f, contractType: v }))}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {CONTRACT_TYPE_OPTIONS.map((o: SelectOption) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Work Location</Label>
                                    <Input value={form.workLocation} onChange={set('workLocation')} placeholder="e.g. Dubai HQ" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Grade Level</Label>
                                <Input value={form.gradeLevel} onChange={set('gradeLevel')} placeholder="e.g. L4" />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Status</Label>
                                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {NEW_EMPLOYEE_STATUS_OPTIONS.map((o: SelectOption) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label>Basic Salary (AED)</Label>
                                    <NumericInput value={form.basicSalary} onChange={set('basicSalary')} placeholder="0.00" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Housing Allowance (AED)</Label>
                                    <NumericInput value={form.housingAllowance} onChange={set('housingAllowance')} placeholder="0.00" />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label>Transport Allowance (AED)</Label>
                                    <NumericInput value={form.transportAllowance} onChange={set('transportAllowance')} placeholder="0.00" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Other Allowances (AED)</Label>
                                    <NumericInput value={form.otherAllowances} onChange={set('otherAllowances')} placeholder="0.00" />
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
                                        {PAYMENT_METHOD_OPTIONS.map((o: SelectOption) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            {form.paymentMethod === 'bank_transfer' && (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <Label>Account Name</Label>
                                            <Input value={form.accountName} onChange={set('accountName')} placeholder="Account holder name" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label>Account Number</Label>
                                            <Input value={form.accountNumber} onChange={set('accountNumber')} placeholder="e.g. 1234567890" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <Label>Bank Name</Label>
                                            <Input value={form.bankName} onChange={set('bankName')} placeholder="e.g. Emirates NBD" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label>Branch</Label>
                                            <Input value={form.bankBranch} onChange={set('bankBranch')} placeholder="e.g. Dubai Main Branch" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <Label>IBAN Number</Label>
                                            <Input value={form.iban} onChange={set('iban')} placeholder="AE070331234567890123456" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label>Swift Code</Label>
                                            <Input value={form.swiftCode} onChange={set('swiftCode')} placeholder="e.g. EBILAEAD" />
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div className="space-y-1.5">
                                <Label>Emiratisation Category</Label>
                                <Select value={form.emiratisationCategory} onValueChange={v => setForm(f => ({ ...f, emiratisationCategory: v }))}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {EMIRATISATION_OPTIONS.map((o: SelectOption) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
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
        </Dialog >
    )
}

// ─── Edit Employee Dialog ────────────────────────────────────────────────────
export function EditEmployeeDialog({
    open, onOpenChange, employee,
}: { open: boolean; onOpenChange: (o: boolean) => void; employee: Employee }) {
    const [form, setForm] = useState({
        firstName: employee.firstName ?? '',
        lastName: employee.lastName ?? '',
        dateOfBirth: employee.dateOfBirth ?? '',
        gender: employee.gender ?? 'male',
        nationality: employee.nationality ?? '',
        passportNo: employee.passportNo ?? '',
        mobileNo: employee.mobileNo ?? employee.phone ?? '',
        personalEmail: employee.personalEmail ?? '',
        maritalStatus: employee.maritalStatus ?? 'single',
        emergencyContactName: employee.emergencyContactName ?? '',
        emergencyContactPhone: employee.emergencyContactPhone ?? '',
        homeCountryAddress: employee.homeCountryAddress ?? '',
    })
    const [errors, setErrors] = useState<Record<string, string>>({})
    const updateEmployee = useUpdateEmployee(employee.id)

    const set = (field: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => {
        setForm(f => ({ ...f, [field]: e.target.value }))
        if (errors[field]) setErrors(prev => { const n = { ...prev }; delete n[field]; return n })
    }
    const setDate = (field: keyof typeof form) => (value: string) => {
        setForm(f => ({ ...f, [field]: value }))
        if (errors[field]) setErrors(prev => { const n = { ...prev }; delete n[field]; return n })
    }

    const close = () => { onOpenChange(false); setTimeout(() => setErrors({}), 300) }

    const submit = () => {
        const result = zodToFieldErrors(employeeStep1Schema, {
            firstName: form.firstName,
            lastName: form.lastName,
            nationality: form.nationality,
            personalEmail: form.personalEmail,
            mobileNo: form.mobileNo,
            dateOfBirth: form.dateOfBirth,
        })
        if (Object.keys(result.errors).length) {
            setErrors(result.errors)
            toast.warning('Fix the highlighted fields', 'Please correct the errors before saving.')
            return
        }
        updateEmployee.mutate(
            {
                firstName: form.firstName, lastName: form.lastName,
                dateOfBirth: form.dateOfBirth || undefined,
                gender: (form.gender as Employee['gender']) || undefined,
                nationality: form.nationality || undefined,
                passportNo: form.passportNo || undefined,
                mobileNo: form.mobileNo || undefined,
                personalEmail: form.personalEmail || undefined,
                maritalStatus: (form.maritalStatus as Employee['maritalStatus']) || undefined,
                emergencyContactName: form.emergencyContactName || undefined,
                emergencyContactPhone: form.emergencyContactPhone || undefined,
                homeCountryAddress: form.homeCountryAddress || undefined,
            },
            {
                onSuccess: () => { toast.success('Profile updated', `${form.firstName} ${form.lastName} has been updated.`); close() },
                onError: (err: Error & { message?: string }) => {
                    const fieldErrors = apiErrorToFieldMap(err)
                    if (Object.keys(fieldErrors).length) setErrors(fieldErrors)
                    toast.error('Failed to update', err?.message ?? 'Please try again.')
                },
            },
        )
    }

    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogContent size="lg">
                <DialogHeader>
                    <DialogTitle>Edit Profile — {employee.fullName}</DialogTitle>
                </DialogHeader>
                <DialogBody>
                    <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <FormField label="First Name" required error={errors.firstName}>
                                <Input value={form.firstName} onChange={set('firstName')} aria-invalid={!!errors.firstName} className={errors.firstName ? 'border-destructive' : ''} />
                            </FormField>
                            <FormField label="Last Name" required error={errors.lastName}>
                                <Input value={form.lastName} onChange={set('lastName')} aria-invalid={!!errors.lastName} className={errors.lastName ? 'border-destructive' : ''} />
                            </FormField>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="space-y-1.5"><Label>Date of Birth</Label><DatePicker value={form.dateOfBirth} max={(() => { const d = new Date(); d.setFullYear(d.getFullYear() - 10); return d.toISOString().split('T')[0] })()} min="1950-01-01" onChange={setDate('dateOfBirth')} /></div>
                            <div className="space-y-1.5">
                                <Label>Gender</Label>
                                <Select value={form.gender} onValueChange={v => setForm(f => ({ ...f, gender: v as NonNullable<Employee['gender']> }))}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {GENDER_OPTIONS.map((o: SelectOption) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Marital Status</Label>
                                <Select value={form.maritalStatus} onValueChange={v => setForm(f => ({ ...f, maritalStatus: v as NonNullable<Employee['maritalStatus']> }))}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {MARITAL_STATUS_OPTIONS.map((o: SelectOption) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <FormField label="Nationality" required error={errors.nationality}>
                                <CountrySelect
                                    value={resolveCountryIso(form.nationality)}
                                    onChange={(iso) => {
                                        setForm((f) => ({ ...f, nationality: countryNameFromIso(iso) }))
                                        if (errors.nationality) setErrors(prev => { const n = { ...prev }; delete n.nationality; return n })
                                    }}
                                    placeholder="Select"
                                />
                            </FormField>
                            <div className="space-y-1.5"><Label>Passport No</Label><Input value={form.passportNo} onChange={set('passportNo')} /></div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <FormField label="Mobile" required error={errors.mobileNo}>
                                <PhoneInput value={form.mobileNo} onChange={(v) => setForm((f) => ({ ...f, mobileNo: v }))} defaultCountry={resolveCountryIso(form.nationality) ?? 'AE'} />
                            </FormField>
                            <FormField label="Personal Email" error={errors.personalEmail}>
                                <Input type="email" value={form.personalEmail} onChange={set('personalEmail')} aria-invalid={!!errors.personalEmail} className={errors.personalEmail ? 'border-destructive' : ''} />
                            </FormField>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1.5"><Label>Emergency Contact Name</Label><Input value={form.emergencyContactName} onChange={set('emergencyContactName')} placeholder="Full name" /></div>
                            <div className="space-y-1.5"><Label>Emergency Contact Phone</Label><Input value={form.emergencyContactPhone} onChange={set('emergencyContactPhone')} placeholder="+971 50 000 0000" /></div>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Home Country Address</Label>
                            <Textarea value={form.homeCountryAddress} onChange={e => setForm(f => ({ ...f, homeCountryAddress: e.target.value }))} placeholder="Street, City, Country" rows={2} />
                        </div>
                    </div>
                </DialogBody>
                <DialogFooter>
                    <Button variant="outline" onClick={close}>Cancel</Button>
                    <Button onClick={submit} loading={updateEmployee.isPending}>Save Changes</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ─── Edit Employment Dialog ──────────────────────────────────────────────────

export function EditEmploymentDialog({
    open, onOpenChange, employee,
}: { open: boolean; onOpenChange: (o: boolean) => void; employee: Employee }) {
    const [form, setForm] = useState({
        joinDate: employee.joinDate ?? '',
        workEmail: employee.workEmail ?? '',
        departmentId: employee.departmentId ?? '',
        divisionId: employee.divisionId ?? '',
        branchId: employee.branchId ?? '',
        managerName: employee.managerName ?? '',
        reportingTo: employee.reportingTo ?? '',
        designation: employee.designation ?? '',
        contractType: employee.contractType ?? 'permanent',
        workLocation: employee.workLocation ?? '',
        gradeLevel: employee.gradeLevel ?? '',
        status: employee.status ?? 'active',
    })
    const [errors, setErrors] = useState<Record<string, string>>({})
    const updateEmployee = useUpdateEmployee(employee.id)
    const { data: orgUnitsRaw = [] } = useOrgUnits()
    const { data: designationList = [] } = useDesignations()
    const createDesignation = useCreateDesignation()
    const orgUnits = Array.isArray(orgUnitsRaw) ? orgUnitsRaw as OrgUnit[] : []
    const orgOptions = buildOrgOptions(orgUnits)

    const set = (field: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => {
        setForm(f => ({ ...f, [field]: e.target.value }))
        if (errors[field]) setErrors(prev => { const n = { ...prev }; delete n[field]; return n })
    }

    const close = () => { onOpenChange(false); setTimeout(() => setErrors({}), 300) }

    const submit = async () => {
        const result = zodToFieldErrors(employeeStep2Schema, { joinDate: form.joinDate })
        if (Object.keys(result.errors).length) {
            setErrors(result.errors)
            toast.warning('Fix the highlighted fields', 'Please correct the errors before saving.')
            return
        }
        if (form.designation) {
            const exists = (Array.isArray(designationList) ? designationList : [])
                .some((d: { name: string; isActive: boolean }) => d.isActive && d.name.toLowerCase() === form.designation.toLowerCase())
            if (!exists) await createDesignation.mutateAsync({ name: form.designation }).catch(() => {})
        }
        updateEmployee.mutate(
            {
                joinDate: form.joinDate,
                workEmail: form.workEmail || undefined,
                departmentId: form.departmentId || undefined,
                divisionId: form.divisionId || undefined,
                branchId: form.branchId || undefined,
                managerName: form.managerName || undefined,
                reportingTo: form.reportingTo || null,
                designation: form.designation || undefined,
                contractType: (form.contractType as Employee['contractType']) || undefined,
                workLocation: form.workLocation || undefined,
                gradeLevel: form.gradeLevel || undefined,
                status: form.status as Employee['status'],
            },
            {
                onSuccess: () => { toast.success('Employment updated', 'Employment details have been saved.'); close() },
                onError: (err: Error & { message?: string }) => {
                    const fieldErrors = apiErrorToFieldMap(err)
                    if (Object.keys(fieldErrors).length) setErrors(fieldErrors)
                    toast.error('Failed to update', err?.message ?? 'Please try again.')
                },
            },
        )
    }

    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogContent size="lg">
                <DialogHeader>
                    <DialogTitle>Edit Employment — {employee.fullName}</DialogTitle>
                </DialogHeader>
                <DialogBody>
                    <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <FormField label="Join Date" required error={errors.joinDate}>
                                <DatePicker value={form.joinDate} min="1970-01-01" onChange={v => { setForm(f => ({ ...f, joinDate: v ?? '' })); if (errors.joinDate) setErrors(p => { const n = { ...p }; delete n.joinDate; return n }) }} aria-invalid={!!errors.joinDate} className={errors.joinDate ? 'border-destructive' : ''} />
                            </FormField>
                            <FormField label="Work Email" error={errors.workEmail} hint="Used for login and communications">
                                <Input type="email" value={form.workEmail} onChange={set('workEmail')} placeholder="ahmed@company.ae" aria-invalid={!!errors.workEmail} className={errors.workEmail ? 'border-destructive' : ''} />
                            </FormField>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Department</Label>
                            <Combobox
                                value={form.departmentId}
                                onValueChange={deptId => {
                                    const opt = orgOptions.find(o => o.value === deptId)
                                    setForm(f => ({
                                        ...f,
                                        departmentId: deptId,
                                        branchId: opt?.branchId ?? '',
                                        divisionId: opt?.divisionId ?? '',
                                        reportingTo: opt?.headEmployeeId ?? f.reportingTo,
                                        managerName: opt?.headEmployeeName ?? f.managerName,
                                    }))
                                }}
                                options={orgOptions}
                                placeholder="Select department…"
                                searchPlaceholder="Search by department, division or branch…"
                                emptyMessage="No departments found."
                                clearable
                            />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>Division</Label>
                                <div className="flex h-9 items-center rounded-md border bg-muted/50 px-3 text-sm text-muted-foreground select-none">
                                    {form.divisionId ? (orgUnits.find(u => u.id === form.divisionId)?.name ?? '—') : <span className="italic">Auto-assigned from department</span>}
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Branch</Label>
                                <div className="flex h-9 items-center rounded-md border bg-muted/50 px-3 text-sm text-muted-foreground select-none">
                                    {form.branchId ? (orgUnits.find(u => u.id === form.branchId)?.name ?? '—') : <span className="italic">Auto-assigned from department</span>}
                                </div>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Designation</Label>
                            <Combobox
                                value={form.designation}
                                onValueChange={v => setForm(f => ({ ...f, designation: v }))}
                                options={(Array.isArray(designationList) ? designationList : [])
                                    .filter((d: { isActive: boolean }) => d.isActive)
                                    .map((d: { id: string; name: string }) => ({ value: d.name, label: d.name }))}
                                placeholder="Select or type designation…"
                                searchPlaceholder="Search or create…"
                                clearable
                                creatable
                            />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>Contract Type</Label>
                                <Select value={form.contractType} onValueChange={v => setForm(f => ({ ...f, contractType: v as NonNullable<Employee['contractType']> }))}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {CONTRACT_TYPE_OPTIONS.map((o: SelectOption) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5"><Label>Work Location</Label><Input value={form.workLocation} onChange={set('workLocation')} /></div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1.5"><Label>Reporting Manager</Label><ManagerPicker value={form.reportingTo} excludeId={employee.id} onChange={(id, name) => setForm(f => ({ ...f, reportingTo: id, managerName: name }))} /></div>
                            <div className="space-y-1.5"><Label>Grade Level</Label><Input value={form.gradeLevel} onChange={set('gradeLevel')} /></div>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Status</Label>
                            <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as Employee['status'] }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {EDIT_EMPLOYEE_STATUS_OPTIONS.map((o: SelectOption) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </DialogBody>
                <DialogFooter>
                    <Button variant="outline" onClick={close}>Cancel</Button>
                    <Button onClick={submit} loading={updateEmployee.isPending}>Save Changes</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ─── Edit Payroll Dialog ─────────────────────────────────────────────────────

export function EditPayrollDialog({
    open, onOpenChange, employee,
}: { open: boolean; onOpenChange: (o: boolean) => void; employee: Employee }) {
    const [form, setForm] = useState({
        basicSalary: String(employee.basicSalary ?? ''),
        housingAllowance: String(employee.housingAllowance ?? ''),
        transportAllowance: String(employee.transportAllowance ?? ''),
        otherAllowances: String(employee.otherAllowances ?? ''),
        paymentMethod: employee.paymentMethod ?? 'bank_transfer',
        bankName: employee.bankName ?? '',
        accountName: employee.accountName ?? '',
        accountNumber: employee.accountNumber ?? '',
        swiftCode: employee.swiftCode ?? '',
        bankBranch: employee.bankBranch ?? '',
        iban: employee.iban ?? '',
        emiratisationCategory: employee.emiratisationCategory ?? 'expat',
    })
    const [errors, setErrors] = useState<Record<string, string>>({})
    const updateEmployee = useUpdateEmployee(employee.id)

    const set = (field: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => {
        setForm(f => ({ ...f, [field]: e.target.value }))
        if (errors[field]) setErrors(prev => { const n = { ...prev }; delete n[field]; return n })
    }

    const close = () => { onOpenChange(false); setTimeout(() => setErrors({}), 300) }

    const submit = () => {
        const basic = parseFloat(form.basicSalary) || 0
        const housing = parseFloat(form.housingAllowance) || 0
        const transport = parseFloat(form.transportAllowance) || 0
        const other = parseFloat(form.otherAllowances) || 0
        const total = basic + housing + transport + other
        const result = zodToFieldErrors(employeeSalaryRuleSchema, { basicSalary: basic, totalSalary: total })
        if (Object.keys(result.errors).length) {
            setErrors(result.errors)
            toast.warning('Fix the highlighted fields', 'Please correct the errors before saving.')
            return
        }
        updateEmployee.mutate(
            {
                basicSalary: basic || undefined,
                housingAllowance: housing || undefined,
                transportAllowance: transport || undefined,
                otherAllowances: other || undefined,
                totalSalary: total || undefined,
                paymentMethod: (form.paymentMethod as Employee['paymentMethod']) || undefined,
                bankName: form.bankName || undefined,
                accountName: form.accountName || undefined,
                accountNumber: form.accountNumber || undefined,
                swiftCode: form.swiftCode || undefined,
                bankBranch: form.bankBranch || undefined,
                iban: form.iban || undefined,
                emiratisationCategory: (form.emiratisationCategory as Employee['emiratisationCategory']) || 'expat',
            },
            {
                onSuccess: () => { toast.success('Payroll updated', 'Payroll details have been saved.'); close() },
                onError: (err: Error & { message?: string }) => {
                    const fieldErrors = apiErrorToFieldMap(err)
                    if (Object.keys(fieldErrors).length) setErrors(fieldErrors)
                    toast.error('Failed to update', err?.message ?? 'Please try again.')
                },
            },
        )
    }

    const totalPackage = (parseFloat(form.basicSalary) || 0) + (parseFloat(form.housingAllowance) || 0) + (parseFloat(form.transportAllowance) || 0) + (parseFloat(form.otherAllowances) || 0)

    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogContent size="lg">
                <DialogHeader>
                    <DialogTitle>Edit Payroll — {employee.fullName}</DialogTitle>
                </DialogHeader>
                <DialogBody>
                    <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <FormField label="Basic Salary (AED)" error={errors.basicSalary}>
                                <NumericInput value={form.basicSalary} onChange={set('basicSalary')} aria-invalid={!!errors.basicSalary} className={errors.basicSalary ? 'border-destructive' : ''} />
                            </FormField>
                            <div className="space-y-1.5"><Label>Housing Allowance (AED)</Label><NumericInput value={form.housingAllowance} onChange={set('housingAllowance')} /></div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1.5"><Label>Transport Allowance (AED)</Label><NumericInput value={form.transportAllowance} onChange={set('transportAllowance')} /></div>
                            <div className="space-y-1.5"><Label>Other Allowances (AED)</Label><NumericInput value={form.otherAllowances} onChange={set('otherAllowances')} /></div>
                        </div>
                        {totalPackage > 0 && (
                            <div className="flex justify-between items-center px-3 py-2 bg-muted rounded-lg text-sm">
                                <span className="text-muted-foreground">Total Package</span>
                                <span className="font-bold">AED {totalPackage.toLocaleString()}</span>
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <Label>Payment Method</Label>
                            <Select value={form.paymentMethod} onValueChange={v => setForm(f => ({ ...f, paymentMethod: v as NonNullable<Employee['paymentMethod']> }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {PAYMENT_METHOD_OPTIONS.map((o: SelectOption) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        {form.paymentMethod === 'bank_transfer' && (
                            <div className="space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1.5"><Label>Account Name</Label><Input value={form.accountName} onChange={set('accountName')} placeholder="Account holder name" /></div>
                                    <div className="space-y-1.5"><Label>Account Number</Label><Input value={form.accountNumber} onChange={set('accountNumber')} placeholder="e.g. 1234567890" /></div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1.5"><Label>Bank Name</Label><Input value={form.bankName} onChange={set('bankName')} placeholder="e.g. Emirates NBD" /></div>
                                    <div className="space-y-1.5"><Label>Bank Branch</Label><Input value={form.bankBranch} onChange={set('bankBranch')} placeholder="e.g. Dubai Main Branch" /></div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1.5"><Label>IBAN Number</Label><Input value={form.iban} onChange={set('iban')} placeholder="AE070331234567890123456" /></div>
                                    <div className="space-y-1.5"><Label>Swift Code</Label><Input value={form.swiftCode} onChange={set('swiftCode')} placeholder="e.g. EBILAEAD" /></div>
                                </div>
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <Label>Emiratisation Category</Label>
                            <Select value={form.emiratisationCategory} onValueChange={v => setForm(f => ({ ...f, emiratisationCategory: v as NonNullable<Employee['emiratisationCategory']> }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {EMIRATISATION_OPTIONS.map((o: SelectOption) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </DialogBody>
                <DialogFooter>
                    <Button variant="outline" onClick={close}>Cancel</Button>
                    <Button onClick={submit} loading={updateEmployee.isPending}>Save Changes</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ─── Edit Job Dialog ────────────────────────────────────────────────────────
export function EditJobDialog({
    open,
    onOpenChange,
    job,
}: {
    open: boolean
    onOpenChange: (o: boolean) => void
    job: { id: string; title?: string; department?: string; location?: string | null; type?: string; openings?: number; minSalary?: number | string | null; maxSalary?: number | string | null; description?: string | null; status?: string }
}) {
    const [title, setTitle] = useState(job.title ?? '')
    const [department, setDepartment] = useState(job.department ?? '')
    const [location, setLocation] = useState(job.location ?? '')
    const [type, setType] = useState(job.type ?? 'full_time')
    const [openings, setOpenings] = useState(job.openings ?? 1)
    const [minSalary, setMinSalary] = useState(Number(job.minSalary ?? 0))
    const [maxSalary, setMaxSalary] = useState(Number(job.maxSalary ?? 0))
    const [description, setDescription] = useState(job.description ?? '')
    const [status, setStatus] = useState(job.status ?? 'open')
    const updateJob = useUpdateJob()

    useEffect(() => {
        if (open) {
            setTitle(job.title ?? ''); setDepartment(job.department ?? ''); setLocation(job.location ?? '')
            setType(job.type ?? 'full_time'); setOpenings(job.openings ?? 1)
            setMinSalary(Number(job.minSalary ?? 0)); setMaxSalary(Number(job.maxSalary ?? 0))
            setDescription(job.description ?? ''); setStatus(job.status ?? 'open')
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    const submit = () => {
        const { ok, errors } = zodToFieldErrors(jobPostSchema, { title, department })
        if (!ok) {
            toast.warning('Missing fields', Object.values(errors)[0] ?? 'Please fill required fields.')
            return
        }
        updateJob.mutate(
            { id: job.id, data: { title, department, location: location || null, type, openings, minSalary, maxSalary, description: description || null, status } },
            {
                onSuccess: () => {
                    toast.success('Job updated', `${title} has been saved.`)
                    onOpenChange(false)
                },
                onError: (err: Error & { message?: string }) => toast.error('Failed to update job', err?.message ?? 'Please try again.'),
            },
        )
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size="md">
                <DialogHeader>
                    <DialogTitle>Edit Job</DialogTitle>
                </DialogHeader>
                <DialogBody className="space-y-3">
                    <div className="space-y-1.5">
                        <Label required>Job Title</Label>
                        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label required>Department</Label>
                            <Input value={department} onChange={(e) => setDepartment(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Location</Label>
                            <Input value={location ?? ''} onChange={(e) => setLocation(e.target.value)} />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                            <Label>Type</Label>
                            <Select value={type} onValueChange={setType}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {JOB_TYPE_OPTIONS.map((o: SelectOption) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Openings</Label>
                            <NumericInput decimal={false} value={openings} onChange={(e) => setOpenings(Number(e.target.value))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Status</Label>
                            <Select value={status} onValueChange={setStatus}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {JOB_STATUS_OPTIONS.map((o: SelectOption) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>Min Salary (AED)</Label>
                            <NumericInput value={minSalary} onChange={(e) => setMinSalary(Number(e.target.value))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Max Salary (AED)</Label>
                            <NumericInput value={maxSalary} onChange={(e) => setMaxSalary(Number(e.target.value))} />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Description</Label>
                        <Textarea value={description ?? ''} onChange={(e) => setDescription(e.target.value)} rows={3} />
                    </div>
                </DialogBody>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={submit} loading={updateJob.isPending}>Save Changes</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ─── Edit Document Dialog ───────────────────────────────────────────────────
export function EditDocumentDialog({
    open,
    onOpenChange,
    document: doc,
}: {
    open: boolean
    onOpenChange: (o: boolean) => void
    document: { id: string; fileName?: string | null; category?: string; docType?: string; expiryDate?: string | null }
}) {
    const [fileName, setFileName] = useState(doc.fileName ?? '')
    const [category, setCategory] = useState(doc.category ?? '')
    const [docType, setDocType] = useState(doc.docType ?? '')
    const [expiryDate, setExpiryDate] = useState(doc.expiryDate ? String(doc.expiryDate).slice(0, 10) : '')
    const updateDoc = useUpdateDocument(doc.id)

    useEffect(() => {
        if (open) {
            setFileName(doc.fileName ?? ''); setCategory(doc.category ?? '')
            setDocType(doc.docType ?? ''); setExpiryDate(doc.expiryDate ? String(doc.expiryDate).slice(0, 10) : '')
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    const submit = () => {
        const { ok, errors } = zodToFieldErrors(documentMetaSchema, { category, type: docType })
        if (!ok) {
            toast.warning('Missing fields', Object.values(errors)[0] ?? 'Please fill required fields.')
            return
        }
        updateDoc.mutate(
            {
                fileName: fileName || undefined,
                category,
                docType,
                expiryDate: expiryDate || undefined,
            },
            {
                onSuccess: () => {
                    toast.success('Document updated', 'Changes have been saved.')
                    onOpenChange(false)
                },
                onError: (err: Error & { message?: string }) => toast.error('Failed to update document', err?.message ?? 'Please try again.'),
            },
        )
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size="sm">
                <DialogHeader>
                    <DialogTitle>Edit Document</DialogTitle>
                </DialogHeader>
                <DialogBody className="space-y-3">
                    <div className="space-y-1.5">
                        <Label>File Name</Label>
                        <Input value={fileName} onChange={(e) => setFileName(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label required>Category</Label>
                            <Select value={category} onValueChange={setCategory}>
                                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                                <SelectContent>
                                    {EDIT_DOC_CATEGORY_OPTIONS.map((o: SelectOption) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label required>Document Type</Label>
                            <Input value={docType} onChange={(e) => setDocType(e.target.value)} placeholder="e.g. passport" />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Expiry Date</Label>
                        <DatePicker value={expiryDate} onChange={setExpiryDate} />
                    </div>
                </DialogBody>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={submit} loading={updateDoc.isPending}>Save Changes</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ─── Assign Asset to Employee ─────────────────────────────────────────────────

export function AssignAssetToEmployeeDialog({
    employee,
    open,
    onOpenChange,
}: {
    employee: Pick<Employee, 'id' | 'firstName' | 'lastName'>
    open: boolean
    onOpenChange: (open: boolean) => void
}) {
    const { data: assetsResult, isLoading: assetsLoading } = useAssets({ status: 'available', limit: 100 })
    const availableAssets: Asset[] = assetsResult?.data ?? []
    const assignAsset = useAssignAsset()

    const [assetId, setAssetId] = useState('')
    const [assignedDate, setAssignedDate] = useState(new Date().toISOString().slice(0, 10))
    const [expectedReturnDate, setExpectedReturnDate] = useState('')
    const [notes, setNotes] = useState('')
    const [assetError, setAssetError] = useState('')

    useEffect(() => {
        if (!open) {
            setAssetId('')
            setAssignedDate(new Date().toISOString().slice(0, 10))
            setExpectedReturnDate('')
            setNotes('')
            setAssetError('')
        }
    }, [open])

    const assetOptions: ComboboxOption[] = useMemo(() =>
        availableAssets.map(a => ({
            value: a.id,
            label: a.name,
            secondary: [a.assetCode, a.categoryName, a.brand && a.model ? `${a.brand} ${a.model}` : (a.brand ?? a.model ?? null)].filter(Boolean).join(' · '),
        })),
        [availableAssets],
    )

    const selectedAsset = availableAssets.find(a => a.id === assetId) ?? null

    async function handleSubmit(e: { preventDefault(): void }) {
        e.preventDefault()
        if (!assetId) { setAssetError('Please select an asset'); return }
        setAssetError('')
        try {
            await assignAsset.mutateAsync({
                assetId,
                employeeId: employee.id,
                assignedDate,
                expectedReturnDate: expectedReturnDate || undefined,
                notes: notes.trim() || undefined,
            })
            toast.success('Asset assigned', `${selectedAsset?.name ?? 'Asset'} has been assigned to ${employee.firstName} ${employee.lastName}.`)
            onOpenChange(false)
        } catch (err) {
            toast.error('Assignment failed', err instanceof Error ? err.message : 'Please try again.')
        }
    }

    const CONDITION_LABEL: Record<string, string> = { new: 'New', good: 'Good', damaged: 'Damaged' }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size="sm">
                <DialogHeader>
                    <DialogTitle>Assign Asset — {employee.firstName} {employee.lastName}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <DialogBody className="space-y-4">
                        <FormField label="Asset" required error={assetError}>
                            <Combobox
                                value={assetId}
                                onValueChange={v => { setAssetId(v); setAssetError('') }}
                                options={assetOptions}
                                placeholder={assetsLoading ? 'Loading assets…' : availableAssets.length === 0 ? 'No available assets' : 'Select an available asset…'}
                                searchPlaceholder="Search by name, code, or category…"
                                emptyMessage="No available assets match your search."
                                disabled={assetsLoading || availableAssets.length === 0}
                                clearable
                            />
                        </FormField>

                        {selectedAsset && (
                            <div className="rounded-md border bg-muted/30 px-3 py-2.5 space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-medium leading-tight">{selectedAsset.name}</p>
                                    <span className="text-[10px] font-mono text-muted-foreground shrink-0">{selectedAsset.assetCode}</span>
                                </div>
                                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                                    {selectedAsset.categoryName && (
                                        <p className="text-xs text-muted-foreground">{selectedAsset.categoryName}</p>
                                    )}
                                    {(selectedAsset.brand || selectedAsset.model) && (
                                        <p className="text-xs text-muted-foreground">
                                            {[selectedAsset.brand, selectedAsset.model].filter(Boolean).join(' ')}
                                        </p>
                                    )}
                                    {selectedAsset.serialNumber && (
                                        <p className="text-xs text-muted-foreground">S/N: {selectedAsset.serialNumber}</p>
                                    )}
                                    {selectedAsset.condition && (
                                        <p className="text-xs text-muted-foreground">Condition: {CONDITION_LABEL[selectedAsset.condition] ?? selectedAsset.condition}</p>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                            <FormField label="Assigned Date" required>
                                <DatePicker
                                    value={assignedDate}
                                    onChange={v => setAssignedDate(v || assignedDate)}
                                />
                            </FormField>
                            <FormField label="Expected Return Date">
                                <DatePicker
                                    value={expectedReturnDate}
                                    onChange={v => setExpectedReturnDate(v ?? '')}
                                />
                            </FormField>
                        </div>

                        <FormField label="Notes">
                            <Textarea
                                value={notes}
                                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
                                rows={2}
                                placeholder="Optional notes about this assignment…"
                            />
                        </FormField>
                    </DialogBody>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" loading={assignAsset.isPending}>Assign Asset</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
