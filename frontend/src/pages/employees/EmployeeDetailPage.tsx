import React from 'react'
import { useTranslation } from 'react-i18next'
import { labelFor, VISA_TYPE_LABELS } from '@/lib/enums'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, User, Briefcase, Plane, FileText, CreditCard, Star,
  Phone, Mail, MapPin, Calendar, Building2, Hash, Shield, Edit2,
  Clock, Download, Eye, Camera, Loader2, Plus, Package,
  CalendarDays, ClipboardList, UserCheck, Users, GraduationCap, Landmark,
  ArrowRightLeft, Heart, StickyNote, History, Trash2, AlertTriangle, Upload, X as XIcon,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { NumericInput } from '@/components/ui/numeric-input'
import { DatePicker } from '@/components/ui/date-picker'
import { cn, formatDate, formatCurrency, getInitials } from '@/lib/utils'
import { useEmployee, useUpdateEmployee, useUploadEmployeeAvatar, useEmployeeAccount, useSalaryHistory, useRecordSalaryRevision } from '@/hooks/useEmployees'
import { useOrgUnits } from '@/hooks/useOrgUnits'
import { useEmployeeTeams } from '@/hooks/useTeams'
import { useDocuments } from '@/hooks/useDocuments'
import { usePerformanceReviews } from '@/hooks/usePerformance'
import { CreatePerformanceReviewDialog } from '@/components/shared/CreatePerformanceReviewDialog'
import { AddDocumentDialog } from '@/components/shared/AddDocumentDialog'
import { EmployeeLeavePanel } from '@/components/shared/EmployeeLeavePanel'
import { useEmployeeAssets } from '@/hooks/useAssets'
import { useAttendance } from '@/hooks/useAttendance'
import { useEmployeeTransfers, useCreateTransfer } from '@/hooks/useTransfers'
import { useDependents, useCreateDependent, useUpdateDependent, useDeleteDependent, useEmployeeNotes, useAddEmployeeNote, useDeleteEmployeeNote, type Dependent } from '@/hooks/useEmployeeDependents'
import { useActivityLogs, type ActivityLog } from '@/hooks/useAudit'
import { useEmployeeWarnings, useCreateEmployeeWarning, useDeleteEmployeeWarning, useWarningDocumentUrl, type CreateWarningInput } from '@/hooks/useEmployeeWarnings'
import { useSponsoringEntities, useCreateSponsoringEntity, type SponsoringEntity } from '@/hooks/useSponsoringEntities'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { EditEmployeeDialog, EditEmploymentDialog, EditPayrollDialog, AssignAssetToEmployeeDialog } from '@/components/shared/action-dialogs'
import { InviteEmployeeDialog } from '@/components/shared/InviteEmployeeDialog'
import { DocumentViewerDialog } from '@/components/shared/DocumentViewerDialog'
import { toast } from '@/components/ui/overlays'
import { api } from '@/lib/api'
import { usePermissions } from '@/hooks/usePermissions'
import { CopyableEmail, CopyablePhone } from '@/components/shared'
import type { Employee } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DocRecord {
  id: string
  fileName?: string
  docType?: string
  category: string
  status: string
  createdAt: string
}

interface AttendanceRecord {
  id: string
  date: string
  status: string
  checkIn?: string
  checkOut?: string
  hoursWorked?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'info' | 'destructive' | 'secondary'> = {
  active: 'success', onboarding: 'info',
  suspended: 'destructive', terminated: 'secondary', visa_expired: 'destructive',
}

const ATTENDANCE_STATUS_VARIANT: Record<string, 'success' | 'destructive' | 'warning' | 'info' | 'secondary'> = {
  present: 'success', absent: 'destructive', late: 'warning',
  half_day: 'info', wfh: 'secondary', on_leave: 'secondary',
}

const REVISION_TYPE_LABELS: Record<string, string> = {
  increment: 'Increment',
  decrement: 'Decrement',
  promotion: 'Promotion',
  annual_review: 'Annual Review',
  probation_completion: 'Probation Completion',
  correction: 'Correction',
}

const REVISION_TYPE_VARIANT: Record<string, 'success' | 'destructive' | 'info' | 'warning' | 'secondary'> = {
  increment: 'success',
  decrement: 'destructive',
  promotion: 'info',
  annual_review: 'secondary',
  probation_completion: 'warning',
  correction: 'secondary',
}

// ─── Small components ─────────────────────────────────────────────────────────

const InfoRow = React.memo(function InfoRow({ label, value, icon: Icon }: { label: string; value?: string | null; icon?: React.ElementType }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-border/40 last:border-0">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0" />}
      <span className="text-sm text-muted-foreground w-36 shrink-0">{label}</span>
      <span className="text-sm font-medium text-foreground truncate flex-1">{value || '—'}</span>
    </div>
  )
})

const QuickStat = React.memo(function QuickStat({ label, value, valueClass }: { label: string; value: React.ReactNode; valueClass?: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn('text-sm font-semibold text-foreground', valueClass)}>{value}</p>
    </div>
  )
})

