import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import type { ChangeEvent, KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'
import { Briefcase, MapPin, Users, DollarSign, CalendarDays, Tag } from 'lucide-react'
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
import { useCreateEmployee, useUpdateEmployee, useNextEmployeeNo, useEmployeeSalaryComponents } from '@/hooks/useEmployees'
import { useSalaryComponents } from '@/hooks/useSalaryComponents'
import { EmployeeSelect } from '@/components/shared/EmployeeSelect'
import { useOrgUnits, type OrgUnit } from '@/hooks/useOrgUnits'
import { useDesignations, useCreateDesignation } from '@/hooks/useDesignations'
import { useGradeLevels, type GradeLevel } from '@/hooks/useGradeLevels'
import { useTeams } from '@/hooks/useTeams'
import { useUpdateDocument } from '@/hooks/useDocuments'
import { PhoneInput, CountrySelect, resolveCountryIso, countryNameFromIso } from '@/components/shared/PhoneInput'
import { FormField } from '@/components/shared/FormField'
import { api, apiErrorToFieldMap, ApiError } from '@/lib/api'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { employeeStep1Schema, employeeStep2Schema, employeeSalaryRuleSchema, jobPostSchema, visaApplicationSchema, leaveRequestSchema, documentMetaSchema, zodToFieldErrors } from '@/lib/schemas'
import {
    JOB_TYPE_OPTIONS, JOB_STATUS_OPTIONS, WORKPLACE_TYPE_OPTIONS,
    VISA_APPLICATION_TYPE_OPTIONS, VISA_PRIORITY_OPTIONS,
    LEAVE_TYPE_OPTIONS,
    GENDER_OPTIONS, MARITAL_STATUS_OPTIONS, CONTRACT_TYPE_OPTIONS,
    PAYMENT_METHOD_OPTIONS, EMIRATISATION_OPTIONS,
    NEW_EMPLOYEE_STATUS_OPTIONS, EDIT_EMPLOYEE_STATUS_OPTIONS,
    EDIT_DOC_CATEGORY_OPTIONS,
    type SelectOption,
} from '@/lib/options'
import { useShifts } from '@/hooks/useShifts'
import type { Employee, Shift } from '@/types'


// Standard display order for salary-component inputs. Mirrors UAE WPS
// reporting order (Basic first, then statutory allowances, then everything
// else), so HR sees the same shape across Add/Edit Employee, Change Salary,
// and the payslip breakdown. Custom tenant components sort last in their
// catalog-created order — they pick up rank 99 here and then fall back to
// the original array order, which is alphabetical by name from the API.
const CATEGORY_RANK: Record<string, number> = {
    basic: 0,
    housing: 1,
    transport: 2,
    cost_of_living: 3,
    custom_allowance: 4,
    social: 5,
}
function byCatalogPriority<T extends { category: string; name: string }>(a: T, b: T): number {
    const ra = CATEGORY_RANK[a.category] ?? 99
    const rb = CATEGORY_RANK[b.category] ?? 99
    if (ra !== rb) return ra - rb
    return a.name.localeCompare(b.name)
}

/**
 * Returns the component's effective calculation type. Basic-category
 * percentage components ARE supported — they multiply against the FLAT
 * basic sum (the resolver enforces this so the percentage doesn't
 * recursively include itself in its own multiplier).
 */
function effectiveCalcType(
    component: { category?: string; calculationType?: 'flat' | 'percentage_of_basic' | null },
): 'flat' | 'percentage_of_basic' {
    return component.calculationType === 'percentage_of_basic' ? 'percentage_of_basic' : 'flat'
}

/**
 * Convert a raw form input for a single catalog component into AED.
 *
 * For `flat` components the input IS the AED amount.
 * For `percentage_of_basic` the input is a percentage rate (e.g. 25 = 25%);
 * the AED value depends on the employee's basic, which is computed first
 * and then passed in here as `basicAed`.
 *
 * Used by every salary form (Add/Edit Employee Step 3, EditPayrollDialog,
 * ChangeSalaryDialog) so the Total Package preview AND the derived legacy
 * columns (basicSalary / housingAllowance / …) match what the payroll
 * resolver will compute server-side.
 */
function resolveComponentAed(
    component: { category?: string; calculationType?: 'flat' | 'percentage_of_basic' | null },
    rawInput: string | number | null | undefined,
    basicAed: number,
): number {
    const raw = typeof rawInput === 'number' ? rawInput : (parseFloat(String(rawInput ?? '')) || 0)
    if (!raw) return 0
    return effectiveCalcType(component) === 'percentage_of_basic' ? (basicAed * raw) / 100 : raw
}

/**
 * Given the user's componentAmounts map + the catalog, return the resolved
 * AED totals per category (basic, housing, transport) plus a rolled-up
 * "other" bucket for everything else. Basic is treated as flat regardless
 * of calculation_type — matches the resolver contract on the backend.
 */
function deriveLegacyTotalsFromCatalog(
    catalog: ReadonlyArray<{ id: string; category: string; calculationType?: 'flat' | 'percentage_of_basic' | null }>,
    amounts: Readonly<Record<string, string>>,
) {
    // Multiplier base for every percentage component: the FLAT basic sum
    // only. A basic-category percentage component then multiplies against
    // this base AND rolls back into the basic total — same math as the
    // backend payroll resolver.
    const basicFlat = catalog
        .filter((c) => c.category === 'basic' && effectiveCalcType(c) !== 'percentage_of_basic')
        .reduce((s, c) => s + (parseFloat(amounts[c.id] || '0') || 0), 0)
    const sumCategory = (cat: string) => catalog
        .filter((c) => c.category === cat)
        .reduce((s, c) => s + resolveComponentAed(c, amounts[c.id], basicFlat), 0)
    const basic = sumCategory('basic')
    const housing = sumCategory('housing')
    const transport = sumCategory('transport')
    const other = catalog
        .filter((c) => !['basic', 'housing', 'transport'].includes(c.category))
        .reduce((s, c) => s + resolveComponentAed(c, amounts[c.id], basicFlat), 0)
    return { basic, housing, transport, other, total: basic + housing + transport + other }
}


function buildGradeLevelOptions(grades: GradeLevel[]): ComboboxOption[] {
    const toOption = (g: GradeLevel): ComboboxOption => ({
        value: g.id,
        label: g.code ? `${g.code} – ${g.name}` : g.name,
        secondary: g.hierarchy ?? undefined,
    })
    return grades
        .toSorted((a, b) => {
            if (a.level == null && b.level == null) return a.name.localeCompare(b.name)
            if (a.level == null) return 1
            if (b.level == null) return -1
            return a.level - b.level
        })
        .map(toOption)
}

// Searchable reporting-manager picker - server-side search, limit 20.
function ManagerPicker({
    value, onChange, excludeId,
}: {
    value: string
    onChange: (id: string, name: string) => void
    excludeId?: string
}) {
    return (
        <EmployeeSelect
            value={value}
            onValueChange={id => { if (!id) onChange('', '') }}
            onEmployeeChange={emp => {
                if (!emp) onChange('', '')
                else onChange(emp.id, `${emp.firstName} ${emp.lastName}`)
            }}
            excludeId={excludeId}
            clearable
            placeholder="— No manager (top-level) —"
        />
    )
}

// Build flat department options with hierarchy path for the org structure picker.
export function buildOrgOptions(units: OrgUnit[]): Array<ComboboxOption & { branchId: string; divisionId: string; headEmployeeId: string | null; headEmployeeName: string | null }> {
    return units.reduce<Array<ComboboxOption & { branchId: string; divisionId: string; headEmployeeId: string | null; headEmployeeName: string | null }>>((acc, dept) => {
        if (dept.type !== 'department' || !dept.isActive) return acc
        const division = units.find(u => u.id === dept.parentId)
        const branch = division ? units.find(u => u.id === division.parentId) : null
        const path = [branch?.name, division?.name].filter(Boolean).join(' → ')
        acc.push({
            value: dept.id,
            label: dept.name,
            secondary: path || undefined,
            branchId: branch?.id ?? '',
            divisionId: division?.id ?? '',
            headEmployeeId: dept.headEmployeeId ?? null,
            headEmployeeName: dept.headEmployeeName ?? null,
        })
        return acc
    }, [])
}

// ─── Job status pill toggle (shared by New + Edit Job dialogs) ──────────────
// Each status gets its own colour — light tinted background while idle, the
// stronger version of the same hue when selected, with a faint ring around
// the active pill so the choice is unambiguous on either theme.
const JOB_STATUS_PILL: Record<string, { idle: string; active: string; ring: string }> = {
    draft: {
        idle: 'text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800/60',
        active: 'bg-slate-700 text-white shadow-sm dark:bg-slate-200 dark:text-slate-900',
        ring: 'ring-slate-700/20 dark:ring-slate-200/20',
    },
    open: {
        idle: 'text-emerald-700 hover:bg-emerald-100/70 dark:text-emerald-300 dark:hover:bg-emerald-950/60',
        active: 'bg-emerald-600 text-white shadow-sm dark:bg-emerald-500 dark:text-white',
        ring: 'ring-emerald-600/30 dark:ring-emerald-500/30',
    },
    closed: {
        idle: 'text-rose-700 hover:bg-rose-100/70 dark:text-rose-300 dark:hover:bg-rose-950/60',
        active: 'bg-rose-600 text-white shadow-sm dark:bg-rose-500 dark:text-white',
        ring: 'ring-rose-600/30 dark:ring-rose-500/30',
    },
    on_hold: {
        idle: 'text-amber-700 hover:bg-amber-100/70 dark:text-amber-300 dark:hover:bg-amber-950/60',
        active: 'bg-amber-500 text-white shadow-sm dark:bg-amber-400 dark:text-amber-950',
        ring: 'ring-amber-500/30 dark:ring-amber-400/30',
    },
}

function StatusPills({
    value,
    onChange,
    options,
}: {
    value: string
    onChange: (v: string) => void
    options: Array<{ value: string; label: string }>
}) {
    return (
        <div className="flex items-center gap-1 rounded-full border border-border bg-muted/30 p-0.5 mr-8">
            {options.map((o) => {
                const palette = JOB_STATUS_PILL[o.value] ?? JOB_STATUS_PILL.draft
                const isActive = value === o.value
                return (
                    <button
                        key={o.value}
                        type="button"
                        onClick={() => onChange(o.value)}
                        aria-pressed={isActive}
                        className={cn(
                            'px-3 py-1 rounded-full text-xs font-medium transition-all',
                            isActive
                                ? cn(palette.active, 'ring-2', palette.ring)
                                : palette.idle,
                        )}
                    >
                        {o.label}
                    </button>
                )
            })}
        </div>
    )
}

// ─── New Job Dialog ─────────────────────────────────────────────────────────
export function NewJobDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
    const [title, setTitle] = useState('')
    const [department, setDepartment] = useState('')
    const [departmentId, setDepartmentId] = useState('')
    const [location, setLocation] = useState('')
    const [type, setType] = useState('full_time')
    const [workplaceType, setWorkplaceType] = useState('on_site')
    const [openings, setOpenings] = useState(1)
    const [minSalary, setMinSalary] = useState(0)
    const [maxSalary, setMaxSalary] = useState(0)
    const [description, setDescription] = useState('')
    const [closingDate, setClosingDate] = useState('')
    const [status, setStatus] = useState<'open' | 'draft'>('open')
    const [requirements, setRequirements] = useState<string[]>([])
    const [reqInput, setReqInput] = useState('')
    const [skills, setSkills] = useState<string[]>([])
    const [skillInput, setSkillInput] = useState('')
    const [qualifications, setQualifications] = useState<string[]>([])
    const [qualInput, setQualInput] = useState('')
    const reqInputRef = useRef<HTMLInputElement>(null)
    const createJob = useCreateJob()
    const { data: orgUnitsRaw = [] } = useOrgUnits()
    const orgUnits = Array.isArray(orgUnitsRaw) ? orgUnitsRaw as OrgUnit[] : []
    const orgOptions = buildOrgOptions(orgUnits)

    const [prevOpen, setPrevOpen] = useState(true)
    if (!open && prevOpen) {
        setPrevOpen(false)
        setTitle(''); setDepartment(''); setDepartmentId(''); setLocation(''); setType('full_time')
        setWorkplaceType('on_site')
        setOpenings(1); setMinSalary(0); setMaxSalary(0); setDescription('')
        setClosingDate(''); setStatus('open'); setRequirements([]); setReqInput('')
        setSkills([]); setSkillInput(''); setQualifications([]); setQualInput('')
    } else if (open && !prevOpen) {
        setPrevOpen(true)
    }

    const addRequirement = useCallback(() => {
        const val = reqInput.trim()
        if (val && !requirements.includes(val)) setRequirements(r => [...r, val])
        setReqInput('')
    }, [reqInput, requirements])

    const onReqKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') { e.preventDefault(); addRequirement() }
        if (e.key === 'Backspace' && !reqInput && requirements.length > 0)
            setRequirements(r => r.slice(0, -1))
    }, [addRequirement, reqInput, requirements.length])

    const addSkill = useCallback(() => {
        const val = skillInput.trim()
        if (val && !skills.includes(val)) setSkills(s => [...s, val])
        setSkillInput('')
    }, [skillInput, skills])

    const onSkillKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') { e.preventDefault(); addSkill() }
        if (e.key === 'Backspace' && !skillInput && skills.length > 0) setSkills(s => s.slice(0, -1))
    }, [addSkill, skillInput, skills.length])

    const addQualification = useCallback(() => {
        const val = qualInput.trim()
        if (val && !qualifications.includes(val)) setQualifications(q => [...q, val])
        setQualInput('')
    }, [qualInput, qualifications])

    const onQualKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') { e.preventDefault(); addQualification() }
        if (e.key === 'Backspace' && !qualInput && qualifications.length > 0) setQualifications(q => q.slice(0, -1))
    }, [addQualification, qualInput, qualifications.length])

    const submit = () => {
        const { ok, errors } = zodToFieldErrors(jobPostSchema, { title, department })
        if (!ok) {
            toast.warning('Missing fields', Object.values(errors)[0] ?? 'Please fill required fields.')
            return
        }
        createJob.mutate(
            { title, department, location: location || null, type, workplaceType, openings, minSalary, maxSalary, description: description || null, status, closingDate: closingDate || null, requirements, skills, qualifications },
            {
                onSuccess: () => {
                    toast.success('Job posted', `${title} has been ${status === 'draft' ? 'saved as draft' : 'posted'}.`)
                    onOpenChange(false)
                },
                onError: () => toast.error('Failed to post job', 'Please try again.'),
            },
        )
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {/* `full` = max-w-6xl (~1152px). The form is dense (left meta column +
                rich-text editor + chip lists) so the extra width keeps the rich
                text editor readable without crowding the metadata column. */}
            {/* Custom width — `full` (max-w-6xl, 1152px) + override to max-w-7xl
                (1280px) so the metadata column + rich-text editor + chip lists
                all sit comfortably without feeling cramped. Full-screen would
                lose the "edit in context" feel — wider is better here. */}
            <DialogContent size="full" className="lg:max-w-7xl">
                <DialogHeader>
                    <div className="flex items-center justify-between">
                        <DialogTitle>Post New Job</DialogTitle>
                        <StatusPills
                            value={status}
                            onChange={(v) => setStatus(v as 'open' | 'draft')}
                            options={[{ value: 'open', label: 'Open' }, { value: 'draft', label: 'Draft' }]}
                        />
                    </div>
                </DialogHeader>

                <DialogBody className="p-0 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-border min-h-0">
                    {/* ── Left: job metadata ── */}
                    <div className="md:w-[38%] lg:w-[36%] shrink-0 overflow-y-auto p-5 space-y-4">

                        <div className="space-y-1.5">
                            <Label required className="flex items-center gap-1.5"><Briefcase className="size-3.5 text-muted-foreground" />Job Title</Label>
                            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Job title" />
                        </div>

                        <div className="space-y-1.5">
                            <Label required className="flex items-center gap-1.5"><Users className="size-3.5 text-muted-foreground" />Department</Label>
                            <Combobox
                                value={departmentId}
                                onValueChange={(id) => {
                                    const opt = orgOptions.find(o => o.value === id)
                                    setDepartmentId(id)
                                    setDepartment(opt?.label ?? '')
                                }}
                                options={orgOptions}
                                placeholder="Select department…"
                                clearable
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="flex items-center gap-1.5"><MapPin className="size-3.5 text-muted-foreground" />Location</Label>
                            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location" />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>Employment Type</Label>
                                <Select value={type} onValueChange={setType}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {JOB_TYPE_OPTIONS.map((o: SelectOption) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Workplace Type</Label>
                                <Select value={workplaceType} onValueChange={setWorkplaceType}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {WORKPLACE_TYPE_OPTIONS.map((o: SelectOption) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>Openings</Label>
                                <NumericInput decimal={false} value={openings} onChange={(e) => setOpenings(Number(e.target.value))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="flex items-center gap-1.5"><CalendarDays className="size-3.5 text-muted-foreground" />Closing Date <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
                                <DatePicker value={closingDate} onChange={v => setClosingDate(v ?? '')} placeholder="Select closing date" />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="flex items-center gap-1.5"><DollarSign className="size-3.5 text-muted-foreground" />Salary Range (AED)</Label>
                            <div className="flex items-center gap-2">
                                <NumericInput value={minSalary} onChange={(e) => setMinSalary(Number(e.target.value))} placeholder="Min" className="flex-1" />
                                <span className="text-muted-foreground text-sm shrink-0">–</span>
                                <NumericInput value={maxSalary} onChange={(e) => setMaxSalary(Number(e.target.value))} placeholder="Max" className="flex-1" />
                            </div>
                        </div>
                    </div>

                    {/* ── Right: description + requirements + skills + qualifications ── */}
                    <div className="flex-1 overflow-y-auto p-5 space-y-4">
                        <div className="space-y-1.5">
                            <Label>Job Description</Label>
                            <RichTextEditor
                                value={description}
                                onChange={setDescription}
                                placeholder="Describe the role, responsibilities, and what success looks like…"
                                minHeight={200}
                            />
                        </div>

                        <ChipsField
                            label="Requirements"
                            optional
                            icon={<Tag className="size-3.5 text-muted-foreground" />}
                            chips={requirements}
                            onRemove={(v) => setRequirements(prev => prev.filter(x => x !== v))}
                            inputRef={reqInputRef}
                            inputValue={reqInput}
                            onInputChange={setReqInput}
                            onKeyDown={onReqKeyDown}
                            onAdd={addRequirement}
                            placeholder="Add a requirement · Press Enter"
                        />

                        <ChipsField
                            label="Skills"
                            optional
                            icon={<Tag className="size-3.5 text-muted-foreground" />}
                            chips={skills}
                            onRemove={(v) => setSkills(prev => prev.filter(x => x !== v))}
                            inputValue={skillInput}
                            onInputChange={setSkillInput}
                            onKeyDown={onSkillKeyDown}
                            onAdd={addSkill}
                            placeholder="Add a skill · Press Enter"
                            chipClassName="bg-sky-100 text-sky-700"
                        />

                        <ChipsField
                            label="Qualifications"
                            optional
                            icon={<Tag className="size-3.5 text-muted-foreground" />}
                            chips={qualifications}
                            onRemove={(v) => setQualifications(prev => prev.filter(x => x !== v))}
                            inputValue={qualInput}
                            onInputChange={setQualInput}
                            onKeyDown={onQualKeyDown}
                            onAdd={addQualification}
                            placeholder="Add a qualification · Press Enter"
                            chipClassName="bg-emerald-100 text-emerald-700"
                        />
                    </div>
                </DialogBody>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={submit} loading={createJob.isPending}>
                        {status === 'draft' ? 'Save Draft' : 'Post Job'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

/**
 * Reusable chip-input field. Used for Requirements / Skills / Qualifications
 * on the New/Edit Job dialogs and any future tag-style list inputs. Press
 * Enter to add; Backspace on empty input removes the last chip.
 */
// ChipsField lives in its own module so the public careers bundle can reuse it
// without importing the admin dialogs. Imported for local use here (the job
// dialogs render it) and re-exported for existing callers.
import { ChipsField } from './ChipsField'
export { ChipsField }

// ─── New Visa Application Dialog ────────────────────────────────────────────
export function NewVisaApplicationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
    const [employeeId, setEmployeeId] = useState('')
    const [visaType, setVisaType] = useState('employment_new')
    const [urgencyLevel, setUrgencyLevel] = useState('normal')
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
    const today = new Date().toISOString().split('T')[0]
    const createVisa = useCreateVisa()

    const [prevVisaOpen, setPrevVisaOpen] = useState(true)
    if (!open && prevVisaOpen) {
        setPrevVisaOpen(false)
        setEmployeeId(''); setVisaType('employment_new'); setUrgencyLevel('normal')
        setStartDate(new Date().toISOString().split('T')[0])
    } else if (open && !prevVisaOpen) {
        setPrevVisaOpen(true)
    }

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
                        <EmployeeSelect value={employeeId} onValueChange={setEmployeeId} />
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
    const createLeave = useCreateLeave()

    const [prevLeaveOpen, setPrevLeaveOpen] = useState(true)
    if (!open && prevLeaveOpen) {
        setPrevLeaveOpen(false)
        setEmployeeId(''); setLeaveType('annual'); setStartDate(''); setEndDate(''); setReason('')
    } else if (open && !prevLeaveOpen) {
        setPrevLeaveOpen(true)
    }

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
                        <EmployeeSelect value={employeeId} onValueChange={setEmployeeId} />
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

export interface EmpForm {
    // Step 1 - Personal
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
    // Step 2 - Employment
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
    gradeLevelId: string
    probationEndDate: string
    contractEndDate: string
    status: string
    teamId: string
    // Step 3 - Salary. Legacy fields are derived from componentAmounts at
    // submit time (basic/housing/transport mapped by catalog category,
    // everything else summed into otherAllowances) so the rest of the app —
    // WPS, gratuity, salary-revision history — keeps reading what it always
    // did. The new componentAmounts map is what payroll's catalog engine
    // actually consumes (writes employee_salary_components rows).
    basicSalary: string
    housingAllowance: string
    transportAllowance: string
    otherAllowances: string
    componentAmounts: Record<string, string>
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
    contractType: 'permanent', workLocation: '', managerName: '', reportingTo: '', gradeLevelId: '', probationEndDate: '', contractEndDate: '', status: 'onboarding', teamId: '',
    basicSalary: '', housingAllowance: '', transportAllowance: '', otherAllowances: '',
    componentAmounts: {},
    paymentMethod: 'bank_transfer', bankName: '', accountName: '', accountNumber: '', swiftCode: '', bankBranch: '', iban: '', emiratisationCategory: 'expat',
}

const STEP_INDICATOR_STEPS = ['Personal Info', 'Employment', 'Salary & Payroll']

function StepIndicator({ step }: { step: Step }) {
    const steps = STEP_INDICATOR_STEPS
    return (
        <div className="flex items-center gap-0 mb-5">
            {steps.map((label, i) => {
                const idx = (i + 1) as Step
                const isActive = step === idx
                const isDone = step > idx
                return (
                    <div key={label} className="flex items-center flex-1 last:flex-none">
                        <div className="flex flex-col items-center gap-1">
                            <div className={`size-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors
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

export interface AddEmployeeDialogProps {
    open: boolean
    onOpenChange: (o: boolean) => void
    /** Pre-fill the form (e.g. when converting a candidate). Applied on open. */
    initialValues?: Partial<EmpForm>
    /**
     * If provided, replaces the internal `useCreateEmployee` mutation. Receives
     * the full normalised payload that would otherwise be sent to create-employee.
     * Should throw to signal failure; the dialog will close on success.
     */
    onSubmit?: (payload: Record<string, unknown>) => Promise<{ id?: string } | void>
    /** Dialog title - defaults to "Add New Employee". */
    title?: string
    /** Submit-button label - defaults to "Add Employee". */
    submitLabel?: string
    /** External pending state when `onSubmit` is provided. */
    externalPending?: boolean
    /** Called after a successful save with the new employee id (if returned). */
    onSaved?: (employeeId?: string) => void
}

export function AddEmployeeDialog({
    open,
    onOpenChange,
    initialValues,
    onSubmit,
    title,
    submitLabel,
    externalPending,
    onSaved,
}: AddEmployeeDialogProps) {
    const [step, setStep] = useState<Step>(1)
    const [form, setForm] = useState<EmpForm>(() => ({ ...EMPTY_FORM, ...initialValues }))
    const [errors, setErrors] = useState<Record<string, string>>({})
    const createEmployee = useCreateEmployee()
    // Catalog of active earning components — drives Step 3's salary inputs.
    // If a tenant deactivates a component in Org Settings → Salary Components,
    // it disappears from this form too. Inactive components are still kept
    // in the catalog but excluded here.
    const { data: salaryEarningsResp } = useSalaryComponents('earning')
    const earningsCatalog = useMemo(
        () => (salaryEarningsResp ?? []).filter((c) => c.isActive).sort(byCatalogPriority),
        [salaryEarningsResp],
    )

    // State-during-render sync: re-seed the form when either `open` toggles or
    // `initialValues` changes content. JSON.stringify gives a stable fingerprint
    // so parents that build the seed inline each render don't cause thrash —
    // we only re-apply when the actual values differ.
    const seedKey = open ? JSON.stringify(initialValues ?? null) : null
    const [lastSeedKey, setLastSeedKey] = useState<string | null>(null)
    if (seedKey !== lastSeedKey) {
        setLastSeedKey(seedKey)
        if (open) {
            setForm({ ...EMPTY_FORM, ...initialValues })
            setStep(1)
            setErrors({})
        }
    }

    // Seed Step 3 inputs whenever the catalog is loaded and we don't already
    // have amounts in form state. Precedence (highest first):
    //   1. Explicit initialValues.componentAmounts from the caller
    //   2. Legacy initialValues fields (basicSalary, housingAllowance, …)
    //      mapped by catalog category — handles edit-of-old-employee
    //   3. Catalog defaults (component.amount in Org Settings → Salary Components)
    //      — handles the "I configured a default in the catalog, why didn't it
    //      pre-fill?" case
    const [catalogSeeded, setCatalogSeeded] = useState<string | null>(null)
    const catalogSeedKey = open && earningsCatalog.length > 0 ? `${seedKey}:${earningsCatalog.length}` : null
    if (catalogSeedKey && catalogSeedKey !== catalogSeeded) {
        setCatalogSeeded(catalogSeedKey)
        const hasComponentAmounts = Object.keys(form.componentAmounts).length > 0
        if (!hasComponentAmounts) {
            const hasLegacy = !!(initialValues?.basicSalary || initialValues?.housingAllowance || initialValues?.transportAllowance || initialValues?.otherAllowances)
            const next: Record<string, string> = {}
            if (hasLegacy) {
                // Edit/convert flow — map legacy fields to catalog by category.
                const firstByCategory = (cat: string) => earningsCatalog.find((c) => c.category === cat)
                const basic = firstByCategory('basic')
                const housing = firstByCategory('housing')
                const transport = firstByCategory('transport')
                const other = firstByCategory('custom_allowance') ?? firstByCategory('cost_of_living')
                if (basic && initialValues?.basicSalary) next[basic.id] = String(initialValues.basicSalary)
                if (housing && initialValues?.housingAllowance) next[housing.id] = String(initialValues.housingAllowance)
                if (transport && initialValues?.transportAllowance) next[transport.id] = String(initialValues.transportAllowance)
                if (other && initialValues?.otherAllowances) next[other.id] = String(initialValues.otherAllowances)
            } else {
                // Fresh Add — pre-populate from catalog defaults. Only include
                // components with a non-null default; an empty input is fine
                // for components where HR didn't set a tenant-wide amount.
                for (const c of earningsCatalog) {
                    if (c.amount != null && c.amount !== '') {
                        next[c.id] = String(c.amount)
                    }
                }
            }
            if (Object.keys(next).length > 0) {
                setForm((f) => ({ ...f, componentAmounts: next }))
            }
        }
    }

    useEffect(() => {
        if (open) return
        // Delayed reset on close so the closing animation doesn't see the form
        // flicker back to empty before unmount.
        const id = setTimeout(() => {
            setStep(1)
            setForm({ ...EMPTY_FORM })
            setErrors({})
        }, 300)
        return () => clearTimeout(id)
    }, [open])
    const navigate = useNavigate()
    const { data: orgUnitsRaw = [] } = useOrgUnits()
    const { data: designationList = [] } = useDesignations()
    const createDesignation = useCreateDesignation()
    const { data: gradeLevelList = [] } = useGradeLevels()
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

    const close = () => onOpenChange(false)

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
        if (!ok) toast.warning('Please review', Object.values(errs)[0] ?? 'Fix the highlighted fields.')
        return ok
    }

    const validateStep2 = () => {
        const { ok, errors: errs } = zodToFieldErrors(employeeStep2Schema, { joinDate: form.joinDate })
        setErrors(errs)
        if (!ok) toast.warning('Please review', Object.values(errs)[0] ?? 'Fix the highlighted fields.')
        return ok
    }

    const submit = async () => {
        const empNo = form.employeeNo || undefined
        // Derive the legacy columns from the catalog-driven componentAmounts.
        // The helper resolves percentage_of_basic components to AED using
        // the freshly-summed basic, so a "Housing = 25% of basic" entry
        // becomes the actual AED amount in the legacy housingAllowance
        // column — keeping WPS / gratuity / payslip code paths consistent
        // with what the resolver will compute server-side.
        const activeEarnings = (earningsCatalog ?? []).filter((c) => c.isActive)
        const { basic, housing, transport, other } = deriveLegacyTotalsFromCatalog(activeEarnings, form.componentAmounts)
        // Assignment payload for the salary_components table. The amount
        // stored here is the RAW user input (AED for flat components, the
        // percentage rate for percentage_of_basic) — the backend resolver
        // re-computes the AED at run time, so storing the raw value lets
        // basic-changes recalculate downstream components correctly.
        const salaryComponents = activeEarnings.reduce<Array<{ componentId: string; amount: number }>>((acc, c) => {
            const amount = parseFloat(form.componentAmounts[c.id] || '0') || 0
            if (amount > 0) acc.push({ componentId: c.id, amount })
            return acc
        }, [])
        try {
            // Auto-create designation if it's a new name not in the existing list
            if (form.designation) {
                const exists = (Array.isArray(designationList) ? designationList : [])
                    .some((d: { name: string; isActive: boolean }) => d.isActive && d.name.toLowerCase() === form.designation.toLowerCase())
                if (!exists) await createDesignation.mutateAsync({ name: form.designation })
            }
            const payload = {
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
                gradeLevelId: form.gradeLevelId || undefined,
                probationEndDate: form.probationEndDate || undefined,
                contractEndDate: form.contractEndDate || undefined,
                status: form.status as Employee['status'],
                basicSalary: basic || undefined,
                housingAllowance: housing || undefined,
                transportAllowance: transport || undefined,
                otherAllowances: other || undefined,
                totalSalary: basic + housing + transport + other || undefined,
                // Per-employee catalog assignments — backend writes these into
                // employee_salary_components. Optional: when omitted, the
                // legacy columns alone still drive payroll via the resolver's
                // fallback path.
                salaryComponents: salaryComponents.length > 0 ? salaryComponents : undefined,
                paymentMethod: (form.paymentMethod as Employee['paymentMethod']) || undefined,
                bankName: form.bankName || undefined,
                accountName: form.accountName || undefined,
                accountNumber: form.accountNumber || undefined,
                swiftCode: form.swiftCode || undefined,
                bankBranch: form.bankBranch || undefined,
                iban: form.iban || undefined,
                emiratisationCategory: (form.emiratisationCategory as Employee['emiratisationCategory']) || 'expat',
            } as const
            let newEmp: { id?: string } | void
            if (onSubmit) {
                newEmp = await onSubmit(payload as Record<string, unknown>)
            } else {
                newEmp = await createEmployee.mutateAsync(payload)
            }
            const newId = (newEmp as { id?: string } | undefined)?.id
            // Assign to team if selected (best-effort - doesn't fail the whole create)
            if (form.teamId && newId) {
                api.post(`/teams/${form.teamId}/members`, { employeeIds: [newId] }).catch(() => {})
            }
            if (!onSubmit) {
                toast.success('Employee added', `${form.firstName} ${form.lastName} has been onboarded.`)
            }
            onSaved?.(newId)
            close()
        } catch (err: unknown) {
            const e = err as Error & { message?: string; statusCode?: number }
            if (e?.statusCode === 402 || (e?.message ?? '').includes('Employee limit reached')) {
                toast.error('Employee limit reached', e?.message ?? 'Upgrade your plan to add more employees.')
                onOpenChange(false)
                navigate('/organization-settings', { state: { tab: 'subscription' } })
                return
            }
            if (e?.statusCode === 409 && (e?.message ?? '').includes('Employee ID')) {
                setErrors({ employeeNo: e.message ?? 'This employee ID is already in use' })
                setStep(2)
                return
            }
            // DB unique constraint - backend returns { field: 'camelCaseFieldName' }
            const dupField = e instanceof ApiError ? e.field : undefined
            if (dupField) {
                setErrors({ [dupField]: e.message ?? 'Already in use' })
                const step1Fields = ['firstName', 'lastName', 'dateOfBirth', 'gender', 'maritalStatus', 'nationality', 'passportNo', 'mobileNo', 'personalEmail']
                const step3Fields = ['basicSalary', 'housingAllowance', 'transportAllowance', 'otherAllowances', 'totalSalary', 'paymentMethod', 'bankName', 'iban']
                if (step1Fields.includes(dupField)) setStep(1)
                else if (step3Fields.includes(dupField)) setStep(3)
                else setStep(2)
                toast.error('Duplicate value', e?.message ?? 'Please use a different value.')
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
                    <DialogTitle>{title ?? 'Add New Employee'}</DialogTitle>
                </DialogHeader>
                <DialogBody>
                    <StepIndicator step={step} />

                    {step === 1 && (
                        <div className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <FormField label="First Name" required error={errors.firstName}>
                                    <Input value={form.firstName} onChange={set('firstName')} placeholder="First name" aria-invalid={!!errors.firstName} className={errors.firstName ? 'border-destructive' : ''} />
                                </FormField>
                                <FormField label="Last Name" required error={errors.lastName}>
                                    <Input value={form.lastName} onChange={set('lastName')} placeholder="Last name" aria-invalid={!!errors.lastName} className={errors.lastName ? 'border-destructive' : ''} />
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
                                    <Input value={form.passportNo} onChange={set('passportNo')} placeholder="Passport number" />
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
                                    <Input type="email" value={form.personalEmail} onChange={set('personalEmail')} placeholder="Email address" aria-invalid={!!errors.personalEmail} className={errors.personalEmail ? 'border-destructive' : ''} />
                                </FormField>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <FormField label="Emergency Contact Name">
                                    <Input value={form.emergencyContactName} onChange={set('emergencyContactName')} placeholder="Full name" />
                                </FormField>
                                <FormField label="Emergency Contact Phone">
                                    <PhoneInput value={form.emergencyContactPhone} onChange={(v) => setForm(f => ({ ...f, emergencyContactPhone: v }))} />
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
                                <FormField label="Employee No" error={errors.employeeNo}>
                                    <Input
                                        value={form.employeeNo ?? ''}
                                        onChange={set('employeeNo')}
                                        placeholder="Auto-generated on save"
                                        aria-invalid={!!errors.employeeNo}
                                        className={errors.employeeNo ? 'border-destructive' : ''}
                                    />
                                </FormField>
                                <FormField label="Join Date" required error={errors.joinDate}>
                                    <DatePicker value={form.joinDate} min="1970-01-01" onChange={setDate('joinDate')} aria-invalid={!!errors.joinDate} className={errors.joinDate ? 'border-destructive' : ''} />
                                </FormField>
                            </div>
                            <FormField label="Work Email" error={errors.workEmail} hint="Used for login invites and official communications">
                                <Input type="email" value={form.workEmail} onChange={set('workEmail')} placeholder="Email address" aria-invalid={!!errors.workEmail} className={errors.workEmail ? 'border-destructive' : ''} />
                            </FormField>
                            {/* Department picker - Branch and Division auto-assigned */}
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
                            {/* Reporting Manager - auto-fills from department head, can be overridden */}
                            <div className="space-y-1.5">
                                <Label>
                                    Reporting Manager
                                    <span className="text-muted-foreground font-normal text-xs ms-1">(auto from department head)</span>
                                </Label>
                                <ManagerPicker
                                    value={form.reportingTo}
                                    onChange={(id, name) => setForm(f => ({ ...f, reportingTo: id, managerName: name }))}
                                />
                                {form.managerName && form.departmentId && (
                                    <p className="text-[11px] text-muted-foreground">
                                        Auto-selected from <span className="font-medium">{orgUnits.find(u => u.id === form.departmentId)?.name}</span>'s head.
                                    </p>
                                )}
                            </div>
                            {/* Team - filtered to the selected department */}
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
                                        .reduce<Array<{ value: string; label: string }>>((acc, d: { id: string; name: string; isActive: boolean }) => {
                                            if (d.isActive) acc.push({ value: d.name, label: d.name })
                                            return acc
                                        }, [])}
                                    placeholder="Select or type designation…"
                                    searchPlaceholder="Search or create…"
                                    clearable
                                    creatable
                                />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label>Employment Type</Label>
                                    <Select value={form.contractType} onValueChange={v => setForm(f => ({ ...f, contractType: v, probationEndDate: '', contractEndDate: '' }))}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {CONTRACT_TYPE_OPTIONS.map((o: SelectOption) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Work Location</Label>
                                    <Input value={form.workLocation} onChange={set('workLocation')} placeholder="Work location" />
                                </div>
                            </div>
                            {form.contractType === 'probation' && (
                                <div className="space-y-1.5">
                                    <Label>Probation End Date</Label>
                                    <DatePicker value={form.probationEndDate} min={form.joinDate || undefined} onChange={v => setForm(f => ({ ...f, probationEndDate: v ?? '' }))} placeholder="Select date" />
                                </div>
                            )}
                            {form.contractType === 'contract' && (
                                <div className="space-y-1.5">
                                    <Label>Contract End Date</Label>
                                    <DatePicker value={form.contractEndDate} min={form.joinDate || undefined} onChange={v => setForm(f => ({ ...f, contractEndDate: v ?? '' }))} placeholder="Select date" />
                                </div>
                            )}
                            <div className="space-y-1.5">
                                <Label>Grade Level <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                                <Combobox
                                    value={form.gradeLevelId}
                                    onValueChange={v => setForm(f => ({ ...f, gradeLevelId: v }))}
                                    options={buildGradeLevelOptions(Array.isArray(gradeLevelList) ? gradeLevelList as GradeLevel[] : [])}
                                    placeholder="Select grade level…"
                                    searchPlaceholder="Search by code or name…"
                                    emptyMessage="No grade levels found. Add them in Org Settings → Grade Levels."
                                    clearable
                                />
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
                            {/* Catalog-driven salary structure.
                                Each row corresponds to one active earning component
                                defined in Org Settings → Salary Components. HR
                                edits the catalog there; this form just renders
                                inputs for whatever's active. */}
                            {earningsCatalog.length === 0 ? (
                                <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-center text-sm text-muted-foreground">
                                    No active earning components found.
                                    <br />
                                    <span className="text-xs">
                                        Add or activate components in Organization Settings → Salary Components, then refresh.
                                    </span>
                                </div>
                            ) : (() => {
                                // Compute the FLAT basic sum first — that's the
                                // multiplier base for every percentage row (matches
                                // the backend resolver). A basic-category percentage
                                // row does NOT contribute to this base; it just
                                // multiplies against it.
                                const basicNow = earningsCatalog
                                    .filter((c) => c.category === 'basic' && effectiveCalcType(c) !== 'percentage_of_basic')
                                    .reduce((s, c) => s + (parseFloat(form.componentAmounts[c.id] || '0') || 0), 0)
                                return (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {earningsCatalog.map((c) => {
                                        const isPct = effectiveCalcType(c) === 'percentage_of_basic'
                                        const rawValue = form.componentAmounts[c.id] ?? ''
                                        const aedValue = isPct ? resolveComponentAed(c, rawValue, basicNow) : 0
                                        const rawNum = parseFloat(rawValue || '0') || 0
                                        return (
                                            <div key={c.id} className="space-y-1.5">
                                                <Label className="flex items-center justify-between gap-2">
                                                    <span>
                                                        {c.name}{' '}
                                                        <span className="text-[10px] font-normal text-muted-foreground">
                                                            ({isPct ? '% of basic' : 'AED'})
                                                        </span>
                                                    </span>
                                                </Label>
                                                <NumericInput
                                                    value={rawValue}
                                                    onChange={(e) =>
                                                        setForm((f) => ({
                                                            ...f,
                                                            componentAmounts: {
                                                                ...f.componentAmounts,
                                                                [c.id]: e.target.value,
                                                            },
                                                        }))
                                                    }
                                                    placeholder={isPct ? '0' : '0.00'}
                                                />
                                                {isPct && (
                                                    <p className="text-[11px] text-muted-foreground tabular-nums">
                                                        {basicNow <= 0
                                                            ? 'Enter Basic first — the AED amount is derived from it.'
                                                            : rawNum > 0
                                                                ? `= AED ${aedValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${rawNum}% of basic)`
                                                                : `Enter a percentage (e.g. 10 = 10% of AED ${basicNow.toLocaleString()})`}
                                                    </p>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                                )
                            })()}
                            {(() => {
                                // Total package preview — resolves
                                // percentage_of_basic components to AED
                                // first, so a "Housing = 25% of basic"
                                // entry shows as the actual AED contribution
                                // rather than the raw "25".
                                const { total } = deriveLegacyTotalsFromCatalog(earningsCatalog, form.componentAmounts)
                                return total > 0 ? (
                                    <div className="flex justify-between items-center px-3 py-2 bg-muted rounded-lg text-sm">
                                        <span className="text-muted-foreground">Total Package</span>
                                        <span className="font-bold">AED {total.toLocaleString()}</span>
                                    </div>
                                ) : null
                            })()}
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
                                            <Input value={form.accountNumber} onChange={set('accountNumber')} placeholder="Account number" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <Label>Bank Name</Label>
                                            <Input value={form.bankName} onChange={set('bankName')} placeholder="Bank name" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label>Branch</Label>
                                            <Input value={form.bankBranch} onChange={set('bankBranch')} placeholder="Branch name" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <Label>IBAN Number</Label>
                                            <Input value={form.iban} onChange={set('iban')} placeholder="IBAN" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label>Swift Code</Label>
                                            <Input value={form.swiftCode} onChange={set('swiftCode')} placeholder="SWIFT code" />
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
                        <Button onClick={submit} loading={createEmployee.isPending || externalPending}>{submitLabel ?? 'Add Employee'}</Button>
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
        employeeNo: employee.employeeNo ?? '',
    })
    const [errors, setErrors] = useState<Record<string, string>>({})
    const updateEmployee = useUpdateEmployee(employee.id)
    const nextEmpNo = useNextEmployeeNo(open)

    const set = (field: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => {
        setForm(f => ({ ...f, [field]: e.target.value }))
        if (errors[field]) setErrors(prev => { const n = { ...prev }; delete n[field]; return n })
    }
    const setDate = (field: keyof typeof form) => (value: string) => {
        setForm(f => ({ ...f, [field]: value }))
        if (errors[field]) setErrors(prev => { const n = { ...prev }; delete n[field]; return n })
    }

    const close = () => { onOpenChange(false); setErrors({}) }

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
            toast.warning('Please review', Object.values(result.errors)[0] ?? 'Fix the highlighted fields.')
            return
        }
        const resolvedEmpNo = form.employeeNo.trim() || nextEmpNo.data?.data?.employeeNo || undefined
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
                employeeNo: resolvedEmpNo,
            },
            {
                onSuccess: () => { toast.success('Profile updated', `${form.firstName} ${form.lastName} has been updated.`); close() },
                onError: (err: Error & { message?: string; statusCode?: number }) => {
                    if ((err as any)?.statusCode === 409 || (err?.message ?? '').includes('Employee ID')) {
                        setErrors({ employeeNo: err.message ?? 'This employee ID is already in use' })
                        return
                    }
                    const dupField = err instanceof ApiError ? err.field : undefined
                    if (dupField) {
                        setErrors({ [dupField]: err.message ?? 'Already in use' })
                        toast.error('Duplicate value', err?.message ?? 'Please use a different value.')
                        return
                    }
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
                    <DialogTitle>Edit Profile - {employee.fullName}</DialogTitle>
                </DialogHeader>
                <DialogBody>
                    <div className="space-y-3">
                        <FormField label="Employee No" error={errors.employeeNo}>
                            <div className="flex gap-2">
                                <Input
                                    value={form.employeeNo}
                                    onChange={set('employeeNo')}
                                    placeholder={nextEmpNo.data?.data?.employeeNo ?? 'Auto-generated'}
                                    aria-invalid={!!errors.employeeNo}
                                    className={errors.employeeNo ? 'border-destructive flex-1' : 'flex-1'}
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setForm(f => ({ ...f, employeeNo: nextEmpNo.data?.data?.employeeNo ?? '' }))}
                                    disabled={!nextEmpNo.data?.data?.employeeNo}
                                    title="Auto-generate employee number"
                                >
                                    Auto
                                </Button>
                            </div>
                        </FormField>
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
                            <div className="space-y-1.5"><Label>Emergency Contact Phone</Label><PhoneInput value={form.emergencyContactPhone} onChange={(v) => setForm(f => ({ ...f, emergencyContactPhone: v }))} /></div>
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
        shiftId: employee.shiftId ?? '',
        gradeLevelId: employee.gradeLevelId ?? '',
        probationEndDate: employee.probationEndDate ? String(employee.probationEndDate).slice(0, 10) : '',
        contractEndDate: employee.contractEndDate ? String(employee.contractEndDate).slice(0, 10) : '',
        status: employee.status ?? 'active',
    })
    const { data: shiftList = [] } = useShifts()
    const shifts = Array.isArray(shiftList) ? shiftList as Shift[] : []
    const [errors, setErrors] = useState<Record<string, string>>({})
    const updateEmployee = useUpdateEmployee(employee.id)
    const { data: orgUnitsRaw = [] } = useOrgUnits()
    const { data: designationList = [] } = useDesignations()
    const createDesignation = useCreateDesignation()
    const { data: gradeLevelList = [] } = useGradeLevels()
    const orgUnits = Array.isArray(orgUnitsRaw) ? orgUnitsRaw as OrgUnit[] : []
    const orgOptions = buildOrgOptions(orgUnits)

    const set = (field: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => {
        setForm(f => ({ ...f, [field]: e.target.value }))
        if (errors[field]) setErrors(prev => { const n = { ...prev }; delete n[field]; return n })
    }

    const close = () => { onOpenChange(false); setErrors({}) }

    const submit = async () => {
        const result = zodToFieldErrors(employeeStep2Schema, { joinDate: form.joinDate })
        if (Object.keys(result.errors).length) {
            setErrors(result.errors)
            toast.warning('Please review', Object.values(result.errors)[0] ?? 'Fix the highlighted fields.')
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
                shiftId: form.shiftId || null,
                gradeLevelId: form.gradeLevelId || undefined,
                probationEndDate: form.contractType === 'probation' ? (form.probationEndDate || undefined) : undefined,
                contractEndDate: form.contractType === 'contract' ? (form.contractEndDate || undefined) : undefined,
                status: form.status as Employee['status'],
            },
            {
                onSuccess: () => {
                    toast.success('Employment updated', 'Employment details have been saved.')
                    close()
                },
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
                    <DialogTitle>Edit Employment - {employee.fullName}</DialogTitle>
                </DialogHeader>
                <DialogBody>
                    <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <FormField label="Join Date" required error={errors.joinDate}>
                                <DatePicker value={form.joinDate} min="1970-01-01" onChange={v => { setForm(f => ({ ...f, joinDate: v ?? '' })); if (errors.joinDate) setErrors(p => { const n = { ...p }; delete n.joinDate; return n }) }} aria-invalid={!!errors.joinDate} className={errors.joinDate ? 'border-destructive' : ''} />
                            </FormField>
                            <FormField label="Work Email" error={errors.workEmail} hint="Used for login and communications">
                                <Input type="email" value={form.workEmail} onChange={set('workEmail')} placeholder="Email address" aria-invalid={!!errors.workEmail} className={errors.workEmail ? 'border-destructive' : ''} />
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
                                    .reduce<Array<{ value: string; label: string }>>((acc, d: { id: string; name: string; isActive: boolean }) => {
                                        if (d.isActive) acc.push({ value: d.name, label: d.name })
                                        return acc
                                    }, [])}
                                placeholder="Select or type designation…"
                                searchPlaceholder="Search or create…"
                                clearable
                                creatable
                            />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>Employment Type</Label>
                                <Select value={form.contractType} onValueChange={v => setForm(f => ({ ...f, contractType: v as NonNullable<Employee['contractType']>, probationEndDate: '', contractEndDate: '' }))}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {CONTRACT_TYPE_OPTIONS.map((o: SelectOption) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5"><Label>Work Location</Label><Input value={form.workLocation} onChange={set('workLocation')} /></div>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Shift <span className="text-muted-foreground font-normal text-xs">(leave empty to use tenant default)</span></Label>
                            <Combobox
                                value={form.shiftId}
                                onValueChange={v => setForm(f => ({ ...f, shiftId: v }))}
                                options={shifts.reduce<Array<{ value: string; label: string }>>((acc, s) => {
                                    if (s.isActive || s.id === form.shiftId) acc.push({ value: s.id, label: `${s.name} (${s.startTime}–${s.endTime})` })
                                    return acc
                                }, [])}
                                placeholder="Select shift…"
                                searchPlaceholder="Search shifts…"
                                emptyMessage="No shifts found. Add them in Org Settings → Shifts."
                                clearable
                            />
                        </div>
                        {form.contractType === 'probation' && (
                            <div className="space-y-1.5">
                                <Label>Probation End Date</Label>
                                <DatePicker value={form.probationEndDate} min={form.joinDate || undefined} onChange={v => setForm(f => ({ ...f, probationEndDate: v ?? '' }))} placeholder="Select date" />
                            </div>
                        )}
                        {form.contractType === 'contract' && (
                            <div className="space-y-1.5">
                                <Label>Contract End Date</Label>
                                <DatePicker value={form.contractEndDate} min={form.joinDate || undefined} onChange={v => setForm(f => ({ ...f, contractEndDate: v ?? '' }))} placeholder="Select date" />
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <Label>Reporting Manager</Label>
                            <ManagerPicker value={form.reportingTo} excludeId={employee.id} onChange={(id, name) => setForm(f => ({ ...f, reportingTo: id, managerName: name }))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Grade Level <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                            <Combobox
                                value={form.gradeLevelId}
                                onValueChange={v => setForm(f => ({ ...f, gradeLevelId: v }))}
                                options={buildGradeLevelOptions(Array.isArray(gradeLevelList) ? gradeLevelList as GradeLevel[] : [])}
                                placeholder="Select grade level…"
                                searchPlaceholder="Search by code or name…"
                                emptyMessage="No grade levels found. Add them in Org Settings → Grade Levels."
                                clearable
                            />
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
        paymentMethod: employee.paymentMethod ?? 'bank_transfer',
        bankName: employee.bankName ?? '',
        accountName: employee.accountName ?? '',
        accountNumber: employee.accountNumber ?? '',
        swiftCode: employee.swiftCode ?? '',
        bankBranch: employee.bankBranch ?? '',
        iban: employee.iban ?? '',
        emiratisationCategory: employee.emiratisationCategory ?? 'expat',
    })
    const [componentAmounts, setComponentAmounts] = useState<Record<string, string>>({})
    const [errors, setErrors] = useState<Record<string, string>>({})
    const updateEmployee = useUpdateEmployee(employee.id)

    // Catalog of active earning components — drives the salary inputs.
    const { data: salaryEarningsResp } = useSalaryComponents('earning')
    const earningsCatalog = useMemo(
        () => (salaryEarningsResp ?? []).filter((c) => c.isActive).sort(byCatalogPriority),
        [salaryEarningsResp],
    )
    // Existing per-employee assignments — pre-fills the inputs on edit so HR
    // sees the amounts already on file rather than starting blank.
    const { data: assignments } = useEmployeeSalaryComponents(employee.id)

    // Three-tier seed precedence so the form ALWAYS opens with sensible
    // values to edit, never blank for no good reason:
    //
    //   1. Saved per-employee assignment   (the truth — wins over everything)
    //   2. Legacy basicSalary / housingAllowance / … columns by category
    //      (covers pre-catalog employees that have no assignments yet)
    //   3. Catalog default (component.amount in Org Settings → Salary
    //      Components) — applied LAST so a brand-new earning component HR
    //      added today shows its default for everyone, even existing
    //      employees who don't have an assignment row yet.
    //
    // We re-seed when (a) the dialog opens, (b) the catalog finishes
    // loading, OR (c) the assignments query resolves — seedKey hashes
    // both so any transition triggers exactly one re-seed.
    const seedKey = open && earningsCatalog.length > 0
        ? `${earningsCatalog.length}:${assignments?.length ?? 0}`
        : null
    const [lastSeed, setLastSeed] = useState<string | null>(null)
    if (seedKey && seedKey !== lastSeed) {
        setLastSeed(seedKey)
        const next: Record<string, string> = {}
        // 1) assignments win
        for (const a of assignments ?? []) {
            if (a.amount != null) next[a.componentId] = String(a.amount)
        }
        // 2) legacy columns when no assignment yet exists for the category
        const firstByCategory = (cat: string) => earningsCatalog.find((c) => c.category === cat)
        const fillLegacy = (cat: string | string[], legacyVal: number | string | null | undefined) => {
            if (legacyVal == null || legacyVal === '') return
            const cats = Array.isArray(cat) ? cat : [cat]
            for (const k of cats) {
                const c = firstByCategory(k)
                if (c && next[c.id] == null) { next[c.id] = String(legacyVal); return }
            }
        }
        fillLegacy('basic', employee.basicSalary)
        fillLegacy('housing', employee.housingAllowance)
        fillLegacy('transport', employee.transportAllowance)
        fillLegacy(['custom_allowance', 'cost_of_living'], employee.otherAllowances)
        // 3) catalog defaults for components that still have no value
        for (const c of earningsCatalog) {
            if (next[c.id] == null && c.amount != null && c.amount !== '') {
                next[c.id] = String(c.amount)
            }
        }
        setComponentAmounts(next)
    }

    const set = (field: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => {
        setForm(f => ({ ...f, [field]: e.target.value }))
        if (errors[field]) setErrors(prev => { const n = { ...prev }; delete n[field]; return n })
    }

    const close = () => { onOpenChange(false); setErrors({}); setLastSeed(null) }

    const submit = () => {
        // Resolve percentage_of_basic components to AED before computing
        // the legacy columns — otherwise housingAllowance would store the
        // raw percentage (e.g. 25) instead of the AED value (25% × basic).
        const { basic, housing, transport, other, total } = deriveLegacyTotalsFromCatalog(earningsCatalog, componentAmounts)
        // Per-component assignments store the RAW user input (the resolver
        // re-applies the percentage at run time using the freshly-resolved
        // basic, so basic changes cascade automatically).
        const salaryComponents = earningsCatalog.reduce<Array<{ componentId: string; amount: number }>>((acc, c) => {
            const amount = parseFloat(componentAmounts[c.id] || '0') || 0
            if (amount > 0) acc.push({ componentId: c.id, amount })
            return acc
        }, [])
        const result = zodToFieldErrors(employeeSalaryRuleSchema, { basicSalary: basic, totalSalary: total })
        if (Object.keys(result.errors).length) {
            setErrors(result.errors)
            toast.warning('Please review', Object.values(result.errors)[0] ?? 'Fix the highlighted fields.')
            return
        }
        updateEmployee.mutate(
            {
                basicSalary: basic || undefined,
                housingAllowance: housing || undefined,
                transportAllowance: transport || undefined,
                otherAllowances: other || undefined,
                totalSalary: total || undefined,
                salaryComponents: salaryComponents.length > 0 ? salaryComponents : undefined,
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

    // Total Package preview resolves percentage_of_basic to AED so the
    // header reads "what the employee will be paid", not the sum of raw
    // inputs (which would treat a percentage as if it were AED).
    const { total: totalPackage } = deriveLegacyTotalsFromCatalog(earningsCatalog, componentAmounts)

    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogContent size="lg">
                <DialogHeader>
                    <DialogTitle>Edit Payroll - {employee.fullName}</DialogTitle>
                </DialogHeader>
                <DialogBody>
                    <div className="space-y-3">
                        {earningsCatalog.length === 0 ? (
                            <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-center text-sm text-muted-foreground">
                                No active earning components found.
                                <br />
                                <span className="text-xs">
                                    Add or activate components in Organization Settings → Salary Components, then refresh.
                                </span>
                            </div>
                        ) : (() => {
                            // Resolve the FLAT basic sum — this is the multiplier
                            // base for percentage rows (matches the backend
                            // resolver). Basic-category percentage rows do NOT
                            // contribute here; they multiply against this base
                            // and roll back into the basic line.
                            const basicNow = earningsCatalog
                                .filter((c) => c.category === 'basic' && effectiveCalcType(c) !== 'percentage_of_basic')
                                .reduce((s, c) => s + (parseFloat(componentAmounts[c.id] || '0') || 0), 0)
                            return (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {earningsCatalog.map((c) => {
                                    const isBasic = c.category === 'basic'
                                    const isPct = effectiveCalcType(c) === 'percentage_of_basic'
                                    const fieldError = isBasic ? errors.basicSalary : undefined
                                    const rawValue = componentAmounts[c.id] ?? ''
                                    const rawNum = parseFloat(rawValue || '0') || 0
                                    const aedValue = isPct ? resolveComponentAed(c, rawValue, basicNow) : 0
                                    const input = (
                                        <NumericInput
                                            value={rawValue}
                                            onChange={(e) =>
                                                setComponentAmounts((prev) => ({ ...prev, [c.id]: e.target.value }))
                                            }
                                            placeholder={isPct ? '0' : '0.00'}
                                            aria-invalid={!!fieldError}
                                            className={fieldError ? 'border-destructive' : ''}
                                        />
                                    )
                                    const label = (
                                        <>
                                            {c.name}{' '}
                                            <span className="text-[10px] font-normal text-muted-foreground">
                                                ({isPct ? '% of basic' : 'AED'})
                                            </span>
                                        </>
                                    )
                                    // Always render the AED hint for % components — even when
                                    // the user hasn't typed yet, so they understand the field
                                    // is a percentage and can see the conversion update live
                                    // as they type into Basic.
                                    const aedHint = isPct && (
                                        <p className="text-[11px] text-muted-foreground tabular-nums">
                                            {basicNow <= 0
                                                ? 'Enter Basic first — the AED amount is derived from it.'
                                                : rawNum > 0
                                                    ? `= AED ${aedValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${rawNum}% of basic)`
                                                    : `Enter a percentage (e.g. 10 = 10% of AED ${basicNow.toLocaleString()})`}
                                        </p>
                                    )
                                    // Render the AED hint for EVERY percentage row, including
                                    // basic-category percentage components — the FormField
                                    // branch (used for the basic field's validation error
                                    // surface) wraps the input + the hint together so HR
                                    // sees the live conversion no matter which path renders.
                                    return isBasic ? (
                                        <FormField key={c.id} label={label} error={fieldError}>
                                            {input}
                                            {aedHint}
                                        </FormField>
                                    ) : (
                                        <div key={c.id} className="space-y-1.5">
                                            <Label>{label}</Label>
                                            {input}
                                            {aedHint}
                                        </div>
                                    )
                                })}
                            </div>
                            )
                        })()}
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
                                    <div className="space-y-1.5"><Label>Account Number</Label><Input value={form.accountNumber} onChange={set('accountNumber')} placeholder="Account number" /></div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1.5"><Label>Bank Name</Label><Input value={form.bankName} onChange={set('bankName')} placeholder="Bank name" /></div>
                                    <div className="space-y-1.5"><Label>Bank Branch</Label><Input value={form.bankBranch} onChange={set('bankBranch')} placeholder="Branch name" /></div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1.5"><Label>IBAN Number</Label><Input value={form.iban} onChange={set('iban')} placeholder="IBAN" /></div>
                                    <div className="space-y-1.5"><Label>Swift Code</Label><Input value={form.swiftCode} onChange={set('swiftCode')} placeholder="SWIFT code" /></div>
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
    job: { id: string; title?: string; department?: string; location?: string | null; type?: string; workplaceType?: string; openings?: number; minSalary?: number | string | null; maxSalary?: number | string | null; description?: string | null; status?: string; closingDate?: string | null; requirements?: string[]; skills?: string[]; qualifications?: string[] }
}) {
    const [title, setTitle] = useState(job.title ?? '')
    const [department, setDepartment] = useState(job.department ?? '')
    const [departmentId, setDepartmentId] = useState('')
    const [location, setLocation] = useState(job.location ?? '')
    const [type, setType] = useState(job.type ?? 'full_time')
    const [workplaceType, setWorkplaceType] = useState(job.workplaceType ?? 'on_site')
    const [openings, setOpenings] = useState(job.openings ?? 1)
    const [minSalary, setMinSalary] = useState(Number(job.minSalary ?? 0))
    const [maxSalary, setMaxSalary] = useState(Number(job.maxSalary ?? 0))
    const [description, setDescription] = useState(job.description ?? '')
    const [status, setStatus] = useState(job.status ?? 'open')
    const [closingDate, setClosingDate] = useState(job.closingDate ?? '')
    const [requirements, setRequirements] = useState<string[]>(job.requirements ?? [])
    const [reqInput, setReqInput] = useState('')
    const [skills, setSkills] = useState<string[]>(job.skills ?? [])
    const [skillInput, setSkillInput] = useState('')
    const [qualifications, setQualifications] = useState<string[]>(job.qualifications ?? [])
    const [qualInput, setQualInput] = useState('')
    const editReqInputRef = useRef<HTMLInputElement>(null)
    const updateJob = useUpdateJob()
    const { data: orgUnitsRawEdit = [] } = useOrgUnits()
    const orgUnitsEdit = Array.isArray(orgUnitsRawEdit) ? orgUnitsRawEdit as OrgUnit[] : []
    const orgOptionsEdit = buildOrgOptions(orgUnitsEdit)

    const [prevEditJobOpen, setPrevEditJobOpen] = useState(false)
    if (open && !prevEditJobOpen) {
        setPrevEditJobOpen(true)
        setTitle(job.title ?? ''); setLocation(job.location ?? '')
        setType(job.type ?? 'full_time'); setWorkplaceType(job.workplaceType ?? 'on_site')
        setOpenings(job.openings ?? 1)
        setMinSalary(Number(job.minSalary ?? 0)); setMaxSalary(Number(job.maxSalary ?? 0))
        setDescription(job.description ?? ''); setStatus(job.status ?? 'open')
        setClosingDate(job.closingDate ?? ''); setRequirements(job.requirements ?? [])
        setSkills(job.skills ?? []); setSkillInput('')
        setQualifications(job.qualifications ?? []); setQualInput('')
        const match = orgOptionsEdit.find(o => o.label === job.department)
        setDepartmentId(match?.value ?? '')
        setDepartment(job.department ?? '')
    } else if (!open && prevEditJobOpen) {
        setPrevEditJobOpen(false)
    }

    const addEditRequirement = useCallback(() => {
        const val = reqInput.trim()
        if (val && !requirements.includes(val)) setRequirements(r => [...r, val])
        setReqInput('')
    }, [reqInput, requirements])

    const onEditReqKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') { e.preventDefault(); addEditRequirement() }
        if (e.key === 'Backspace' && !reqInput && requirements.length > 0)
            setRequirements(r => r.slice(0, -1))
    }, [addEditRequirement, reqInput, requirements.length])

    const addSkillEdit = useCallback(() => {
        const val = skillInput.trim()
        if (val && !skills.includes(val)) setSkills(s => [...s, val])
        setSkillInput('')
    }, [skillInput, skills])

    const onSkillKeyDownEdit = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') { e.preventDefault(); addSkillEdit() }
        if (e.key === 'Backspace' && !skillInput && skills.length > 0) setSkills(s => s.slice(0, -1))
    }, [addSkillEdit, skillInput, skills.length])

    const addQualEdit = useCallback(() => {
        const val = qualInput.trim()
        if (val && !qualifications.includes(val)) setQualifications(q => [...q, val])
        setQualInput('')
    }, [qualInput, qualifications])

    const onQualKeyDownEdit = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') { e.preventDefault(); addQualEdit() }
        if (e.key === 'Backspace' && !qualInput && qualifications.length > 0) setQualifications(q => q.slice(0, -1))
    }, [addQualEdit, qualInput, qualifications.length])

    const submit = () => {
        const { ok, errors } = zodToFieldErrors(jobPostSchema, { title, department })
        if (!ok) {
            toast.warning('Missing fields', Object.values(errors)[0] ?? 'Please fill required fields.')
            return
        }
        updateJob.mutate(
            { id: job.id, data: { title, department, location: location || null, type, workplaceType, openings, minSalary, maxSalary, description: description || null, status, closingDate: closingDate || null, requirements, skills, qualifications } },
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
            {/* `full` = max-w-6xl (~1152px). Matches NewJobDialog so the layout
                feels identical when editing vs creating. */}
            {/* Custom width — `full` (max-w-6xl, 1152px) + override to max-w-7xl
                (1280px) so the metadata column + rich-text editor + chip lists
                all sit comfortably without feeling cramped. Full-screen would
                lose the "edit in context" feel — wider is better here. */}
            <DialogContent size="full" className="lg:max-w-7xl">
                <DialogHeader>
                    <div className="flex items-center justify-between">
                        <DialogTitle>Edit Job</DialogTitle>
                        <StatusPills
                            value={status}
                            onChange={setStatus}
                            options={JOB_STATUS_OPTIONS}
                        />
                    </div>
                </DialogHeader>

                <DialogBody className="p-0 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-border min-h-0">
                    {/* ── Left: job metadata ── */}
                    <div className="md:w-[38%] lg:w-[36%] shrink-0 overflow-y-auto p-5 space-y-4">

                        <div className="space-y-1.5">
                            <Label required className="flex items-center gap-1.5"><Briefcase className="size-3.5 text-muted-foreground" />Job Title</Label>
                            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                        </div>

                        <div className="space-y-1.5">
                            <Label required className="flex items-center gap-1.5"><Users className="size-3.5 text-muted-foreground" />Department</Label>
                            <Combobox
                                value={departmentId}
                                onValueChange={(id) => {
                                    const opt = orgOptionsEdit.find(o => o.value === id)
                                    setDepartmentId(id)
                                    setDepartment(opt?.label ?? '')
                                }}
                                options={orgOptionsEdit}
                                placeholder="Select department…"
                                clearable
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="flex items-center gap-1.5"><MapPin className="size-3.5 text-muted-foreground" />Location</Label>
                            <Input value={location ?? ''} onChange={(e) => setLocation(e.target.value)} />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>Employment Type</Label>
                                <Select value={type} onValueChange={setType}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {JOB_TYPE_OPTIONS.map((o: SelectOption) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Workplace Type</Label>
                                <Select value={workplaceType} onValueChange={setWorkplaceType}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {WORKPLACE_TYPE_OPTIONS.map((o: SelectOption) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>Openings</Label>
                                <NumericInput decimal={false} value={openings} onChange={(e) => setOpenings(Number(e.target.value))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="flex items-center gap-1.5"><CalendarDays className="size-3.5 text-muted-foreground" />Closing Date <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
                                <DatePicker value={closingDate} onChange={v => setClosingDate(v ?? '')} placeholder="Select closing date" />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="flex items-center gap-1.5"><DollarSign className="size-3.5 text-muted-foreground" />Salary Range (AED)</Label>
                            <div className="flex items-center gap-2">
                                <NumericInput value={minSalary} onChange={(e) => setMinSalary(Number(e.target.value))} placeholder="Min" className="flex-1" />
                                <span className="text-muted-foreground text-sm shrink-0">–</span>
                                <NumericInput value={maxSalary} onChange={(e) => setMaxSalary(Number(e.target.value))} placeholder="Max" className="flex-1" />
                            </div>
                        </div>
                    </div>

                    {/* ── Right: description + requirements + skills + qualifications ── */}
                    <div className="flex-1 overflow-y-auto p-5 space-y-4">
                        <div className="space-y-1.5">
                            <Label>Job Description</Label>
                            <RichTextEditor
                                value={description ?? ''}
                                onChange={setDescription}
                                placeholder="Describe the role, responsibilities, and what success looks like…"
                                minHeight={200}
                            />
                        </div>

                        <ChipsField
                            label="Requirements"
                            optional
                            icon={<Tag className="size-3.5 text-muted-foreground" />}
                            chips={requirements}
                            onRemove={(v) => setRequirements(prev => prev.filter(x => x !== v))}
                            inputRef={editReqInputRef}
                            inputValue={reqInput}
                            onInputChange={setReqInput}
                            onKeyDown={onEditReqKeyDown}
                            onAdd={addEditRequirement}
                            placeholder="Add a requirement · Press Enter"
                        />

                        <ChipsField
                            label="Skills"
                            optional
                            icon={<Tag className="size-3.5 text-muted-foreground" />}
                            chips={skills}
                            onRemove={(v) => setSkills(prev => prev.filter(x => x !== v))}
                            inputValue={skillInput}
                            onInputChange={setSkillInput}
                            onKeyDown={onSkillKeyDownEdit}
                            onAdd={addSkillEdit}
                            placeholder="Add a skill · Press Enter"
                            chipClassName="bg-sky-100 text-sky-700"
                        />

                        <ChipsField
                            label="Qualifications"
                            optional
                            icon={<Tag className="size-3.5 text-muted-foreground" />}
                            chips={qualifications}
                            onRemove={(v) => setQualifications(prev => prev.filter(x => x !== v))}
                            inputValue={qualInput}
                            onInputChange={setQualInput}
                            onKeyDown={onQualKeyDownEdit}
                            onAdd={addQualEdit}
                            placeholder="Add a qualification · Press Enter"
                            chipClassName="bg-emerald-100 text-emerald-700"
                        />
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

    const [prevEditDocOpen, setPrevEditDocOpen] = useState(false)
    if (open && !prevEditDocOpen) {
        setPrevEditDocOpen(true)
        setFileName(doc.fileName ?? ''); setCategory(doc.category ?? '')
        setDocType(doc.docType ?? ''); setExpiryDate(doc.expiryDate ? String(doc.expiryDate).slice(0, 10) : '')
    } else if (!open && prevEditDocOpen) {
        setPrevEditDocOpen(false)
    }

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
                            <Input value={docType} onChange={(e) => setDocType(e.target.value)} placeholder="Document type" />
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

const CONDITION_LABEL: Record<string, string> = { new: 'New', good: 'Good', damaged: 'Damaged' }

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
    const availableAssets: Asset[] = useMemo(() => (assetsResult?.data ?? []) as Asset[], [assetsResult?.data])
    const assignAsset = useAssignAsset()

    const [assetId, setAssetId] = useState('')
    const [assignedDate, setAssignedDate] = useState(() => new Date().toISOString().slice(0, 10))
    const [expectedReturnDate, setExpectedReturnDate] = useState('')
    const [notes, setNotes] = useState('')
    const [assetError, setAssetError] = useState('')

    const [prevAssignOpen, setPrevAssignOpen] = useState(true)
    if (!open && prevAssignOpen) {
        setPrevAssignOpen(false)
        setAssetId('')
        setAssignedDate(new Date().toISOString().slice(0, 10))
        setExpectedReturnDate('')
        setNotes('')
        setAssetError('')
    } else if (open && !prevAssignOpen) {
        setPrevAssignOpen(true)
    }

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

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size="sm">
                <DialogHeader>
                    <DialogTitle>Assign Asset - {employee.firstName} {employee.lastName}</DialogTitle>
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

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