const AttendanceSummary = React.memo(function AttendanceSummary({ records }: { records: AttendanceRecord[] }) {
  if (records.length === 0) return null
  const counts: Record<string, number> = {}
  let totalHours = 0
  for (const r of records) {
    counts[r.status] = (counts[r.status] ?? 0) + 1
    totalHours += parseFloat(r.hoursWorked ?? '0')
  }
  const stats = [
    { label: 'Present', value: counts['present'] ?? 0, color: 'text-success' },
    { label: 'Absent', value: counts['absent'] ?? 0, color: 'text-destructive' },
    { label: 'Late', value: counts['late'] ?? 0, color: 'text-warning' },
    { label: 'Half Day', value: counts['half_day'] ?? 0, color: 'text-info' },
    { label: 'WFH', value: counts['wfh'] ?? 0, color: 'text-muted-foreground' },
    { label: 'Total Hours', value: `${totalHours.toFixed(1)}h`, color: 'text-foreground' },
  ]
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
      {stats.map(s => (
        <Card key={s.label}>
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">{s.label}</p>
            <p className={cn('text-lg font-bold font-display', s.color)}>{s.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
})

// ─── Change Salary Dialog ─────────────────────────────────────────────────────

interface ChangeSalaryDialogProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  employeeId: string
  currentBasic?: number | null
  currentTotal?: number | null
}

function ChangeSalaryDialog({ open, onOpenChange, employeeId, currentBasic, currentTotal }: ChangeSalaryDialogProps) {
  const mutation = useRecordSalaryRevision(employeeId)

  const [effectiveDate, setEffectiveDate] = React.useState('')
  const [revisionType, setRevisionType] = React.useState('increment')
  const [newBasic, setNewBasic] = React.useState('')
  const [newTotal, setNewTotal] = React.useState('')
  const [remarks, setRemarks] = React.useState('')

  // Auto-fill yearly total when basic changes and total is empty
  const basicNum = parseFloat(newBasic) || 0
  const computedYearly = basicNum > 0 ? basicNum * 12 : null

  function resetForm() {
    setEffectiveDate('')
    setRevisionType('increment')
    setNewBasic('')
    setNewTotal('')
    setRemarks('')
  }

  function handleClose(o: boolean) {
    if (!o) resetForm()
    onOpenChange(o)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!effectiveDate || !newBasic) {
      toast.error('Missing fields', 'Effective Date and New Basic Salary are required.')
      return
    }

    const totalValue = newTotal ? parseFloat(newTotal) : undefined

    mutation.mutate(
      {
        effectiveDate,
        revisionType,
        newBasicSalary: parseFloat(newBasic),
        newTotalSalary: totalValue,
        reason: remarks || undefined,
      },
      {
        onSuccess: () => {
          toast.success('Salary updated', 'Salary revision recorded successfully.')
          handleClose(false)
        },
        onError: (err: Error) => {
          toast.error('Failed', err?.message ?? 'Could not record salary revision.')
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change Salary</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cs-date">Effective Date <span className="text-destructive">*</span></Label>
            <DatePicker
              id="cs-date"
              value={effectiveDate}
              onChange={setEffectiveDate}
              placeholder="Select effective date"
              aria-invalid={!effectiveDate && undefined}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cs-type">Revision Type <span className="text-destructive">*</span></Label>
            <Select value={revisionType} onValueChange={setRevisionType}>
              <SelectTrigger id="cs-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(REVISION_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cs-basic">New Basic Salary (AED) <span className="text-destructive">*</span></Label>
            {currentBasic != null && (
              <p className="text-xs text-muted-foreground">Current basic: {formatCurrency(currentBasic)}</p>
            )}
            <NumericInput
              id="cs-basic"
              placeholder="0.00"
              value={newBasic}
              onChange={e => setNewBasic(e.target.value)}
            />
            {computedYearly != null && (
              <p className="text-xs text-muted-foreground">
                Yearly = {formatCurrency(computedYearly)} (monthly × 12)
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cs-total">New Total Salary (AED) <span className="text-muted-foreground text-xs">(optional)</span></Label>
            {currentTotal != null && (
              <p className="text-xs text-muted-foreground">Current total: {formatCurrency(currentTotal)}</p>
            )}
            <NumericInput
              id="cs-total"
              placeholder={computedYearly != null ? `e.g. ${basicNum.toFixed(2)}` : '0.00'}
              value={newTotal}
              onChange={e => setNewTotal(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cs-remarks">Remarks / Reason <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea
              id="cs-remarks"
              placeholder="Reason for salary change…"
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Saving…</> : 'Save Revision'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Transfer Dialog ──────────────────────────────────────────────────────────

interface TransferDialogProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  employeeId: string
  orgUnits: Array<{ id: string; name: string; type: string }>
  currentDept?: string | null
  currentDeptId?: string | null
}

const NONE = '__none__'

function TransferDialog({ open, onOpenChange, employeeId, orgUnits, currentDept, currentDeptId }: TransferDialogProps) {
  const mutation = useCreateTransfer(employeeId)

  const [transferDate, setTransferDate] = React.useState('')
  const [branchId, setBranchId] = React.useState(NONE)
  const [divisionId, setDivisionId] = React.useState(NONE)
  const [departmentId, setDepartmentId] = React.useState(NONE)
  const [toDesignation, setToDesignation] = React.useState('')
  const [newSalary, setNewSalary] = React.useState('')
  const [reason, setReason] = React.useState('')
  const [notes, setNotes] = React.useState('')

  const branches = React.useMemo(() => orgUnits.filter(u => u.type === 'branch'), [orgUnits])
  const divisions = React.useMemo(() => orgUnits.filter(u => u.type === 'division'), [orgUnits])
  const departments = React.useMemo(() => orgUnits.filter(u => u.type === 'department'), [orgUnits])

  const selectedDept = departments.find(d => d.id === departmentId)
  const fromLabel = currentDept ?? (currentDeptId ? orgUnits.find(u => u.id === currentDeptId)?.name : null) ?? 'Current department'
  const toLabel = selectedDept?.name ?? null

  function resetForm() {
    setTransferDate('')
    setBranchId(NONE)
    setDivisionId(NONE)
    setDepartmentId(NONE)
    setToDesignation('')
    setNewSalary('')
    setReason('')
    setNotes('')
  }

  function handleClose(o: boolean) {
    if (!o) resetForm()
    onOpenChange(o)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!transferDate) {
      toast.error('Required', 'Transfer date is required.')
      return
    }
    if (branchId === NONE && divisionId === NONE && departmentId === NONE && !toDesignation && !newSalary) {
      toast.error('Nothing to transfer', 'Please select at least one destination (branch, division, department, or new designation).')
      return
    }

    try {
      await mutation.mutateAsync({
        transferDate,
        toBranchId: branchId !== NONE ? branchId : null,
        toDivisionId: divisionId !== NONE ? divisionId : null,
        toDepartmentId: departmentId !== NONE ? departmentId : null,
        toDesignation: toDesignation || null,
        newSalary: newSalary ? parseFloat(newSalary) : null,
        reason: reason || null,
        notes: notes || null,
      })
      toast.success('Transfer recorded', 'Employee transfer has been recorded.')
      handleClose(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not record transfer.'
      toast.error('Transfer failed', msg)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Transfer Employee</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label>Transfer Date <span className="text-destructive">*</span></Label>
            <DatePicker value={transferDate} onChange={v => setTransferDate(v ?? '')} placeholder="Select transfer date" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Branch</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger><SelectValue placeholder="Branch…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Keep current —</SelectItem>
                  {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Division</Label>
              <Select value={divisionId} onValueChange={setDivisionId}>
                <SelectTrigger><SelectValue placeholder="Division…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Keep current —</SelectItem>
                  {divisions.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Department</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger><SelectValue placeholder="Department…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Keep current —</SelectItem>
                  {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {toLabel && (
            <div className="rounded-lg bg-muted/50 border px-3 py-2 text-xs">
              <span className="text-muted-foreground">Department: </span>
              <span className="font-medium">{fromLabel}</span>
              <span className="text-muted-foreground mx-1.5">→</span>
              <span className="font-medium text-primary">{toLabel}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>New Designation <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
            <Input placeholder="e.g. Senior Engineer" value={toDesignation} onChange={e => setToDesignation(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>New Salary (AED) <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
            <NumericInput placeholder="0.00" value={newSalary} onChange={e => setNewSalary(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Reason <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
            <Textarea placeholder="Reason for transfer…" value={reason} onChange={e => setReason(e.target.value)} rows={2} />
          </div>

          <div className="space-y-1.5">
            <Label>Notes <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
            <Textarea placeholder="Additional notes…" value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Saving…</>
                : 'Record Transfer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function exportCSV(emp: Record<string, unknown>) {
  const rows: [string, string][] = [
    ['Employee No', String(emp['employeeNo'] ?? '')],
    ['Full Name', String(emp['fullName'] ?? '')],
    ['Designation', String(emp['designation'] ?? '')],
    ['Department', String(emp['department'] ?? '')],
    ['Email', String(emp['email'] ?? '')],
    ['Phone', String(emp['phone'] ?? '')],
    ['Nationality', String(emp['nationality'] ?? '')],
    ['Status', String(emp['status'] ?? '')],
    ['Join Date', String(emp['joinDate'] ?? '')],
    ['Visa Expiry', String(emp['visaExpiry'] ?? '')],
    ['Passport No', String(emp['passportNo'] ?? '')],
    ['Emirates ID', String(emp['emiratesId'] ?? '')],
  ]
  const csv = rows.map(([k, v]) => `"${k}","${v.replace(/"/g, '""')}"`).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  a.download = `employee-${(emp['employeeNo'] ?? emp['id']) as string}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
}

async function downloadDoc(doc: DocRecord) {
  try {
    const res = await api.get<{ data: { downloadUrl: string } }>(`/documents/${doc.id}/download-url`)
    const a = document.createElement('a')
    a.href = res.data.downloadUrl
    a.download = doc.fileName ?? doc.docType ?? 'document'
    a.target = '_blank'
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } catch {
    toast.error('Download failed', 'Could not download the document.')
  }
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function EmployeeDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { can } = usePermissions()
  const canManage = can('manage_employees')

  const { data: employee, isLoading } = useEmployee(id!)
  const { data: orgUnits = [] } = useOrgUnits()
  const orgUnitName = React.useMemo(() => {
    const map = new Map(orgUnits.map((u: { id: string; name: string }) => [u.id, u.name]))
    return (id: string | undefined | null) => (id ? (map.get(id) ?? null) : null)
  }, [orgUnits])
  const { data: docsResult, isLoading: docsLoading } = useDocuments({ employeeId: id })
  const { data: reviews, isLoading: reviewsLoading } = usePerformanceReviews({ employeeId: id })
  const { data: employeeAssignments, isLoading: assetsLoading } = useEmployeeAssets(id!)
  const attendanceStart = React.useMemo(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) }, [])
  const attendanceEnd = React.useMemo(() => new Date().toISOString().slice(0, 10), [])
  const { data: attendanceData, isLoading: attendanceLoading } = useAttendance({ employeeId: id, startDate: attendanceStart, endDate: attendanceEnd, limit: 100 })

  const attendanceRecords = React.useMemo<AttendanceRecord[]>(() => {
    if (!attendanceData) return []
    if (Array.isArray(attendanceData)) return attendanceData as AttendanceRecord[]
    const items = (attendanceData as { items?: unknown }).items
    return Array.isArray(items) ? (items as AttendanceRecord[]) : []
  }, [attendanceData])

  const docs = (docsResult?.data as DocRecord[] | undefined) ?? []

  const { data: accountData, isLoading: accountLoading } = useEmployeeAccount(canManage ? id : undefined)
  const { data: employeeTeams = [] } = useEmployeeTeams(id)

  // Salary history — only fetch when canManage (same guard as the route)
  const { data: salaryHistoryData, isLoading: salaryHistoryLoading } = useSalaryHistory(canManage ? (id ?? '') : '')

  // Transfer history
  const { data: transfersData, isLoading: transfersLoading } = useEmployeeTransfers(id)

  // Dependents
  const { data: dependentsData, isLoading: dependentsLoading } = useDependents(canManage ? (id ?? '') : '')
  const createDependent = useCreateDependent(id ?? '')
  const updateDependent = useUpdateDependent(id ?? '')
  const deleteDependent = useDeleteDependent(id ?? '')

  // Notes
  const { data: notesData, isLoading: notesLoading } = useEmployeeNotes(canManage ? (id ?? '') : '')
  const addNote = useAddEmployeeNote(id ?? '')
  const deleteNote = useDeleteEmployeeNote(id ?? '')

  // Updates (audit trail for this employee)
  const { data: auditData, isLoading: auditLoading } = useActivityLogs(
    canManage && id ? { entityType: 'employee', entityId: id, limit: 100 } : {},
  )

  // Warnings
  const { data: warningsData, isLoading: warningsLoading } = useEmployeeWarnings(canManage ? (id ?? '') : '')
  const createWarning = useCreateEmployeeWarning(id ?? '')
  const deleteWarning = useDeleteEmployeeWarning(id ?? '')
  const downloadWarningDoc = useWarningDocumentUrl(id ?? '')

  const { data: sponsoringEntitiesData = [] } = useSponsoringEntities()
  const createSponsoringEntity = useCreateSponsoringEntity()
  const sponsoringEntityOptions: ComboboxOption[] = (Array.isArray(sponsoringEntitiesData) ? sponsoringEntitiesData as SponsoringEntity[] : [])
    .map(se => ({ value: se.id, label: se.name }))

  const uploadAvatar = useUploadEmployeeAvatar(id!)
  const updateEmployee = useUpdateEmployee(id!)
  const [editOpen, setEditOpen] = React.useState(false)
  const [editEmploymentOpen, setEditEmploymentOpen] = React.useState(false)
  const [editPayrollOpen, setEditPayrollOpen] = React.useState(false)
  const [inviteOpen, setInviteOpen] = React.useState(false)
  const [viewDoc, setViewDoc] = React.useState<{ id: string; fileName?: string } | null>(null)
  const [visaEditOpen, setVisaEditOpen] = React.useState(false)
  const [visaForm, setVisaForm] = React.useState({
    visaType: '', visaNumber: '', visaIssueDate: '', visaExpiry: '',
    sponsoringEntityId: '', emiratesId: '', emiratesIdExpiry: '',
    passportNo: '', passportExpiry: '', labourCardNumber: '', labourCardExpiry: '',
  })
  const [changeSalaryOpen, setChangeSalaryOpen] = React.useState(false)
  const [transferOpen, setTransferOpen] = React.useState(false)
  const [createReviewOpen, setCreateReviewOpen] = React.useState(false)
  const [addDocOpen, setAddDocOpen] = React.useState(false)
  const [assignAssetOpen, setAssignAssetOpen] = React.useState(false)
  const [dependentDialogOpen, setDependentDialogOpen] = React.useState(false)
  const [editingDependent, setEditingDependent] = React.useState<Dependent | null>(null)
  const [noteInput, setNoteInput] = React.useState('')
  const [warningDialogOpen, setWarningDialogOpen] = React.useState(false)
  const avatarInputRef = React.useRef<HTMLInputElement>(null)

  const e = employee

  // Terminated or suspended employees must not be granted/managed system access
  const isAccessRestricted = ['terminated', 'suspended'].includes(e?.status ?? '')

  const visaDays = e?.visaExpiry ? Math.ceil((new Date(e.visaExpiry).getTime() - Date.now()) / 86400000) : null
  const visaLabel = visaDays === null ? 'N/A' : visaDays < 0 ? 'Expired' : `${visaDays}d left`
  const visaClass = visaDays === null ? '' : visaDays < 0 ? 'text-destructive' : visaDays < 90 ? 'text-warning' : 'text-success'

  function handleAvatarChange(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast.error('File too large', 'Image must be smaller than 5 MB'); return }
    uploadAvatar.mutate(file, {
      onSuccess: () => toast.success('Updated', 'Profile image updated.'),
      onError: (err: Error) => toast.error('Upload failed', err?.message ?? 'Upload failed'),
    })
    ev.target.value = ''
  }


  if (isLoading) {
    return (
      <PageWrapper>
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-44 rounded-xl" />
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </PageWrapper>
    )
  }

  if (!e) {
    return (
      <PageWrapper>
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-64 gap-3">
            <p className="text-muted-foreground">{t('employees.noEmployees')}</p>
            <Button variant="outline" size="sm" onClick={() => navigate('/employees')}>{t('common.back')}</Button>
          </CardContent>
        </Card>
      </PageWrapper>
    )
  }

  return (
    <PageWrapper>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Button variant="ghost" size="icon-sm" onClick={() => navigate('/employees')} aria-label="Back" className="h-7 w-7 shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <button type="button" onClick={() => navigate('/employees')} className="text-muted-foreground hover:text-foreground transition-colors">
          Employees
        </button>
        <span className="text-muted-foreground">›</span>
        <span className="text-foreground font-medium truncate">{e.fullName}</span>
      </div>

      {/* Hero card */}
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row gap-5">
            {/* Avatar with upload button */}
            <div className="relative shrink-0 self-start">
              <Avatar className="h-20 w-20 sm:h-24 sm:w-24">
                {e.avatarUrl && <AvatarImage src={e.avatarUrl} alt={e.fullName} />}
                <AvatarFallback className="text-xl font-bold bg-primary text-primary-foreground">
                  {getInitials(e.fullName)}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadAvatar.isPending}
                className="absolute bottom-0 right-0 h-7 w-7 rounded-full bg-background border-2 border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary transition disabled:opacity-50"
                aria-label="Change profile image"
              >
                {uploadAvatar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              </button>
            </div>

            {/* Identity block */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <Badge variant={STATUS_VARIANT[e.status] ?? 'secondary'} className="capitalize text-[10px]">
                      {labelFor(e.status)}
                    </Badge>
                    {(() => {
                      const parts = [
                        orgUnitName(e.branchId),
                        orgUnitName(e.divisionId),
                        orgUnitName(e.departmentId) ?? e.department,
                      ].filter(Boolean) as string[]
                      return parts.length > 0 ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          {parts.map((p, i) => (
                            <span key={i} className="flex items-center gap-1">
                              {i > 0 && <span className="opacity-40">›</span>}
                              <span className={i === parts.length - 1 ? 'font-medium text-foreground/80' : ''}>{p}</span>
                            </span>
                          ))}
                        </span>
                      ) : null
                    })()}
                  </div>
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight font-display truncate">{e.fullName}</h1>
                  <p className="text-sm text-muted-foreground mt-0.5">{e.designation ?? '—'} · {e.employeeNo}</p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                    {(e.mobileNo ?? e.phone) && (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        <CopyablePhone phone={e.mobileNo ?? e.phone ?? ''} className="text-xs text-muted-foreground" />
                      </span>
                    )}
                    {(e.workEmail ?? e.email) && (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        <CopyableEmail email={e.workEmail ?? e.email ?? ''} className="text-xs text-muted-foreground" />
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="outline" size="sm" leftIcon={<Download className="h-3.5 w-3.5" />} onClick={() => exportCSV(e as unknown as Record<string, unknown>)}>
                    Export
                  </Button>
                  {canManage && !accountLoading && !isAccessRestricted && (() => {
                    if (!accountData?.hasAccount) {
                      // No account — invite not yet sent
                      return (
                        <Button variant="outline" size="sm" leftIcon={<UserCheck className="h-3.5 w-3.5" />} onClick={() => setInviteOpen(true)}>
                          Grant Access
                        </Button>
                      )
                    }
                    if (!accountData?.account?.isActive) {
                      // Invite sent but password not yet set
                      return (
                        <Button variant="outline" size="sm" leftIcon={<Clock className="h-3.5 w-3.5" />} onClick={() => setInviteOpen(true)}
                          className="text-warning border-warning/40 bg-warning/5 hover:bg-warning/10 hover:text-warning">
                          Invite Pending
                        </Button>
                      )
                    }
                    // Active — no button needed here; manage via Account tab
                    return null
                  })()}
                  <Button size="sm" leftIcon={<Edit2 className="h-3.5 w-3.5" />} onClick={() => setEditOpen(true)}>
                    Edit Profile
                  </Button>
                </div>
              </div>

              {/* Key stats strip */}
              <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 pt-4 border-t border-border/60">
                <QuickStat label="Join Date" value={formatDate(e.joinDate) || '—'} />
                <QuickStat label="Total Salary" value={formatCurrency(e.totalSalary ?? 0)} />
                <QuickStat label="Visa" value={visaLabel} valueClass={visaClass} />
                {e.contractType && <QuickStat label="Employment" value={labelFor(e.contractType)} />}
                {e.workLocation && <QuickStat label="Location" value={e.workLocation} />}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tab bar + content */}
      <Tabs defaultValue="personal">
        <Card>
          <CardContent className="p-0">
            <TabsList className="h-auto bg-transparent p-0 w-full justify-start overflow-x-auto rounded-none border-b border-border/60 px-5">
              {[
                { value: 'personal', icon: User, label: 'Personal' },
                { value: 'employment', icon: Briefcase, label: 'Employment' },
                { value: 'visa', icon: Plane, label: 'Visa & ID' },
                { value: 'documents', icon: FileText, label: 'Documents' },
                { value: 'payroll', icon: CreditCard, label: 'Payroll' },
                { value: 'performance', icon: Star, label: 'Performance' },
                { value: 'assets', icon: Package, label: 'Assets' },
                { value: 'leave', icon: CalendarDays, label: 'Leave' },
                { value: 'attendance', icon: ClipboardList, label: 'Attendance' },
                ...(canManage ? [{ value: 'warnings', icon: AlertTriangle, label: 'Warnings' }] : []),
                ...(canManage ? [{ value: 'dependents', icon: Heart, label: 'Dependents' }] : []),
                ...(canManage ? [{ value: 'notes', icon: StickyNote, label: 'Notes' }] : []),
                ...(canManage ? [{ value: 'updates', icon: History, label: 'Updates' }] : []),
                ...(canManage ? [{ value: 'account', icon: UserCheck, label: 'Account' }] : []),
              ].map(tab => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="gap-1.5 text-xs sm:text-sm font-medium px-4 py-3.5 rounded-none border-b-2 border-transparent shadow-none bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary data-[state=active]:border-primary text-muted-foreground hover:text-foreground transition-colors -mb-px"
                >
                  <tab.icon className="h-3.5 w-3.5" />
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </CardContent>
        </Card>

        <div className="space-y-4">

          {/* ── Personal ── */}
          <TabsContent value="personal" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Personal Information</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10">
                  <div>
                    <InfoRow label="Full Name" value={e.fullName} icon={User} />
                    <InfoRow label="Date of Birth" value={e.dateOfBirth ? formatDate(e.dateOfBirth) : null} icon={Calendar} />
                    <InfoRow label="Gender" value={labelFor(e.gender)} icon={User} />
                    <InfoRow label="Nationality" value={e.nationality} icon={MapPin} />
                    <InfoRow label="Marital Status" value={labelFor(e.maritalStatus)} icon={User} />
                  </div>
                  <div>
                    <InfoRow label="Mobile" value={e.mobileNo ?? e.phone} icon={Phone} />
                    <InfoRow label="Personal Email" value={e.personalEmail} icon={Mail} />
                    <InfoRow label="Work Email" value={e.workEmail || e.email || null} icon={Mail} />
                    <InfoRow label="Emergency Name" value={e.emergencyContactName ?? e.emergencyContact} icon={Phone} />
                    <InfoRow label="Emergency Phone" value={e.emergencyContactPhone} icon={Phone} />
                    <InfoRow label="Address" value={e.homeCountryAddress} icon={MapPin} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Employment ── */}
          <TabsContent value="employment" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base">Employment Details</CardTitle>
                  {canManage && (
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" leftIcon={<Edit2 className="h-3.5 w-3.5" />} onClick={() => setEditEmploymentOpen(true)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="outline" leftIcon={<ArrowRightLeft className="h-3.5 w-3.5" />} onClick={() => setTransferOpen(true)}>
                        Transfer
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                  <div>
                    <InfoRow label="Employee No." value={e.employeeNo} icon={Hash} />
                    <InfoRow label="Designation" value={e.designation} icon={Briefcase} />
                    <InfoRow label="Branch" value={orgUnitName(e.branchId) ?? '—'} icon={Building2} />
                    <InfoRow label="Division" value={orgUnitName(e.divisionId) ?? '—'} icon={Building2} />
                    <InfoRow label="Department" value={orgUnitName(e.departmentId) ?? '—'} icon={Building2} />
                    <InfoRow label="Company" value={(e as unknown as Record<string, unknown>)['entityName'] as string ?? '—'} icon={Building2} />
                    <InfoRow label="Employment Type" value={labelFor(e.contractType)} icon={Briefcase} />
                    <InfoRow label="Work Location" value={e.workLocation} icon={MapPin} />
                  </div>
                  <div>
                    <InfoRow label="Join Date" value={formatDate(e.joinDate)} icon={Calendar} />
                    {(e.contractType === 'probation' || e.probationEndDate) && (
                      <InfoRow label="Probation End" value={e.probationEndDate ? formatDate(e.probationEndDate) : '—'} icon={Clock} />
                    )}
                    {(e.contractType === 'contract' || e.contractEndDate) && (
                      <InfoRow label="Contract End" value={e.contractEndDate ? formatDate(e.contractEndDate) : '—'} icon={Calendar} />
                    )}
                    <InfoRow label="Status" value={labelFor(e.status)} icon={Shield} />
                    <InfoRow label="Grade Level" value={e.gradeLevelName} icon={GraduationCap} />
                    <InfoRow label="Direct Manager" value={e.managerName} icon={User} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Team memberships */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">Team Memberships</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {employeeTeams.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">Not assigned to any team.</p>
                ) : (
                  <div className="divide-y divide-border/40">
                    {employeeTeams.map(team => (
                      <div key={team.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{team.name}</p>
                          {team.department && (
                            <p className="text-xs text-muted-foreground mt-0.5">{team.department}</p>
                          )}
                        </div>
                        <Badge variant="secondary" className="text-[10px] shrink-0 ml-3">
                          {team.memberCount} {team.memberCount === 1 ? 'member' : 'members'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Transfer History */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">Transfer History</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {transfersLoading ? (
                  <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : !transfersData || transfersData.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <ArrowRightLeft className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-medium">No transfers recorded</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {transfersData.map(tr => {
                      const fromDept = tr.fromDepartment ?? (tr.fromDepartmentId ? orgUnitName(tr.fromDepartmentId) : null)
                      const toDept = tr.toDepartment ?? (tr.toDepartmentId ? orgUnitName(tr.toDepartmentId) : null)
                      const fromBranch = tr.fromBranchName ?? (tr.fromBranchId ? orgUnitName(tr.fromBranchId) : null)
                      const toBranch = tr.toBranchName ?? (tr.toBranchId ? orgUnitName(tr.toBranchId) : null)
                      const fromDiv = tr.fromDivisionName ?? (tr.fromDivisionId ? orgUnitName(tr.fromDivisionId) : null)
                      const toDiv = tr.toDivisionName ?? (tr.toDivisionId ? orgUnitName(tr.toDivisionId) : null)
                      return (
                        <div key={tr.id} className="py-3 flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="info" className="text-[10px] shrink-0">Transfer</Badge>
                              <span className="text-xs text-muted-foreground">{formatDate(tr.transferDate)}</span>
                            </div>
                            <div className="mt-1 space-y-0.5">
                              {(fromBranch || toBranch) && (
                                <p className="text-xs text-muted-foreground">
                                  <span className="font-medium text-foreground/60">Branch: </span>
                                  {fromBranch ?? '—'} &rarr; <span className="font-medium text-foreground">{toBranch ?? '—'}</span>
                                </p>
                              )}
                              {(fromDiv || toDiv) && (
                                <p className="text-xs text-muted-foreground">
                                  <span className="font-medium text-foreground/60">Division: </span>
                                  {fromDiv ?? '—'} &rarr; <span className="font-medium text-foreground">{toDiv ?? '—'}</span>
                                </p>
                              )}
                              {(fromDept || toDept) && (
                                <p className="text-sm text-foreground">
                                  <span className="text-muted-foreground">{fromDept ?? '—'}</span>
                                  {' '}&rarr;{' '}
                                  <span className="font-medium">{toDept ?? '—'}</span>
                                </p>
                              )}
                              {(tr.fromDesignation || tr.toDesignation) && (
                                <p className="text-xs text-muted-foreground">
                                  <span className="font-medium text-foreground/60">Designation: </span>
                                  {tr.fromDesignation ?? '—'} &rarr; <span className="font-medium text-foreground">{tr.toDesignation ?? '—'}</span>
                                </p>
                              )}
                              {tr.newSalary && (
                                <p className="text-xs text-muted-foreground">
                                  New salary: <span className="font-medium text-foreground">{formatCurrency(parseFloat(tr.newSalary))}</span>
                                </p>
                              )}
                              {tr.reason && (
                                <p className="text-xs text-muted-foreground line-clamp-1">{tr.reason}</p>
                              )}
                              {tr.notes && (
                                <p className="text-xs text-muted-foreground/70 italic line-clamp-1">{tr.notes}</p>
                              )}
                            </div>
                          </div>
                          {tr.approvedByName && (
                            <span className="text-xs text-muted-foreground shrink-0">by {tr.approvedByName}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Visa & ID ── */}
          <TabsContent value="visa" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base">Visa &amp; Immigration</CardTitle>
                    {visaDays !== null && (
                      <Badge
                        variant={visaDays < 30 ? 'destructive' : visaDays < 90 ? 'warning' : 'success'}
                        className="text-xs"
                      >
                        {visaDays < 0 ? 'Visa Expired' : visaDays < 30 ? `Expiring in ${visaDays}d` : `Valid — ${visaDays}d left`}
                      </Badge>
                    )}
                  </div>
                  {canManage && !visaEditOpen && (
                    <Button
                      size="sm" variant="outline"
                      leftIcon={<Edit2 className="h-3.5 w-3.5" />}
                      onClick={() => {
                        setVisaForm({
                          visaType: e.visaType ?? '',
                          visaNumber: e.visaNumber ?? '',
                          visaIssueDate: e.visaIssueDate ? String(e.visaIssueDate).slice(0, 10) : '',
                          visaExpiry: e.visaExpiry ? String(e.visaExpiry).slice(0, 10) : '',
                          sponsoringEntityId: e.sponsoringEntityId ?? '',
                          emiratesId: e.emiratesId ?? '',
                          emiratesIdExpiry: e.emiratesIdExpiry ? String(e.emiratesIdExpiry).slice(0, 10) : '',
                          passportNo: e.passportNo ?? '',
                          passportExpiry: e.passportExpiry ? String(e.passportExpiry).slice(0, 10) : '',
                          labourCardNumber: e.labourCardNumber ?? '',
                          labourCardExpiry: e.labourCardExpiry ? String(e.labourCardExpiry).slice(0, 10) : '',
                        })
                        setVisaEditOpen(true)
                      }}
                    >
                      Edit
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {visaEditOpen ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Visa Type</Label>
                        <Select value={visaForm.visaType} onValueChange={v => setVisaForm(f => ({ ...f, visaType: v }))}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Select visa type…" /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(VISA_TYPE_LABELS).filter(([k]) => ['employment', 'investor', 'dependent', 'mission'].includes(k)).map(([k, v]) => (
                              <SelectItem key={k} value={k}>{v}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Visa Number</Label>
                        <Input value={visaForm.visaNumber} onChange={e => setVisaForm(f => ({ ...f, visaNumber: e.target.value }))} placeholder="e.g. 201/2024/12345" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Visa Issue Date</Label>
                        <DatePicker value={visaForm.visaIssueDate} onChange={v => setVisaForm(f => ({ ...f, visaIssueDate: v ?? '' }))} placeholder="Select date" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Visa Expiry</Label>
                        <DatePicker value={visaForm.visaExpiry} onChange={v => setVisaForm(f => ({ ...f, visaExpiry: v ?? '' }))} placeholder="Select date" />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label>Sponsoring Entity</Label>
                        <Combobox
                          value={visaForm.sponsoringEntityId}
                          onValueChange={async (val) => {
                            const existing = sponsoringEntityOptions.find(o => o.value === val)
                            if (existing) {
                              setVisaForm(f => ({ ...f, sponsoringEntityId: val }))
                            } else if (val) {
                              try {
                                const created = await createSponsoringEntity.mutateAsync({ name: val })
                                setVisaForm(f => ({ ...f, sponsoringEntityId: (created as SponsoringEntity).id }))
                              } catch { /* ignore duplicate errors */ }
                            } else {
                              setVisaForm(f => ({ ...f, sponsoringEntityId: '' }))
                            }
                          }}
                          options={sponsoringEntityOptions}
                          placeholder="Select or type to add…"
                          searchPlaceholder="Search or add entity…"
                          creatable
                          clearable
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Emirates ID</Label>
                        <Input value={visaForm.emiratesId} onChange={e => setVisaForm(f => ({ ...f, emiratesId: e.target.value }))} placeholder="784-XXXX-XXXXXXX-X" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>EID Expiry</Label>
                        <DatePicker value={visaForm.emiratesIdExpiry} onChange={v => setVisaForm(f => ({ ...f, emiratesIdExpiry: v ?? '' }))} placeholder="Select date" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Passport No.</Label>
                        <Input value={visaForm.passportNo} onChange={e => setVisaForm(f => ({ ...f, passportNo: e.target.value }))} placeholder="e.g. A12345678" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Passport Expiry</Label>
                        <DatePicker value={visaForm.passportExpiry} onChange={v => setVisaForm(f => ({ ...f, passportExpiry: v ?? '' }))} placeholder="Select date" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Labour Card No.</Label>
                        <Input value={visaForm.labourCardNumber} onChange={e => setVisaForm(f => ({ ...f, labourCardNumber: e.target.value }))} placeholder="e.g. 12345678" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Labour Card Expiry</Label>
                        <DatePicker value={visaForm.labourCardExpiry} onChange={v => setVisaForm(f => ({ ...f, labourCardExpiry: v ?? '' }))} placeholder="Select date" />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <Button variant="outline" size="sm" onClick={() => setVisaEditOpen(false)} disabled={updateEmployee.isPending}>
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        loading={updateEmployee.isPending}
                        onClick={async () => {
                          const payload: Partial<Employee> = {}
                          if (visaForm.visaType) payload.visaType = visaForm.visaType as Employee['visaType']
                          payload.visaNumber = visaForm.visaNumber || undefined
                          payload.visaIssueDate = visaForm.visaIssueDate || undefined
                          payload.visaExpiry = visaForm.visaExpiry || undefined
                          payload.sponsoringEntityId = visaForm.sponsoringEntityId || undefined
                          payload.emiratesId = visaForm.emiratesId || undefined
                          payload.emiratesIdExpiry = visaForm.emiratesIdExpiry || undefined
                          payload.passportNo = visaForm.passportNo || undefined
                          payload.passportExpiry = visaForm.passportExpiry || undefined
                          payload.labourCardNumber = visaForm.labourCardNumber || undefined
                          payload.labourCardExpiry = visaForm.labourCardExpiry || undefined
                          try {
                            await updateEmployee.mutateAsync(payload)
                            toast.success('Visa & ID updated')
                            setVisaEditOpen(false)
                          } catch {
                            toast.error('Save failed', 'Could not update visa & ID details.')
                          }
                        }}
                      >
                        Save Changes
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                    <div>
                      <InfoRow label="Visa Type" value={labelFor(e.visaType)} icon={Plane} />
                      <InfoRow label="Visa Number" value={e.visaNumber} icon={Hash} />
                      <InfoRow label="Visa Issue Date" value={e.visaIssueDate ? formatDate(e.visaIssueDate) : null} icon={Calendar} />
                      <InfoRow label="Visa Expiry" value={e.visaExpiry ? formatDate(e.visaExpiry) : null} icon={Calendar} />
                      <InfoRow label="Sponsoring Entity" value={e.sponsoringEntityName} icon={Building2} />
                    </div>
                    <div>
                      <InfoRow label="Emirates ID" value={e.emiratesId} icon={Hash} />
                      <InfoRow label="EID Expiry" value={e.emiratesIdExpiry ? formatDate(e.emiratesIdExpiry) : null} icon={Calendar} />
                      <InfoRow label="Passport No." value={e.passportNo} icon={Hash} />
                      <InfoRow label="Passport Expiry" value={e.passportExpiry ? formatDate(e.passportExpiry) : null} icon={Calendar} />
                      <InfoRow label="Labour Card No." value={e.labourCardNumber} icon={Hash} />
                      <InfoRow label="Labour Card Expiry" value={e.labourCardExpiry ? formatDate(e.labourCardExpiry) : null} icon={Calendar} />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Documents ── */}
          <TabsContent value="documents" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Employee Documents</CardTitle>
                  <Button
                    size="sm"
                    leftIcon={<Plus className="h-3.5 w-3.5" />}
                    onClick={() => setAddDocOpen(true)}
                  >
                    Add Document
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {docsLoading ? (
                  <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : docs.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">No documents uploaded</p>
                    <p className="text-xs mt-1">Upload contracts, certificates, and ID documents</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {docs.map(doc => (
                      <div key={doc.id} className="flex items-center justify-between py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{doc.fileName ?? doc.docType ?? 'Untitled'}</p>
                            <p className="text-xs text-muted-foreground capitalize">{labelFor(doc.category)} · {formatDate(doc.createdAt)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <Badge variant={doc.status === 'verified' ? 'success' : doc.status === 'expired' ? 'destructive' : 'secondary'} className="text-[10px] capitalize">
                            {doc.status}
                          </Badge>
                          <Button variant="ghost" size="icon-sm" aria-label="View document" onClick={() => setViewDoc({ id: doc.id, fileName: doc.fileName ?? doc.docType })}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon-sm" aria-label="Download document" onClick={() => downloadDoc(doc)}>
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Payroll ── */}
          <TabsContent value="payroll" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base">Payroll Summary</CardTitle>
                  {canManage && (
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" leftIcon={<Edit2 className="h-3.5 w-3.5" />} onClick={() => setEditPayrollOpen(true)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="outline" leftIcon={<CreditCard className="h-3.5 w-3.5" />} onClick={() => setChangeSalaryOpen(true)}>
                        Change Salary
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                  <div>
                    <InfoRow label="Basic Salary" value={formatCurrency(e.basicSalary ?? 0)} icon={CreditCard} />
                    <InfoRow label="Housing Allow." value={formatCurrency(e.housingAllowance ?? 0)} icon={CreditCard} />
                    <InfoRow label="Transport Allow." value={formatCurrency(e.transportAllowance ?? 0)} icon={CreditCard} />
                    <InfoRow label="Other Allow." value={formatCurrency(e.otherAllowances ?? 0)} icon={CreditCard} />
                  </div>
                  <div>
                    <InfoRow label="Total Salary" value={formatCurrency(e.totalSalary ?? 0)} icon={CreditCard} />
                    <InfoRow label="Payment Method" value={labelFor(e.paymentMethod)} icon={Landmark} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Bank Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                  <div>
                    <InfoRow label="Account Name" value={e.accountName} icon={User} />
                    <InfoRow label="Account Number" value={e.accountNumber} icon={Hash} />
                    <InfoRow label="Bank Name" value={e.bankName} icon={Building2} />
                  </div>
                  <div>
                    <InfoRow label="IBAN" value={e.iban} icon={Hash} />
                    <InfoRow label="Swift Code" value={e.swiftCode} icon={Hash} />
                    <InfoRow label="Branch" value={e.bankBranch} icon={Building2} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Salary History */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">Salary History</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {salaryHistoryLoading ? (
                  <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : !salaryHistoryData || salaryHistoryData.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-medium">No salary revisions recorded</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/40">
                          <th className="text-left font-medium text-muted-foreground px-3 py-2.5">Effective Date</th>
                          <th className="text-left font-medium text-muted-foreground px-3 py-2.5">Type</th>
                          <th className="text-right font-medium text-muted-foreground px-3 py-2.5">Prev. Basic</th>
                          <th className="text-right font-medium text-muted-foreground px-3 py-2.5">New Basic</th>
                          <th className="text-right font-medium text-muted-foreground px-3 py-2.5">Change</th>
                          <th className="text-right font-medium text-muted-foreground px-3 py-2.5 hidden md:table-cell">New Total</th>
                          <th className="text-left font-medium text-muted-foreground px-3 py-2.5 hidden sm:table-cell">Remarks</th>
                          <th className="text-left font-medium text-muted-foreground px-3 py-2.5 hidden lg:table-cell">Approved By</th>
                        </tr>
                      </thead>
                      <tbody>
                        {salaryHistoryData.map(rev => {
                          const prev = rev.previousBasicSalary ? parseFloat(rev.previousBasicSalary) : null
                          const next = parseFloat(rev.newBasicSalary)
                          const delta = prev != null ? next - prev : null
                          return (
                            <tr key={rev.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                              <td className="px-3 py-2.5 font-medium">{formatDate(rev.effectiveDate)}</td>
                              <td className="px-3 py-2.5">
                                <Badge variant={REVISION_TYPE_VARIANT[rev.revisionType] ?? 'secondary'} className="text-[10px]">
                                  {REVISION_TYPE_LABELS[rev.revisionType] ?? rev.revisionType}
                                </Badge>
                              </td>
                              <td className="px-3 py-2.5 text-right text-muted-foreground">
                                {prev != null ? formatCurrency(prev) : '—'}
                              </td>
                              <td className="px-3 py-2.5 text-right font-medium">
                                {formatCurrency(next)}
                              </td>
                              <td className="px-3 py-2.5 text-right font-medium">
                                {delta != null ? (
                                  <span className={delta >= 0 ? 'text-success' : 'text-destructive'}>
                                    {delta >= 0 ? '+' : ''}{formatCurrency(delta)}
                                  </span>
                                ) : '—'}
                              </td>
                              <td className="px-3 py-2.5 text-right text-muted-foreground hidden md:table-cell">
                                {rev.newTotalSalary ? formatCurrency(parseFloat(rev.newTotalSalary)) : '—'}
                              </td>
                              <td className="px-3 py-2.5 text-muted-foreground hidden sm:table-cell max-w-[180px] truncate">
                                {rev.reason ?? '—'}
                              </td>
                              <td className="px-3 py-2.5 text-muted-foreground hidden lg:table-cell text-xs">
                                {rev.approvedByName ?? '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Performance ── */}
          <TabsContent value="performance" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Performance &amp; Notes</CardTitle>
                  {canManage && (
                    <Button size="sm" variant="outline" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreateReviewOpen(true)}>
                      New review
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {reviewsLoading ? (
                  <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
                ) : !reviews || reviews.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <Star className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">No performance records yet</p>
                    <p className="text-xs mt-1">Reviews and performance data will appear here</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {reviews.map(r => (
                      <div key={r.id} className="py-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{r.period}</p>
                          <p className="text-xs text-muted-foreground">
                            {r.reviewDate ? formatDate(r.reviewDate) : '—'}
                            {r.overallRating != null && ` · ${r.overallRating}/5`}
                          </p>
                          {r.managerComments && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.managerComments}</p>}
                        </div>
                        <Badge variant={r.status === 'completed' ? 'success' : r.status === 'submitted' ? 'info' : 'secondary'} className="text-[10px] capitalize shrink-0">
                          {r.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Assets ── */}
          <TabsContent value="assets" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">Assigned Assets</CardTitle>
                {canManage && (
                  <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setAssignAssetOpen(true)}>
                    Assign Asset
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {assetsLoading ? (
                  <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : !employeeAssignments || employeeAssignments.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">No assets assigned</p>
                    {canManage && (
                      <Button size="sm" variant="outline" className="mt-3" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setAssignAssetOpen(true)}>
                        Assign First Asset
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="divide-y">
                    {employeeAssignments.map(a => (
                      <div key={a.id} className="flex items-center justify-between py-3">
                        <div className="flex items-center gap-3">
                          <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div>
                            <p className="text-sm font-medium">{a.assetName}</p>
                            <p className="text-xs text-muted-foreground">
                              {[a.categoryName, `${a.assetBrand ?? ''} ${a.assetModel ?? ''}`.trim() || null, a.assetSerialNumber ? `S/N: ${a.assetSerialNumber}` : null].filter(Boolean).join(' · ')}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Assigned: {formatDate(a.assignedDate)}{a.expectedReturnDate ? ` · Due: ${formatDate(a.expectedReturnDate)}` : ''}
                            </p>
                          </div>
                        </div>
                        <Badge variant="info" className="text-[10px]">Assigned</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Leave ── */}
          <TabsContent value="leave" className="mt-4">
            <EmployeeLeavePanel employeeId={id!} canManage={canManage} />
          </TabsContent>

          {/* ── Account ── */}
          {canManage && (
            <TabsContent value="account" className="mt-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Login Account</CardTitle>
                    {!accountLoading && accountData?.hasAccount && !isAccessRestricted && (
                      <Button size="sm" leftIcon={<UserCheck className="h-3.5 w-3.5" />} onClick={() => setInviteOpen(true)}>
                        Manage Access
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {accountLoading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-5 w-40" />
                      <Skeleton className="h-16 w-full" />
                    </div>
                  ) : isAccessRestricted ? (
                    <div className="flex items-start gap-4 rounded-xl border border-destructive/20 bg-destructive/5 p-5">
                      <Shield className="h-9 w-9 text-destructive/40 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Access unavailable</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Login access cannot be granted or managed for <span className="capitalize font-medium">{e.status}</span> employees.
                        </p>
                      </div>
                    </div>
                  ) : !accountData?.hasAccount ? (
                    <div className="flex items-start gap-4 rounded-xl border bg-muted/30 p-5">
                      <Shield className="h-9 w-9 text-muted-foreground/40 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">No login account yet</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Use the "Grant Access" button above to send an invitation to this employee.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border bg-muted/30 p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">Account status</p>
                        <Badge variant={accountData.account?.isActive ? 'success' : 'secondary'}>
                          {accountData.account?.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <div className="space-y-1.5 text-sm text-muted-foreground">
                        <p className="flex items-center gap-2">
                          <Mail className="h-3.5 w-3.5 shrink-0" />
                          {accountData.account?.email && <CopyableEmail email={accountData.account.email} className="text-sm text-muted-foreground" />}
                        </p>
                        <p className="flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                          Last login: {accountData.account?.lastLoginAt ? formatDate(accountData.account.lastLoginAt) : 'Never'}
                        </p>
                        <p className="flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5 shrink-0" />
                          Created: {formatDate(accountData.account?.createdAt ?? '')}
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* ── Attendance ── */}
          <TabsContent value="attendance" className="mt-4 space-y-4">
            <AttendanceSummary records={attendanceRecords} />
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    Attendance Log — {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}
                  </CardTitle>
                  <Button size="sm" variant="outline" leftIcon={<ClipboardList className="h-3.5 w-3.5" />} onClick={() => navigate(`/attendance?employeeId=${id}`)}>
                    Full log
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {attendanceLoading ? (
                  <div className="p-4 space-y-2">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
                ) : attendanceRecords.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-medium">No attendance records this month</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/40">
                          <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Date</th>
                          <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Status</th>
                          <th className="text-left font-medium text-muted-foreground px-4 py-2.5 hidden sm:table-cell">Check In</th>
                          <th className="text-left font-medium text-muted-foreground px-4 py-2.5 hidden sm:table-cell">Check Out</th>
                          <th className="text-right font-medium text-muted-foreground px-4 py-2.5">Hours</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...attendanceRecords]
                          .sort((a, b) => b.date.localeCompare(a.date))
                          .map(r => (
                            <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                              <td className="px-4 py-2.5 font-medium">{formatDate(r.date)}</td>
                              <td className="px-4 py-2.5">
                                <Badge variant={ATTENDANCE_STATUS_VARIANT[r.status] ?? 'secondary'} className="text-[10px] capitalize">
                                  {labelFor(r.status)}
                                </Badge>
                              </td>
                              <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">
                                {r.checkIn ? new Date(r.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                              </td>
                              <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">
                                {r.checkOut ? new Date(r.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                              </td>
                              <td className="px-4 py-2.5 text-right font-medium">
                                {r.hoursWorked ? `${parseFloat(r.hoursWorked).toFixed(1)}h` : '—'}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Warnings ──────────────────────────────────────────────────── */}
          {canManage && (
            <TabsContent value="warnings" className="mt-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-base">Warnings</CardTitle>
                    <Button size="sm" onClick={() => setWarningDialogOpen(true)}>
                      <Plus className="h-3.5 w-3.5 mr-1.5" />Warning
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {warningsLoading ? (
                    <div className="p-4 space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-10 rounded bg-muted animate-pulse" />)}</div>
                  ) : !warningsData?.length ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm font-medium">No warnings on record</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-muted/40">
                            {['Issue Date', 'Expiry Date', 'Documents', 'Created By', 'Created', 'Actions'].map(h => (
                              <th key={h} className="text-left font-medium text-muted-foreground px-4 py-2.5 whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {warningsData.map(w => (
                            <tr key={w.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                              <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(w.issueDate)}</td>
                              <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{w.expiryDate ? formatDate(w.expiryDate) : '—'}</td>
                              <td className="px-4 py-2.5">
                                {w.documentFileName ? (
                                  <button
                                    className="text-primary hover:underline flex items-center gap-1 text-xs"
                                    onClick={() => downloadWarningDoc.mutate(w.id, {
                                      onSuccess: (res) => window.open(res.url, '_blank'),
                                      onError: (e: Error) => toast.error('Download failed', e.message),
                                    })}
                                  >
                                    <Download className="h-3 w-3" />{w.documentFileName}
                                  </button>
                                ) : '—'}
                              </td>
                              <td className="px-4 py-2.5 text-muted-foreground">{w.createdByName ?? '—'}</td>
                              <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{formatDate(w.createdAt)}</td>
                              <td className="px-4 py-2.5">
                                <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive"
                                  onClick={() => deleteWarning.mutate(w.id, { onError: (e: Error) => toast.error('Failed', e.message) })}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* ── Dependents ────────────────────────────────────────────────── */}
          {canManage && (
            <TabsContent value="dependents" className="mt-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-base">Dependents</CardTitle>
                    <Button size="sm" onClick={() => { setEditingDependent(null); setDependentDialogOpen(true) }}>
                      <Plus className="h-3.5 w-3.5 mr-1.5" />Add Dependent
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {dependentsLoading ? (
                    <div className="p-4 space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-10 rounded bg-muted animate-pulse" />)}</div>
                  ) : !dependentsData?.length ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Heart className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm font-medium">No dependents on file</p>
                      <p className="text-xs mt-1">Add a spouse, child, or other family member.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-muted/40">
                            {['Reference', 'Name', 'Birth Date', 'Relation', 'Nationality', 'Visa No.', 'Medical Ins.', 'Created By', 'Created', ''].map(h => (
                              <th key={h} className="text-left font-medium text-muted-foreground px-4 py-2.5 whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {dependentsData.map(dep => (
                            <tr key={dep.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                              <td className="px-4 py-2.5 font-mono text-[11px]">{dep.reference}</td>
                              <td className="px-4 py-2.5 font-medium">{dep.name}</td>
                              <td className="px-4 py-2.5 text-muted-foreground">{dep.birthDate ? formatDate(dep.birthDate) : '—'}</td>
                              <td className="px-4 py-2.5 capitalize">{dep.relation}</td>
                              <td className="px-4 py-2.5 text-muted-foreground">{dep.nationality ?? '—'}</td>
                              <td className="px-4 py-2.5 text-muted-foreground">{dep.visaNumber ?? '—'}</td>
                              <td className="px-4 py-2.5 text-muted-foreground">{dep.medicalInsurance ?? '—'}</td>
                              <td className="px-4 py-2.5 text-muted-foreground">{dep.createdByName ?? '—'}</td>
                              <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{formatDate(dep.createdAt)}</td>
                              <td className="px-4 py-2.5">
                                <div className="flex gap-1">
                                  <Button size="icon" variant="ghost" className="h-6 w-6"
                                    onClick={() => { setEditingDependent(dep); setDependentDialogOpen(true) }}>
                                    <Edit2 className="h-3 w-3" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive"
                                    onClick={() => deleteDependent.mutate(dep.id, { onError: (e: Error) => toast.error('Failed', e.message) })}>
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* ── Notes ─────────────────────────────────────────────────────── */}
          {canManage && (
            <TabsContent value="notes" className="mt-4">
              <Card>
                <CardHeader><CardTitle className="text-base">HR Notes</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2 items-start">
                    <Textarea
                      placeholder="Add a confidential note about this employee…"
                      value={noteInput}
                      onChange={e => setNoteInput(e.target.value)}
                      rows={2}
                      className="flex-1 resize-none"
                    />
                    <Button size="sm" className="shrink-0"
                      disabled={!noteInput.trim() || addNote.isPending}
                      onClick={() => {
                        if (!noteInput.trim()) return
                        addNote.mutate(noteInput.trim(), {
                          onSuccess: () => { setNoteInput(''); toast.success('Note added') },
                          onError: (e: Error) => toast.error('Failed', e.message),
                        })
                      }}>
                      {addNote.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}
                    </Button>
                  </div>
                  {notesLoading ? (
                    <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 rounded bg-muted animate-pulse" />)}</div>
                  ) : !notesData?.length ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <StickyNote className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm font-medium">No notes yet</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border/40">
                      {notesData.map(note => (
                        <div key={note.id} className="py-3 flex gap-3 first:pt-0">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground whitespace-pre-wrap">{note.content}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {note.createdByName ?? 'Unknown'} · {formatDate(note.createdAt)}
                            </p>
                          </div>
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive shrink-0"
                            onClick={() => deleteNote.mutate(note.id, { onError: (e: Error) => toast.error('Failed', e.message) })}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* ── Updates ───────────────────────────────────────────────────── */}
          {canManage && (
            <TabsContent value="updates" className="mt-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Activity History</CardTitle></CardHeader>
                <CardContent className="p-0">
                  {auditLoading ? (
                    <div className="p-4 space-y-2">{[1, 2, 3, 4, 5].map(i => <div key={i} className="h-10 rounded bg-muted animate-pulse" />)}</div>
                  ) : !auditData?.length ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <History className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm font-medium">No activity recorded</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-muted/40">
                            {['Date', 'Actor', 'Role', 'Action', 'Fields Changed'].map(h => (
                              <th key={h} className="text-left font-medium text-muted-foreground px-4 py-2.5 whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(auditData as ActivityLog[]).map(log => (
                            <tr key={log.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                              <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{formatDate(log.createdAt)}</td>
                              <td className="px-4 py-2.5 font-medium">{log.actorName ?? '—'}</td>
                              <td className="px-4 py-2.5 text-muted-foreground capitalize">{log.actorRole?.replace('_', ' ') ?? '—'}</td>
                              <td className="px-4 py-2.5">
                                <Badge variant="secondary" className="text-[10px] capitalize">{log.action}</Badge>
                              </td>
                              <td className="px-4 py-2.5 text-muted-foreground">
                                {log.changes ? Object.keys(log.changes).join(', ') : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

        </div>
      </Tabs>

      {/* Hidden avatar input */}
      <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleAvatarChange} />

      {editOpen && <EditEmployeeDialog open={editOpen} onOpenChange={setEditOpen} employee={e} />}
      {editEmploymentOpen && canManage && <EditEmploymentDialog open={editEmploymentOpen} onOpenChange={setEditEmploymentOpen} employee={e} />}
      {editPayrollOpen && canManage && <EditPayrollDialog open={editPayrollOpen} onOpenChange={setEditPayrollOpen} employee={e} />}
      {assignAssetOpen && canManage && <AssignAssetToEmployeeDialog open={assignAssetOpen} onOpenChange={setAssignAssetOpen} employee={e} />}
      {canManage && (
        <AddWarningDialog
          open={warningDialogOpen}
          onOpenChange={setWarningDialogOpen}
          onSave={(fd) => createWarning.mutate(fd, {
            onSuccess: () => { setWarningDialogOpen(false); toast.success('Warning added') },
            onError: (e: Error) => toast.error('Failed', e.message),
          })}
          isSaving={createWarning.isPending}
        />
      )}
      {canManage && (
        <DependentFormDialog
          open={dependentDialogOpen}
          onOpenChange={(o) => { setDependentDialogOpen(o); if (!o) setEditingDependent(null) }}
          dependent={editingDependent}
          onSave={(data) => {
            if (editingDependent) {
              updateDependent.mutate({ id: editingDependent.id, ...data }, {
                onSuccess: () => { setDependentDialogOpen(false); setEditingDependent(null); toast.success('Dependent updated') },
                onError: (e: Error) => toast.error('Failed', e.message),
              })
            } else {
              createDependent.mutate(data, {
                onSuccess: () => { setDependentDialogOpen(false); toast.success('Dependent added') },
                onError: (e: Error) => toast.error('Failed', e.message),
              })
            }
          }}
          isSaving={createDependent.isPending || updateDependent.isPending}
        />
      )}
      {inviteOpen && canManage && (
        <InviteEmployeeDialog employee={e} open={inviteOpen} onOpenChange={setInviteOpen} />
      )}
      <DocumentViewerDialog
        open={!!viewDoc}
        onOpenChange={o => !o && setViewDoc(null)}
        documentId={viewDoc?.id ?? null}
        fileName={viewDoc?.fileName}
      />

      {/* Change Salary Dialog */}
      {canManage && id && (
        <ChangeSalaryDialog
          open={changeSalaryOpen}
          onOpenChange={setChangeSalaryOpen}
          employeeId={id}
          currentBasic={e.basicSalary ? parseFloat(String(e.basicSalary)) : null}
          currentTotal={e.totalSalary ? parseFloat(String(e.totalSalary)) : null}
        />
      )}

      {/* Add Document Dialog */}
      {id && (
        <AddDocumentDialog
          open={addDocOpen}
          onOpenChange={setAddDocOpen}
          employeeId={id}
        />
      )}

      {/* Create Review Dialog */}
      {canManage && id && (
        <CreatePerformanceReviewDialog
          open={createReviewOpen}
          onOpenChange={setCreateReviewOpen}
          lockedEmployeeId={id}
        />
      )}

      {/* Transfer Dialog */}
      {canManage && id && (
        <TransferDialog
          open={transferOpen}
          onOpenChange={setTransferOpen}
          employeeId={id}
          orgUnits={orgUnits}
          currentDept={orgUnitName(e.departmentId) ?? e.department}
          currentDeptId={e.departmentId}
        />
      )}
    </PageWrapper>
  )
}

// ─── Dependent Form Dialog ─────────────────────────────────────────────────────

type DependentFormData = Omit<Dependent, 'id' | 'employeeId' | 'reference' | 'createdByName' | 'createdAt' | 'updatedAt'>

function DependentFormDialog({
  open, onOpenChange, dependent, onSave, isSaving,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  dependent: Dependent | null
  onSave: (data: DependentFormData) => void
  isSaving: boolean
}) {
  const blank: DependentFormData = { name: '', birthDate: null, relation: 'spouse', nationality: null, visaNumber: null, medicalInsurance: null }
  const [form, setForm] = React.useState<DependentFormData>(blank)

  React.useEffect(() => {
    if (open) setForm(dependent ? {
      name: dependent.name,
      birthDate: dependent.birthDate,
      relation: dependent.relation,
      nationality: dependent.nationality,
      visaNumber: dependent.visaNumber,
      medicalInsurance: dependent.medicalInsurance,
    } : blank)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const set = (k: keyof DependentFormData, v: string | null) => setForm(f => ({ ...f, [k]: v || null }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{dependent ? 'Edit Dependent' : 'Add Dependent'}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="col-span-2 space-y-1.5">
            <Label>Full Name *</Label>
            <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Sarah Johnson" />
          </div>
          <div className="space-y-1.5">
            <Label>Relation *</Label>
            <Select value={form.relation} onValueChange={v => set('relation', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(['spouse', 'child', 'parent', 'sibling', 'other'] as const).map(r => (
                  <SelectItem key={r} value={r} className="capitalize">{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Date of Birth</Label>
            <Input type="date" value={form.birthDate ?? ''} onChange={e => set('birthDate', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Nationality</Label>
            <Input value={form.nationality ?? ''} onChange={e => set('nationality', e.target.value)} placeholder="e.g. UAE" />
          </div>
          <div className="space-y-1.5">
            <Label>Visa Number</Label>
            <Input value={form.visaNumber ?? ''} onChange={e => set('visaNumber', e.target.value)} placeholder="Optional" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Medical Insurance</Label>
            <Input value={form.medicalInsurance ?? ''} onChange={e => set('medicalInsurance', e.target.value)} placeholder="Policy number or provider" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!form.name.trim() || isSaving} onClick={() => onSave(form)}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {dependent ? 'Save Changes' : 'Add Dependent'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Add Warning Dialog ────────────────────────────────────────────────────────

function AddWarningDialog({
  open, onOpenChange, onSave, isSaving,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onSave: (input: CreateWarningInput) => void
  isSaving: boolean
}) {
  const [issueDate, setIssueDate] = React.useState('')
  const [expiryDate, setExpiryDate] = React.useState('')
  const [reason, setReason] = React.useState('')
  const [file, setFile] = React.useState<File | null>(null)
  const [dragging, setDragging] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (!open) { setIssueDate(''); setExpiryDate(''); setReason(''); setFile(null); setDragging(false) }
  }, [open])

  function pickFile(f: File | null | undefined) {
    if (!f) return
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    if (!allowed.includes(f.type) && !f.name.match(/\.(pdf|jpg|jpeg|png|webp|docx?)$/i)) {
      toast.error('Invalid file type', 'PDF, image or Word document only.')
      return
    }
    if (f.size > 10 * 1024 * 1024) { toast.error('File too large', 'Maximum 10 MB.'); return }
    setFile(f)
  }

  function handleSubmit() {
    if (!issueDate) { toast.warning('Issue date required'); return }
    onSave({
      issueDate,
      expiryDate: expiryDate || undefined,
      reason: reason.trim() || undefined,
      file: file ?? undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle>Add Warning</DialogTitle>
        </DialogHeader>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Issue date <span className="text-destructive">*</span></Label>
              <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)}
                className={cn(!issueDate && 'border-destructive focus-visible:ring-destructive')} />
            </div>
            <div className="space-y-1.5">
              <Label>Expiry date</Label>
              <Input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Textarea value={reason} onChange={e => setReason(e.target.value)}
              placeholder="Describe the reason for this warning…" rows={4} className="resize-none" />
          </div>
          {/* File upload dropzone */}
          <div
            className={cn(
              'border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors text-center',
              dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-muted/30',
            )}
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files[0]) }}
          >
            {file ? (
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-primary shrink-0" />
                <span className="truncate max-w-[240px]">{file.name}</span>
                <button className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={e => { e.stopPropagation(); setFile(null) }}>
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <>
                <Upload className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Upload supporting document</p>
                <p className="text-xs text-muted-foreground">PDF, image or Word · max 10 MB</p>
              </>
            )}
          </div>
          <input ref={fileRef} type="file" className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
            onChange={e => pickFile(e.target.files?.[0])} />
        </div>
        <DialogFooter className="px-6 py-4 border-t bg-muted/30">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!issueDate || isSaving} onClick={handleSubmit}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
