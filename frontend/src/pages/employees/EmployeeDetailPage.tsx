import React from 'react'
import { useTranslation } from 'react-i18next'
import { labelFor, VISA_TYPE_LABELS, ROLE_BADGE_STYLE, ROLE_LABELS, DOC_STATUS_BADGE } from '@/lib/enums'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, User, Briefcase, Plane, FileText, CreditCard, Star,
  Phone, Mail, MapPin, Calendar, Building2, Hash, Shield, Edit2,
  Clock, Download, Eye, Camera, Loader2, Plus, Package,
  CalendarDays, ClipboardList, UserCheck, Users, GraduationCap, Landmark, DollarSign,
  ArrowRightLeft, Heart, StickyNote, History, Trash2, AlertTriangle, Upload, X as XIcon,
  MoreHorizontal, CheckCircle2, Ban, UserX, Search, FolderOpen, Scale, AlertCircle,
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/ui/overlays'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { OverflowTabsList, type TabDef } from '@/components/shared/OverflowTabsList'
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
import { cn, formatDate, formatDateTime, formatCurrency, formatFileSize, getInitials } from '@/lib/utils'
import { useEmployee, useUpdateEmployee, useUploadEmployeeAvatar, useEmployeeAccount, useSalaryHistory, useRecordSalaryRevision, useUpdateEmployeeStatus, useArchiveEmployee } from '@/hooks/useEmployees'
import type { SalaryHistoryFilters } from '@/hooks/useEmployees'
import { useDesignations, useCreateDesignation } from '@/hooks/useDesignations'
import { useOrgUnits } from '@/hooks/useOrgUnits'
import { useEmployeeTeams, useTeamMembers, type TeamMemberRole } from '@/hooks/useTeams'
import { useDocuments, useVerifyDocument, useRejectDocument } from '@/hooks/useDocuments'
import { usePerformanceReviews } from '@/hooks/usePerformance'
import { CreatePerformanceReviewDialog } from '@/components/shared/CreatePerformanceReviewDialog'
import { AddDocumentDialog } from '@/components/shared/AddDocumentDialog'
import { EmployeeLeavePanel } from '@/components/shared/EmployeeLeavePanel'
import { EmployeeLoansPanel } from '@/components/shared/EmployeeLoansPanel'
import { ExpiryStatus } from '@/components/shared/ExpiryStatus'
import { useEmployeeAssets } from '@/hooks/useAssets'
import { useAttendance } from '@/hooks/useAttendance'
import { useEmployeeTransfers, useCreateTransfer } from '@/hooks/useTransfers'
import { useLoans } from '@/hooks/useLoans'
import { useDependents, useCreateDependent, useUpdateDependent, useDeleteDependent, useEmployeeNotes, useAddEmployeeNote, useDeleteEmployeeNote, type Dependent } from '@/hooks/useEmployeeDependents'
import { useActivityLogs, type ActivityLog } from '@/hooks/useAudit'
import { useEmployeeWarnings, useCreateEmployeeWarning, useDeleteEmployeeWarning, useWarningDocumentUrl, type CreateWarningInput } from '@/hooks/useEmployeeWarnings'
import { useSponsoringEntities, useCreateSponsoringEntity, type SponsoringEntity } from '@/hooks/useSponsoringEntities'
import { useEmployeeTraining, TRAINING_STATUS_STYLE, type TrainingRecord } from '@/hooks/useTraining'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { EditEmployeeDialog, EditEmploymentDialog, EditPayrollDialog, AssignAssetToEmployeeDialog } from '@/components/shared/action-dialogs'
import { InviteEmployeeDialog } from '@/components/shared/InviteEmployeeDialog'
import { DocumentViewerDialog } from '@/components/shared/DocumentViewerDialog'
import { toast } from '@/components/ui/overlays'
import { api } from '@/lib/api'
import { usePermissions } from '@/hooks/usePermissions'
import { CopyableEmail, CopyablePhone, ActionBadge, MetaItem } from '@/components/shared'
import { resolveCountryIso } from '@/components/shared/PhoneInput'

/** Convert an ISO-2 country code into its regional-indicator flag emoji. */
function isoToFlag(iso: string | null | undefined): string {
  if (!iso || iso.length !== 2) return ''
  const codePoints = iso.toUpperCase().split('').map(c => 127397 + c.charCodeAt(0))
  return String.fromCodePoint(...codePoints)
}
import type { Employee } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DocRecord {
  id: string
  fileName?: string
  docType?: string
  category: string
  status: string
  docNumber?: string | null
  issueDate?: string | null
  expiryDate?: string | null
  fileSize?: number | null
  notes?: string | null
  createdAt: string
  verifiedAt?: string | null
  verifiedByName?: string | null
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

const InfoRow = React.memo(function InfoRow({ label, value, icon: Icon, trailing }: { label: string; value?: string | null; icon?: React.ElementType; trailing?: React.ReactNode }) {
  // Hide rows that have no real value — keeps the layout tight and free of "—" filler.
  const hasValue = value !== undefined && value !== null && String(value).trim() !== ''
  if (!hasValue && !trailing) return null
  return (
    <div className="flex items-center gap-3 py-3 border-b border-border/40 last:border-0">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0" />}
      <span className="text-sm text-muted-foreground w-36 shrink-0">{label}</span>
      <span className="text-sm font-medium text-foreground truncate flex-1">{hasValue ? value : ''}</span>
      {trailing && <span className="shrink-0">{trailing}</span>}
    </div>
  )
})

/** Compact stacked label + value cell for the Employment Details grid */
const EmpField = React.memo(function EmpField({
  label, value, icon: Icon, children,
}: { label: string; value?: string | null; icon?: React.ElementType; children?: React.ReactNode }) {
  return (
    <div className="space-y-1 min-w-0">
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
        <p className="text-xs text-muted-foreground leading-none">{label}</p>
      </div>
      {children
        ? <div>{children}</div>
        : <p className="text-sm font-medium text-foreground truncate">{value || '—'}</p>}
    </div>
  )
})

const EmployeeStatusBadge = React.memo(function EmployeeStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={STATUS_VARIANT[status] ?? 'secondary'} className="text-[11px] mt-0.5">
      {labelFor(status)}
    </Badge>
  )
})

type StatTone = 'blue' | 'emerald' | 'violet' | 'amber' | 'rose' | 'teal' | 'slate' | 'indigo'

/** Icon-only colour accent — keeps the tile background flat & professional. */
const STAT_ICON_TONE: Record<StatTone, string> = {
  blue:    'text-blue-600',
  emerald: 'text-emerald-600',
  violet:  'text-violet-600',
  amber:   'text-amber-600',
  rose:    'text-rose-600',
  teal:    'text-teal-600',
  slate:   'text-slate-600',
  indigo:  'text-indigo-600',
}

/** Number of documents shown per category before "Show more" appears. */
const DOC_PAGE_SIZE = 5

/** Inline loading indicator used across the page (Account timeline cells, etc.). */
const INLINE_SPINNER = <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />


/** Compact stat tile — flat background, colour signal lives only on the icon. */
const StatTile = React.memo(function StatTile({
  icon: Icon, label, value, trailing, valueClass, tone = 'slate',
}: {
  icon?: React.ElementType
  label: string
  value: React.ReactNode
  trailing?: React.ReactNode
  valueClass?: string
  tone?: StatTone
}) {
  // Always render the tile so the label remains visible even when no value is set;
  // empty values fall back to a muted "—" placeholder.
  const isEmpty =
    value === null
    || value === undefined
    || value === ''
    || (typeof value === 'number' && Number.isNaN(value))
  return (
    <div className="px-3.5 py-2.5 min-w-0">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {Icon && <Icon className={cn('h-3 w-3 shrink-0', STAT_ICON_TONE[tone])} />}
        <span className="truncate">{label}</span>
      </div>
      <div className="flex items-center justify-between gap-2 mt-1">
        <span className={cn(
          'text-sm font-semibold truncate',
          isEmpty ? 'text-muted-foreground/60' : 'text-foreground',
          valueClass,
        )}>
          {isEmpty ? '—' : value}
        </span>
        {trailing && <span className="shrink-0">{trailing}</span>}
      </div>
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
  currentHousing?: number | null
  currentTransport?: number | null
  currentOther?: number | null
}

function ChangeSalaryDialog({ open, onOpenChange, employeeId, currentBasic, currentTotal, currentHousing, currentTransport, currentOther }: ChangeSalaryDialogProps) {
  const mutation = useRecordSalaryRevision(employeeId)

  const [effectiveDate, setEffectiveDate] = React.useState('')
  const [revisionType, setRevisionType] = React.useState('increment')
  const [newBasic, setNewBasic] = React.useState(() => currentBasic != null ? String(currentBasic) : '')
  const [newHousing, setNewHousing] = React.useState(() => currentHousing != null ? String(currentHousing) : '')
  const [newTransport, setNewTransport] = React.useState(() => currentTransport != null ? String(currentTransport) : '')
  const [newOther, setNewOther] = React.useState(() => currentOther != null ? String(currentOther) : '')
  const [remarks, setRemarks] = React.useState('')

  // Auto-compute total from components
  const basicNum = parseFloat(newBasic) || 0
  const housingNum = parseFloat(newHousing) || 0
  const transportNum = parseFloat(newTransport) || 0
  const otherNum = parseFloat(newOther) || 0
  const computedTotal = basicNum > 0 ? basicNum + housingNum + transportNum + otherNum : null

  function resetForm() {
    setEffectiveDate('')
    setRevisionType('increment')
    setNewBasic(currentBasic != null ? String(currentBasic) : '')
    setNewHousing(currentHousing != null ? String(currentHousing) : '')
    setNewTransport(currentTransport != null ? String(currentTransport) : '')
    setNewOther(currentOther != null ? String(currentOther) : '')
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

    mutation.mutate(
      {
        effectiveDate,
        revisionType,
        newBasicSalary: parseFloat(newBasic),
        newHousingAllowance: parseFloat(newHousing) || 0,
        newTransportAllowance: parseFloat(newTransport) || 0,
        newOtherAllowances: parseFloat(newOther) || 0,
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

  const prevTotal = currentTotal ?? ((currentBasic ?? 0) + (currentHousing ?? 0) + (currentTransport ?? 0) + (currentOther ?? 0))
  const displayTotal = computedTotal ?? prevTotal
  const diff = computedTotal != null && prevTotal > 0 ? computedTotal - prevTotal : null

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-lg font-semibold">Change Salary</DialogTitle>
          <p className="text-sm text-muted-foreground mt-0.5">Record a salary revision and update the employee's compensation package.</p>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">

            {/* Effective date + Revision type */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cs-date" className="text-sm font-medium">
                  Effective Date <span className="text-destructive">*</span>
                </Label>
                <DatePicker
                  id="cs-date"
                  value={effectiveDate}
                  onChange={setEffectiveDate}
                  placeholder="Select date"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cs-type" className="text-sm font-medium">
                  Revision Type <span className="text-destructive">*</span>
                </Label>
                <Select value={revisionType} onValueChange={setRevisionType}>
                  <SelectTrigger id="cs-type" className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(REVISION_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Current package summary */}
            {(currentBasic != null || currentHousing != null || currentTransport != null || currentOther != null) && (
              <div className="rounded-lg border bg-muted/30 px-4 py-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Current Package</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: 'Basic', value: currentBasic },
                    { label: 'Housing', value: currentHousing },
                    { label: 'Transport', value: currentTransport },
                    { label: 'Other', value: currentOther },
                  ].map(({ label, value }) => (
                    <div key={label} className="text-center">
                      <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
                      <p className="text-xs font-semibold tabular-nums">{value != null ? formatCurrency(value) : '—'}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Basic salary */}
            <div className="space-y-1.5">
              <Label htmlFor="cs-basic" className="text-sm font-medium">
                Basic Salary <span className="text-muted-foreground font-normal text-xs">(AED)</span> <span className="text-destructive">*</span>
              </Label>
              <NumericInput id="cs-basic" placeholder="0.00" value={newBasic} onChange={e => setNewBasic(e.target.value)} className="h-9" />
            </div>

            {/* Allowances — 3 equal columns */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Allowances <span className="font-normal">(optional)</span></p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cs-housing" className="text-xs text-muted-foreground">Housing</Label>
                  <NumericInput id="cs-housing" placeholder="0.00" value={newHousing} onChange={e => setNewHousing(e.target.value)} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cs-transport" className="text-xs text-muted-foreground">Transport</Label>
                  <NumericInput id="cs-transport" placeholder="0.00" value={newTransport} onChange={e => setNewTransport(e.target.value)} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cs-other" className="text-xs text-muted-foreground">Other</Label>
                  <NumericInput id="cs-other" placeholder="0.00" value={newOther} onChange={e => setNewOther(e.target.value)} className="h-9" />
                </div>
              </div>
            </div>

            {/* Total package — always visible */}
            <div className="rounded-lg border bg-primary/5 border-primary/20 px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    {computedTotal != null ? 'New Total Package' : 'Current Total Package'}
                  </p>
                  <p className="text-xl font-bold tabular-nums mt-0.5">{formatCurrency(displayTotal)}</p>
                </div>
                {diff != null && (
                  <div className={cn(
                    'text-right px-3 py-1.5 rounded-md text-sm font-semibold',
                    diff > 0 ? 'bg-green-100 text-green-700' : diff < 0 ? 'bg-red-100 text-red-700' : 'bg-muted text-muted-foreground'
                  )}>
                    <p className="text-xs font-normal mb-0.5">vs current</p>
                    {diff > 0 ? '+' : ''}{formatCurrency(diff)}
                  </div>
                )}
              </div>
            </div>

            {/* Remarks */}
            <div className="space-y-1.5">
              <Label htmlFor="cs-remarks" className="text-sm font-medium text-muted-foreground">
                Remarks / Reason <span className="text-xs font-normal">(optional)</span>
              </Label>
              <Textarea
                id="cs-remarks"
                placeholder="Reason for salary change…"
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                rows={2}
                className="resize-none text-sm"
              />
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t bg-muted/20">
            <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Saving…</>
                : 'Save Revision'}
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
  orgUnits: Array<{ id: string; name: string; type: string; parentId: string | null }>
  currentDept?: string | null
  currentDeptId?: string | null
}

function TransferDialog({ open, onOpenChange, employeeId, orgUnits, currentDept, currentDeptId }: TransferDialogProps) {
  const mutation = useCreateTransfer(employeeId)
  const { data: designationList = [] } = useDesignations()
  const createDesignation = useCreateDesignation()

  const [transferDate, setTransferDate] = React.useState('')
  const [departmentId, setDepartmentId] = React.useState('')
  const [toDesignation, setToDesignation] = React.useState('')
  const [reason, setReason] = React.useState('')
  const [notes, setNotes] = React.useState('')

  // Build flat department options with full breadcrumb path (Branch → Division → Department)
  const deptOptions: ComboboxOption[] = React.useMemo(() => {
    return orgUnits
      .filter(u => u.type === 'department')
      .map(dept => {
        const division = orgUnits.find(u => u.id === dept.parentId && u.type === 'division')
        const branch = division ? orgUnits.find(u => u.id === division.parentId && u.type === 'branch') : null
        const parts = [branch?.name, division?.name, dept.name].filter(Boolean)
        return { value: dept.id, label: parts.join(' → ') }
      })
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [orgUnits])

  const selectedDeptOpt = deptOptions.find(o => o.value === departmentId)
  const fromLabel = currentDept ?? (currentDeptId ? orgUnits.find(u => u.id === currentDeptId)?.name : null) ?? 'Current department'

  function resetForm() {
    setTransferDate('')
    setDepartmentId('')
    setToDesignation('')
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
    if (!departmentId) {
      toast.error('Required', 'Please select a department to transfer to.')
      return
    }

    // Derive branch/division IDs from the selected department's parent chain
    const dept = orgUnits.find(u => u.id === departmentId)
    const division = dept ? orgUnits.find(u => u.id === dept.parentId && u.type === 'division') : null
    const branch = division ? orgUnits.find(u => u.id === division.parentId && u.type === 'branch') : null

    // Auto-create designation if it doesn't exist yet
    if (toDesignation) {
      const exists = (Array.isArray(designationList) ? designationList : [])
        .some((d: { name: string; isActive: boolean }) => d.isActive && d.name.toLowerCase() === toDesignation.toLowerCase())
      if (!exists) await createDesignation.mutateAsync({ name: toDesignation })
    }

    try {
      await mutation.mutateAsync({
        transferDate,
        toBranchId: branch?.id ?? null,
        toDivisionId: division?.id ?? null,
        toDepartmentId: departmentId,
        toDesignation: toDesignation || null,
        newSalary: null,
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
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-lg font-semibold">Transfer Employee</DialogTitle>
          <p className="text-sm text-muted-foreground mt-0.5">Move the employee to a new department or branch.</p>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Transfer Date <span className="text-destructive">*</span></Label>
              <DatePicker value={transferDate} onChange={v => setTransferDate(v ?? '')} placeholder="Select transfer date" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Department <span className="text-destructive">*</span></Label>
              <Combobox
                options={deptOptions}
                value={departmentId}
                onValueChange={setDepartmentId}
                placeholder="Search department…"
                emptyMessage="No departments found"
              />
              {selectedDeptOpt && (
                <div className="rounded-lg border bg-muted/30 px-4 py-3 mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
                  <span className="text-muted-foreground font-semibold uppercase tracking-wide text-[10px] pt-px">From</span>
                  <span className="font-medium text-foreground break-words min-w-0">{fromLabel}</span>
                  <span className="text-muted-foreground font-semibold uppercase tracking-wide text-[10px] pt-px">To</span>
                  <span className="font-semibold text-primary break-words min-w-0">{selectedDeptOpt.label}</span>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-muted-foreground">New Designation <span className="text-xs font-normal">(optional)</span></Label>
              <Combobox
                value={toDesignation}
                onValueChange={setToDesignation}
                options={(Array.isArray(designationList) ? designationList : [])
                  .filter((d: { isActive: boolean }) => d.isActive)
                  .map((d: { name: string }) => ({ value: d.name, label: d.name }))}
                placeholder="Select or type designation…"
                searchPlaceholder="Search or create…"
                clearable
                creatable
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-muted-foreground">Reason <span className="text-xs font-normal">(optional)</span></Label>
                <Textarea placeholder="Reason for transfer…" value={reason} onChange={e => setReason(e.target.value)} rows={2} className="resize-none text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-muted-foreground">Notes <span className="text-xs font-normal">(optional)</span></Label>
                <Textarea placeholder="Additional notes…" value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="resize-none text-sm" />
              </div>
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t bg-muted/20">
            <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending || !transferDate || !departmentId}>
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

// ─── Document category/status config (static — outside component) ─────────────

const DOC_CATEGORY_CONFIG: Record<string, { label: string; Icon: React.ComponentType<{ className?: string }>; iconCls: string; bgCls: string }> = {
  identity:      { label: 'Identity',      Icon: CreditCard,     iconCls: 'text-blue-600',   bgCls: 'bg-blue-50 border-blue-200' },
  visa:          { label: 'Visa',           Icon: Plane,          iconCls: 'text-violet-600', bgCls: 'bg-violet-50 border-violet-200' },
  employment:    { label: 'Employment',     Icon: Briefcase,      iconCls: 'text-emerald-600',bgCls: 'bg-emerald-50 border-emerald-200' },
  company:       { label: 'Company',        Icon: Building2,      iconCls: 'text-orange-600', bgCls: 'bg-orange-50 border-orange-200' },
  insurance:     { label: 'Insurance',      Icon: Shield,         iconCls: 'text-cyan-600',   bgCls: 'bg-cyan-50 border-cyan-200' },
  qualification: { label: 'Qualification',  Icon: GraduationCap,  iconCls: 'text-indigo-600', bgCls: 'bg-indigo-50 border-indigo-200' },
  financial:     { label: 'Financial',      Icon: DollarSign,     iconCls: 'text-amber-600',  bgCls: 'bg-amber-50 border-amber-200' },
  compliance:    { label: 'Compliance',     Icon: Scale,          iconCls: 'text-teal-600',   bgCls: 'bg-teal-50 border-teal-200' },
}

// ─── Team membership row (shared helpers) ───────────────────────────────────

const TEAM_ROLE_TONE: Record<TeamMemberRole, string> = {
  viewer:        'bg-slate-100 text-slate-700 border-slate-200',
  member:        'bg-blue-100 text-blue-800 border-blue-200',
  manager:       'bg-amber-100 text-amber-800 border-amber-200',
  administrator: 'bg-violet-100 text-violet-800 border-violet-200',
}

const TeamMembershipRow = React.memo(function TeamMembershipRow({
  team,
  branchName, divisionName, departmentName,
}: {
  team: { id: string; name: string; memberCount: number; joinedAt: string; role: TeamMemberRole }
  branchName?: string | null
  divisionName?: string | null
  departmentName?: string | null
}) {
  const { data: members = [] } = useTeamMembers(team.id)
  const previewCount = Math.min(team.memberCount, 5)
  const previewMembers = members.slice(0, 5)
  const overflow = team.memberCount > 5 ? team.memberCount - 5 : 0

  const orgPath = [branchName, divisionName, departmentName].filter(Boolean) as string[]

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors min-w-0">
      {/* Team icon */}
      <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
        <Users className="h-3.5 w-3.5 text-primary" />
      </div>

      {/* Team name + org breadcrumb */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold text-foreground truncate leading-tight">{team.name}</p>
          <span className={cn(
            'inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none shrink-0',
            TEAM_ROLE_TONE[team.role] ?? TEAM_ROLE_TONE.member,
          )}>
            {team.role.charAt(0).toUpperCase() + team.role.slice(1)}
          </span>
        </div>
        {orgPath.length > 0 && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5 truncate">
            <Building2 className="h-2.5 w-2.5 shrink-0" />
            {orgPath.map((p, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="opacity-40">›</span>}
                <span className={i === orgPath.length - 1 ? 'font-medium text-foreground/80' : ''}>{p}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Member avatar stack */}
      {team.memberCount > 0 && (
        <div className="hidden sm:flex -space-x-2 shrink-0">
          {members.length === 0
            ? [...Array(previewCount)].map((_, i) => (
              <div key={i} className="h-7 w-7 rounded-full border-2 border-card bg-muted shrink-0" />
            ))
            : previewMembers.map(m => (
              <Avatar key={m.id} className="h-7 w-7 border-2 border-card shrink-0" title={`${m.firstName} ${m.lastName}`}>
                {m.avatarUrl && <AvatarImage src={m.avatarUrl} />}
                <AvatarFallback className="text-[9px] font-semibold bg-primary/10 text-primary">
                  {getInitials(`${m.firstName} ${m.lastName}`)}
                </AvatarFallback>
              </Avatar>
            ))
          }
          {overflow > 0 && (
            <div className="h-7 w-7 rounded-full border-2 border-card bg-muted flex items-center justify-center shrink-0">
              <span className="text-[9px] font-semibold text-muted-foreground tabular-nums">+{overflow}</span>
            </div>
          )}
        </div>
      )}

      {/* Joined date */}
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums shrink-0 hidden md:flex">
        <Calendar className="h-3 w-3" />
        {formatDate(team.joinedAt)}
      </span>
    </div>
  )
})

// ─── Main page ────────────────────────────────────────────────────────────────

export function EmployeeDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const nowMs = React.useMemo(() => Date.now(), [])
  const navigate = useNavigate()
  const { can } = usePermissions()
  const canManage = can('manage_employees')
  const canManageDocuments = can('manage_documents')

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

  const docs = React.useMemo<DocRecord[]>(
    () => (docsResult?.data as DocRecord[] | undefined) ?? [],
    [docsResult],
  )

  const { data: accountData, isLoading: accountLoading } = useEmployeeAccount(canManage ? id : undefined)
  const { data: employeeTeams = [] } = useEmployeeTeams(id)

  // Salary history — filter state must be declared before the hook call to avoid TDZ
  const [salaryHistoryFilters, setSalaryHistoryFilters] = React.useState<SalaryHistoryFilters>({})
  const { data: salaryHistoryData, isLoading: salaryHistoryLoading } = useSalaryHistory(
    canManage ? (id ?? '') : '',
    salaryHistoryFilters,
  )

  // Transfer history
  const { data: transfersData, isLoading: transfersLoading } = useEmployeeTransfers(id)

  // Active/pending loans for this employee — drives the hero "Loans" tile.
  const { data: employeeLoansData } = useLoans(canManage && id ? { employeeId: id, limit: 25 } : undefined)
  const employeeLoanSummary = (() => {
    if (!employeeLoansData?.data) return null
    const active = employeeLoansData.data.filter(l => l.status === 'active')
    if (active.length === 0) return null
    const outstanding = active.reduce((n, l) => n + Number(l.remainingBalance ?? l.amount ?? 0), 0)
    return { count: active.length, outstanding }
  })()

  // Training history
  const { data: trainingData, isLoading: trainingLoading } = useEmployeeTraining(canManage ? id : undefined)

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
  const updateStatus = useUpdateEmployeeStatus()
  const archiveEmployee = useArchiveEmployee()
  const verifyDocument = useVerifyDocument()
  const rejectDocument = useRejectDocument()
  const [activeTab, setActiveTab] = React.useState('personal')
  const [statusTarget, setStatusTarget] = React.useState<{ status: 'active' | 'suspended' | 'terminated' } | null>(null)
  const [archiveConfirm, setArchiveConfirm] = React.useState(false)
  const [editOpen, setEditOpen] = React.useState(false)
  const [editEmploymentOpen, setEditEmploymentOpen] = React.useState(false)
  const [editPayrollOpen, setEditPayrollOpen] = React.useState(false)
  const [inviteOpen, setInviteOpen] = React.useState(false)
  const [viewDoc, setViewDoc] = React.useState<{ id: string; fileName?: string } | null>(null)
  const [rejectDocId, setRejectDocId] = React.useState<string | null>(null)
  const [rejectDocReason, setRejectDocReason] = React.useState('')
  const [visaEditOpen, setVisaEditOpen] = React.useState(false)
  const [visaForm, setVisaForm] = React.useState({
    visaType: '', visaNumber: '', visaIssueDate: '', visaExpiry: '',
    sponsoringEntityId: '', emiratesId: '', emiratesIdExpiry: '',
    passportNo: '', passportExpiry: '', labourCardNumber: '', labourCardExpiry: '',
  })
  const [changeSalaryOpen, setChangeSalaryOpen] = React.useState(false)
  const [viewRevision, setViewRevision] = React.useState<import('@/hooks/useEmployees').SalaryRevision | null>(null)
  const [transferOpen, setTransferOpen] = React.useState(false)
  const [createReviewOpen, setCreateReviewOpen] = React.useState(false)
  const [addDocOpen, setAddDocOpen] = React.useState(false)
  const [assignAssetOpen, setAssignAssetOpen] = React.useState(false)
  const [dependentDialogOpen, setDependentDialogOpen] = React.useState(false)
  const [editingDependent, setEditingDependent] = React.useState<Dependent | null>(null)
  const [noteInput, setNoteInput] = React.useState('')
  const [warningDialogOpen, setWarningDialogOpen] = React.useState(false)
  const [docSearch, setDocSearch] = React.useState('')
  const [docVisibleByCategory, setDocVisibleByCategory] = React.useState<Map<string, number>>(new Map())
  const avatarInputRef = React.useRef<HTMLInputElement>(null)

  const filteredDocs = React.useMemo(() => {
    if (!docSearch.trim()) return docs
    const q = docSearch.toLowerCase()
    return docs.filter(d =>
      d.docType?.toLowerCase().includes(q) ||
      d.fileName?.toLowerCase().includes(q) ||
      (d.category && DOC_CATEGORY_CONFIG[d.category]?.label.toLowerCase().includes(q)),
    )
  }, [docs, docSearch])

  const docsByCategory = React.useMemo(() => {
    const CATEGORY_ORDER = ['identity', 'visa', 'employment', 'company', 'insurance', 'qualification', 'financial', 'compliance']
    // LIFO — newest upload first within each category.
    const sorted = [...filteredDocs].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return tb - ta
    })
    const groups: Record<string, DocRecord[]> = {}
    for (const doc of sorted) {
      const key = doc.category || 'other'
      if (!groups[key]) groups[key] = []
      groups[key].push(doc)
    }
    const ordered: Array<[string, DocRecord[]]> = CATEGORY_ORDER.filter(k => groups[k]).map(k => [k, groups[k]])
    const rest = Object.entries(groups).filter(([k]) => !CATEGORY_ORDER.includes(k))
    return [...ordered, ...rest]
  }, [filteredDocs])

  const docStats = React.useMemo(() => ({
    valid:    docs.filter(d => d.status === 'valid').length,
    expiring: docs.filter(d => d.status === 'expiring_soon').length,
    expired:  docs.filter(d => d.status === 'expired').length,
    pending:  docs.filter(d => d.status === 'pending_upload' || d.status === 'under_review').length,
    rejected: docs.filter(d => d.status === 'rejected').length,
  }), [docs])

  const e = employee

  // Terminated or suspended employees must not be granted/managed system access
  const isAccessRestricted = ['terminated', 'suspended'].includes(e?.status ?? '')

  const STATUS_CONFIG = {
    active:     { label: 'Activate',  past: 'activated',  confirmLabel: 'Activate',  variant: 'success'     as const, description: 'This will set the employee status back to active.' },
    suspended:  { label: 'Suspend',   past: 'suspended',  confirmLabel: 'Suspend',   variant: 'warning'     as const, description: 'The employee will be suspended and cannot log in.' },
    terminated: { label: 'Terminate', past: 'terminated', confirmLabel: 'Terminate', variant: 'destructive' as const, description: 'This will mark the employee as terminated. This can be reversed later.' },
  }

  function handleStatusChange() {
    if (!statusTarget || !e) return
    updateStatus.mutate({ id: e.id, status: statusTarget.status }, {
      onSuccess: () => {
        const cfg = STATUS_CONFIG[statusTarget.status]
        toast.success('Status updated', `${e.fullName} has been ${cfg.past}.`)
        setStatusTarget(null)
      },
      onError: () => {
        toast.error('Failed', 'Could not update status. Please try again.')
        setStatusTarget(null)
      },
    })
  }

  function handleArchive() {
    if (!e) return
    archiveEmployee.mutate(e.id, {
      onSuccess: () => {
        toast.success('Record archived', `${e.fullName}'s record has been archived.`)
        navigate('/employees')
      },
      onError: () => {
        toast.error('Failed', 'Could not archive employee record.')
        setArchiveConfirm(false)
      },
    })
  }

  const visaDays = e?.visaExpiry ? Math.ceil((new Date(e.visaExpiry).getTime() - nowMs) / 86400000) : null

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
        <CardContent className="p-0">
          {/* ── Zone 1: Identity row ── */}
          <div className="flex flex-col sm:flex-row gap-4 p-4 sm:p-5">
            {/* Avatar */}
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

            {/* Identity + actions */}
            <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="min-w-0">
                {/* Row 1: name + status badge (right of name) */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-xl sm:text-2xl font-semibold tracking-tight font-display truncate">{e.fullName}</h1>
                  <Badge variant={STATUS_VARIANT[e.status] ?? 'secondary'} className="capitalize text-[10px] shrink-0">
                    {labelFor(e.status)}
                  </Badge>
                </div>
                {/* Row 2: designation + employeeNo */}
                <p className="text-sm text-muted-foreground mt-0.5 truncate">
                  {e.designation ?? '—'}
                  <span className="text-muted-foreground/60"> · </span>
                  <span className="font-mono tabular-nums">{e.employeeNo}</span>
                </p>
                {/* Row 3: contacts */}
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
                {/* Row 4: org breadcrumb under email */}
                {(() => {
                  const parts = [
                    orgUnitName(e.branchId),
                    orgUnitName(e.divisionId),
                    orgUnitName(e.departmentId) ?? e.department,
                  ].filter(Boolean) as string[]
                  return parts.length > 0 ? (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1.5">
                      <Building2 className="h-3.5 w-3.5 shrink-0" />
                      <span className="flex items-center gap-1 min-w-0 truncate">
                        {parts.map((p, i) => (
                          <span key={i} className="flex items-center gap-1">
                            {i > 0 && <span className="opacity-40">›</span>}
                            <span className={i === parts.length - 1 ? 'font-medium text-foreground/80' : ''}>{p}</span>
                          </span>
                        ))}
                      </span>
                    </div>
                  ) : null
                })()}
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                <Button variant="outline" size="sm" leftIcon={<Download className="h-3.5 w-3.5" />} onClick={() => exportCSV(e as unknown as Record<string, unknown>)}>
                  Export
                </Button>
                {canManage && !accountLoading && !isAccessRestricted && (() => {
                  if (!accountData?.hasAccount) {
                    return (
                      <Button variant="success" size="sm" leftIcon={<UserCheck className="h-3.5 w-3.5" />} onClick={() => setInviteOpen(true)}>
                        Grant Access
                      </Button>
                    )
                  }
                  if (!accountData?.account?.isActive) {
                    return (
                      <Button variant="warning" size="sm" leftIcon={<Clock className="h-3.5 w-3.5" />} onClick={() => setInviteOpen(true)}>
                        Invite Pending
                      </Button>
                    )
                  }
                  return (
                    <Button variant="info" size="sm" leftIcon={<Shield className="h-3.5 w-3.5" />} onClick={() => setInviteOpen(true)}>
                      Manage Access
                    </Button>
                  )
                })()}
                <Button size="sm" leftIcon={<Edit2 className="h-3.5 w-3.5" />} onClick={() => setEditOpen(true)}>
                  Edit Profile
                </Button>
                {canManage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" aria-label="More actions">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      {e.status !== 'active' && (
                        <DropdownMenuItem
                          onClick={() => setStatusTarget({ status: 'active' })}
                          className="text-success focus:text-success focus:bg-success/10"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-2" />
                          Activate
                          </DropdownMenuItem>
                        )}
                        {(e.status === 'active' || e.status === 'onboarding') && (
                          <DropdownMenuItem
                            onClick={() => setStatusTarget({ status: 'suspended' })}
                            className="text-amber-600 focus:text-amber-600 focus:bg-amber-50"
                          >
                            <Ban className="h-3.5 w-3.5 mr-2" />
                            Suspend
                          </DropdownMenuItem>
                        )}
                        {e.status !== 'terminated' && (
                          <DropdownMenuItem
                            onClick={() => setStatusTarget({ status: 'terminated' })}
                            className="text-destructive focus:text-destructive focus:bg-destructive/10"
                          >
                            <UserX className="h-3.5 w-3.5 mr-2" />
                            Terminate
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setArchiveConfirm(true)}
                          className="text-muted-foreground focus:text-destructive focus:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" />
                          Archive Record
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            </div>

          {/* ── Zone 2: Stat grid (single source of truth for hero summary) ── */}
          {(() => {
            const expiredDocs = docs.filter(d => d.status === 'expired' || (d.expiryDate && new Date(d.expiryDate) < new Date())).length
            const reviewsCount = (reviews ?? []).length
            const tenureLabel = (() => {
              if (!e.joinDate) return null
              const join = new Date(e.joinDate)
              if (Number.isNaN(join.getTime())) return null
              const ms = Date.now() - join.getTime()
              const years = ms / (365.25 * 24 * 3600 * 1000)
              if (years < 1) {
                const months = Math.floor(years * 12)
                return months <= 0 ? 'New hire' : `${months} mo`
              }
              return `${years.toFixed(1)} yr`
            })()
            const accountRole = accountData?.account?.role
            const accountIsActive = !!accountData?.account?.isActive
            return (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                <StatTile tone="indigo"  icon={Calendar}   label="Join Date"    value={formatDate(e.joinDate) || '—'} />
                <StatTile tone="teal"    icon={Clock}      label="Tenure"       value={tenureLabel ?? '—'} />
                <StatTile tone="emerald" icon={DollarSign} label="Total Salary" value={e.totalSalary != null ? formatCurrency(e.totalSalary) : '—'} />

                {/* User role — colour-coded badge (only when an account exists) */}
                {canManage && accountRole && (
                  <StatTile
                    tone="indigo"
                    icon={Shield}
                    label="Role"
                    value={
                      <span className="flex items-center gap-1.5">
                        <span className={cn(
                          'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none',
                          ROLE_BADGE_STYLE[accountRole] ?? '',
                        )}>
                          {ROLE_LABELS[accountRole] ?? labelFor(accountRole)}
                        </span>
                        <span className={cn(
                          'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none border',
                          accountIsActive
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-muted text-muted-foreground border-border',
                        )}>
                          {accountIsActive ? 'Active' : 'Inactive'}
                        </span>
                      </span>
                    }
                  />
                )}

                {(() => {
                  const flag = e.nationality ? isoToFlag(resolveCountryIso(e.nationality)) : null
                  return (
                    <StatTile
                      tone="blue"
                      icon={MapPin}
                      label="Nationality"
                      value={
                        e.nationality ? (
                          <span className="flex items-center gap-1.5">
                            {flag && <span className="text-base leading-none">{flag}</span>}
                            <span className="truncate">{e.nationality}</span>
                          </span>
                        ) : '—'
                      }
                    />
                  )
                })()}

                <StatTile
                  tone="blue"
                  icon={Plane}
                  label="Visa Expiry"
                  value={e.visaExpiry ? formatDate(e.visaExpiry) : '—'}
                  trailing={e.visaExpiry ? <ExpiryStatus date={e.visaExpiry} /> : null}
                />
                <StatTile
                  tone="violet"
                  icon={Hash}
                  label="Emirates ID"
                  value={e.emiratesIdExpiry ? formatDate(e.emiratesIdExpiry) : '—'}
                  trailing={e.emiratesIdExpiry ? <ExpiryStatus date={e.emiratesIdExpiry} /> : null}
                />
                <StatTile
                  tone="amber"
                  icon={FileText}
                  label="Passport"
                  value={e.passportExpiry ? formatDate(e.passportExpiry) : '—'}
                  trailing={e.passportExpiry ? <ExpiryStatus date={e.passportExpiry} /> : null}
                />
                <StatTile tone="slate"  icon={Briefcase} label="Employment" value={e.contractType ? labelFor(e.contractType) : '—'} />
                <StatTile tone="teal"   icon={MapPin}    label="Location"   value={e.workLocation ?? '—'} />
                <StatTile tone="indigo" icon={UserCheck} label="Manager"    value={e.managerName ?? '—'} />
                <StatTile tone="violet" icon={Star}      label="Grade"      value={e.gradeLevelName ?? '—'} />

                {/* Active loans — only shown when there's an outstanding balance */}
                {employeeLoanSummary && (
                  <StatTile
                    tone="amber"
                    icon={DollarSign}
                    label="Active Loan"
                    value={formatCurrency(employeeLoanSummary.outstanding)}
                    trailing={
                      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0 text-[10px] font-semibold text-amber-800">
                        {employeeLoanSummary.count} active
                      </span>
                    }
                  />
                )}

                {expiredDocs > 0 && (
                  <StatTile
                    tone="rose"
                    icon={AlertTriangle}
                    label="Documents"
                    value={`${expiredDocs} expired`}
                    valueClass="text-red-700"
                  />
                )}
                {reviewsCount > 0 && (
                  <StatTile tone="amber" icon={Star} label="Reviews" value={`${reviewsCount}`} />
                )}

              </div>
            )
          })()}

          {/* Account timeline. Falls back to the employee record's createdAt
              when no user account exists yet, so managers always see a date. */}
          {canManage && (() => {
            const account = accountData?.account

            const renderLastLogin = () => {
              if (accountLoading) return INLINE_SPINNER
              if (!accountData?.hasAccount) {
                return (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-[11px] font-medium"
                    onClick={() => setInviteOpen(true)}
                  >
                    No account · Invite
                  </Button>
                )
              }
              return account?.lastLoginAt ? formatDateTime(account.lastLoginAt) : 'Never'
            }

            const renderAccountCreated = () => {
              if (accountLoading) return INLINE_SPINNER
              if (account?.createdAt) return formatDateTime(account.createdAt)
              if (e.createdAt) return formatDateTime(e.createdAt)
              return '—'
            }

            return (
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 sm:px-5 py-2.5 border-t border-border/60 bg-muted/30">
                <MetaItem icon={Clock}    label="Last login"       value={renderLastLogin()} />
                <MetaItem icon={Calendar} label="Account created"  value={renderAccountCreated()} />
              </div>
            )
          })()}
        </CardContent>
      </Card>

      {/* Tab bar + content */}
      {(() => {
        const allTabs: TabDef[] = [
          { value: 'personal', icon: User, label: 'Personal' },
          { value: 'employment', icon: Briefcase, label: 'Employment' },
          { value: 'visa', icon: Plane, label: 'Visa & ID' },
          { value: 'documents', icon: FileText, label: 'Documents' },
          { value: 'payroll', icon: CreditCard, label: 'Payroll' },
          { value: 'performance', icon: Star, label: 'Performance' },
          { value: 'assets', icon: Package, label: 'Assets' },
          { value: 'leave', icon: CalendarDays, label: 'Leave' },
          { value: 'attendance', icon: ClipboardList, label: 'Attendance' },
          ...(canManage ? [{ value: 'training', icon: GraduationCap, label: 'Training' }] : []),
          ...(canManage ? [{ value: 'updates', icon: History, label: 'Updates' }] : []),
        ]
        return (
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <Card>
          <CardContent className="p-0">
            <OverflowTabsList tabs={allTabs} activeTab={activeTab} onTabChange={setActiveTab} />
          </CardContent>
        </Card>

        <div className="space-y-4">

          {/* ── Personal ── */}
          <TabsContent value="personal" className="mt-4 space-y-4">
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

            {/* ── Dependents — nested under Personal ─────────────────────── */}
            {canManage && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Heart className="h-4 w-4 text-rose-500" />
                      <CardTitle className="text-base">Dependents</CardTitle>
                      {dependentsData?.length ? (
                        <span className="text-[11px] font-medium text-muted-foreground bg-muted/60 rounded-full px-2 py-0.5">
                          {dependentsData.length}
                        </span>
                      ) : null}
                    </div>
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
                                    onClick={() => deleteDependent.mutate(dep.id, { onError: (err: Error) => toast.error('Failed', err.message) })}>
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
            )}
          </TabsContent>

          {/* ── Employment ── */}
          <TabsContent value="employment" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-4">
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
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-5">
                  {/* Row 1 — Identity */}
                  <EmpField label="Employee No." icon={Hash} value={e.employeeNo} />
                  <EmpField label="Join Date" icon={Calendar} value={formatDate(e.joinDate)} />
                  <EmpField label="Status" icon={Shield}>
                    <EmployeeStatusBadge status={e.status} />
                  </EmpField>

                  {/* Row 2 — Role */}
                  <EmpField label="Designation" icon={Briefcase} value={e.designation} />
                  <EmpField label="Employment Type" icon={Briefcase} value={labelFor(e.contractType)} />
                  <EmpField label="Grade Level" icon={GraduationCap} value={e.gradeLevelName} />

                  {/* Row 3 — Org */}
                  <EmpField label="Company" icon={Building2} value={e.entityName ?? undefined} />
                  <EmpField label="Branch" icon={Building2} value={orgUnitName(e.branchId) ?? undefined} />
                  <EmpField label="Division" icon={Building2} value={orgUnitName(e.divisionId) ?? undefined} />

                  {/* Row 4 — Location / Manager */}
                  <EmpField label="Department" icon={Building2} value={orgUnitName(e.departmentId) ?? undefined} />
                  <EmpField label="Work Location" icon={MapPin} value={e.workLocation ?? undefined} />
                  <EmpField label="Direct Manager" icon={User} value={e.managerName ?? undefined} />

                  {/* Conditional dates */}
                  {(e.contractType === 'probation' || e.probationEndDate) && (
                    <EmpField label="Probation End" icon={Clock} value={e.probationEndDate ? formatDate(e.probationEndDate) : undefined} />
                  )}
                  {(e.contractType === 'contract' || e.contractEndDate) && (
                    <EmpField label="Contract End" icon={Calendar} value={e.contractEndDate ? formatDate(e.contractEndDate) : undefined} />
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Team memberships */}
            <Card>
              <CardHeader className="px-4 py-3 border-b">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-semibold">Team Memberships</CardTitle>
                  {employeeTeams.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] ml-auto">
                      {employeeTeams.length} {employeeTeams.length === 1 ? 'team' : 'teams'}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-3">
                {employeeTeams.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <Users className="h-7 w-7 mx-auto mb-1.5 opacity-25" />
                    <p className="text-sm font-medium">Not assigned to any team</p>
                    <p className="text-[11px] mt-0.5">Team assignments are managed from the Teams page.</p>
                  </div>
                ) : (
                  <div className="divide-y rounded-lg border bg-card overflow-hidden">
                    {employeeTeams.map(team => {
                      // Resolve Branch › Division › Department from the team's deptId
                      const dept = team.departmentId ? orgUnits.find(u => u.id === team.departmentId) : null
                      const div = dept?.parentId ? orgUnits.find(u => u.id === dept.parentId && u.type === 'division') : null
                      const branch = div?.parentId
                        ? orgUnits.find(u => u.id === div.parentId && u.type === 'branch')
                        : dept?.parentId ? orgUnits.find(u => u.id === dept.parentId && u.type === 'branch') : null
                      return (
                        <TeamMembershipRow
                          key={team.id}
                          team={team}
                          branchName={branch?.name ?? null}
                          divisionName={div?.name ?? null}
                          departmentName={dept?.name ?? team.department ?? null}
                        />
                      )
                    })}
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
                  <div className="space-y-3">
                    {transfersData.map(tr => {
                      const fromDept = tr.fromDepartment ?? (tr.fromDepartmentId ? orgUnitName(tr.fromDepartmentId) : null)
                      const toDept = tr.toDepartment ?? (tr.toDepartmentId ? orgUnitName(tr.toDepartmentId) : null)
                      const fromBranch = tr.fromBranchName ?? (tr.fromBranchId ? orgUnitName(tr.fromBranchId) : null)
                      const toBranch = tr.toBranchName ?? (tr.toBranchId ? orgUnitName(tr.toBranchId) : null)
                      const fromDiv = tr.fromDivisionName ?? (tr.fromDivisionId ? orgUnitName(tr.fromDivisionId) : null)
                      const toDiv = tr.toDivisionName ?? (tr.toDivisionId ? orgUnitName(tr.toDivisionId) : null)
                      type ChangeRow = { label: string; from: string | null; to: string | null }
                      const changes: ChangeRow[] = [
                        fromBranch !== toBranch && (fromBranch || toBranch) ? { label: 'Branch', from: fromBranch, to: toBranch } : null,
                        fromDiv !== toDiv && (fromDiv || toDiv) ? { label: 'Division', from: fromDiv, to: toDiv } : null,
                        fromDept !== toDept && (fromDept || toDept) ? { label: 'Department', from: fromDept, to: toDept } : null,
                        tr.fromDesignation !== tr.toDesignation && (tr.fromDesignation || tr.toDesignation) ? { label: 'Designation', from: tr.fromDesignation ?? null, to: tr.toDesignation ?? null } : null,
                        tr.newSalary ? { label: 'Salary', from: null, to: formatCurrency(parseFloat(tr.newSalary)) } : null,
                      ].filter(Boolean) as ChangeRow[]
                      return (
                        <div key={tr.id} className="rounded-lg border bg-card overflow-hidden">
                          {/* Header */}
                          <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-muted/30 border-b">
                            <div className="flex items-center gap-2">
                              <Badge variant="info" className="text-[10px] px-2 py-0.5">Transfer</Badge>
                              <span className="text-sm font-medium text-foreground">{formatDate(tr.transferDate)}</span>
                            </div>
                            {tr.approvedByName && (
                              <span className="text-xs text-muted-foreground">by {tr.approvedByName}</span>
                            )}
                          </div>
                          {/* Change rows */}
                          {changes.length > 0 && (
                            <div className="divide-y">
                              {changes.map(row => (
                                <div key={row.label} className="grid grid-cols-[80px_1fr_20px_1fr] items-center gap-2 px-4 py-2.5">
                                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{row.label}</span>
                                  <span className="text-xs text-muted-foreground truncate">{row.from ?? '—'}</span>
                                  <ArrowRightLeft className="h-3 w-3 text-muted-foreground/40 justify-self-center shrink-0" />
                                  <span className="text-xs font-medium text-foreground truncate">{row.to ?? '—'}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {/* Reason / notes */}
                          {(tr.reason || tr.notes) && (
                            <div className="px-4 py-2 border-t bg-muted/10">
                              {tr.reason && <p className="text-xs text-muted-foreground line-clamp-2">{tr.reason}</p>}
                              {tr.notes && <p className="text-xs text-muted-foreground/60 italic line-clamp-1 mt-0.5">{tr.notes}</p>}
                            </div>
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
                      <InfoRow
                        label="Visa Expiry"
                        value={e.visaExpiry ? formatDate(e.visaExpiry) : null}
                        icon={Calendar}
                        trailing={<ExpiryStatus date={e.visaExpiry} />}
                      />
                      <InfoRow label="Sponsoring Entity" value={e.sponsoringEntityName} icon={Building2} />
                    </div>
                    <div>
                      <InfoRow label="Emirates ID" value={e.emiratesId} icon={Hash} />
                      <InfoRow
                        label="EID Expiry"
                        value={e.emiratesIdExpiry ? formatDate(e.emiratesIdExpiry) : null}
                        icon={Calendar}
                        trailing={<ExpiryStatus date={e.emiratesIdExpiry} />}
                      />
                      <InfoRow label="Passport No." value={e.passportNo} icon={Hash} />
                      <InfoRow
                        label="Passport Expiry"
                        value={e.passportExpiry ? formatDate(e.passportExpiry) : null}
                        icon={Calendar}
                        trailing={<ExpiryStatus date={e.passportExpiry} />}
                      />
                      <InfoRow label="Labour Card No." value={e.labourCardNumber} icon={Hash} />
                      <InfoRow
                        label="Labour Card Expiry"
                        value={e.labourCardExpiry ? formatDate(e.labourCardExpiry) : null}
                        icon={Calendar}
                        trailing={<ExpiryStatus date={e.labourCardExpiry} />}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Documents ── */}
          <TabsContent value="documents" className="mt-4">
            <Card>
              {/* ── Header ── */}
              <CardHeader className="px-4 py-3 border-b">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <CardTitle className="text-base font-semibold">Documents</CardTitle>
                    {docs.length > 0 && (
                      <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-muted text-[11px] font-medium text-muted-foreground tabular-nums">{docs.length}</span>
                    )}
                  </div>
                  <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setAddDocOpen(true)}>
                    Add Document
                  </Button>
                </div>
              </CardHeader>

              {/* ── Stats + search ── */}
              {!docsLoading && docs.length > 0 && (
                <div className="px-4 py-2.5 border-b bg-muted/20 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {docStats.valid > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-medium">
                        <CheckCircle2 className="h-3 w-3" />{docStats.valid} Valid
                      </span>
                    )}
                    {docStats.expiring > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-xs font-medium">
                        <Clock className="h-3 w-3" />{docStats.expiring} Expiring Soon
                      </span>
                    )}
                    {docStats.expired > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 text-xs font-medium">
                        <AlertTriangle className="h-3 w-3" />{docStats.expired} Expired
                      </span>
                    )}
                    {docStats.pending > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium">
                        <Clock className="h-3 w-3" />{docStats.pending} Pending Review
                      </span>
                    )}
                    {docStats.rejected > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 text-xs font-medium">
                        <Ban className="h-3 w-3" />{docStats.rejected} Rejected
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <input
                      type="text"
                      value={docSearch}
                      onChange={e => setDocSearch(e.target.value)}
                      placeholder="Search by name, type or category…"
                      className="w-full pl-9 pr-8 h-9 text-sm rounded-md border border-input bg-background outline-none focus:ring-2 focus:ring-ring/50 placeholder:text-muted-foreground"
                    />
                    {docSearch && (
                      <button onClick={() => setDocSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        <XIcon className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* ── Content ── */}
              <CardContent className="p-0">
                {docsLoading ? (
                  <div className="px-6 py-6 space-y-4">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="flex gap-4 p-4 rounded-xl border border-border/60">
                        <Skeleton className="h-11 w-11 rounded-xl shrink-0" />
                        <div className="flex-1 space-y-2.5 pt-0.5">
                          <Skeleton className="h-4 w-1/2" />
                          <Skeleton className="h-3 w-1/3" />
                          <Skeleton className="h-3 w-2/3" />
                        </div>
                      </div>
                    ))}
                  </div>

                ) : docs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
                    <div className="h-14 w-14 rounded-2xl bg-muted/60 border border-border flex items-center justify-center mb-4">
                      <FolderOpen className="h-7 w-7 text-muted-foreground/40" />
                    </div>
                    <p className="text-sm font-semibold text-foreground">No documents yet</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-xs">Upload passports, visas, contracts, qualifications and other compliance files for this employee.</p>
                    <Button size="sm" variant="outline" className="mt-5" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setAddDocOpen(true)}>
                      Add First Document
                    </Button>
                  </div>

                ) : filteredDocs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
                    <Search className="h-9 w-9 text-muted-foreground/25 mb-3" />
                    <p className="text-sm font-medium text-foreground">No results for "{docSearch}"</p>
                    <p className="text-xs text-muted-foreground mt-1">Try a different name or category</p>
                    <button onClick={() => setDocSearch('')} className="text-xs text-primary mt-3 hover:underline font-medium">Clear search</button>
                  </div>

                ) : (
                  <div className="px-6 py-6 space-y-8">
                    {docsByCategory.map(([category, categoryDocs]) => {
                      const catCfg = DOC_CATEGORY_CONFIG[category] ?? { label: category, Icon: FileText, iconCls: 'text-muted-foreground', bgCls: 'bg-muted border-border' }
                      const { Icon: CatIcon } = catCfg
                      return (
                        <div key={category} className="space-y-3">

                          {/* Category label */}
                          <div className="flex items-center gap-2">
                            <div className={cn('h-6 w-6 rounded-md flex items-center justify-center border shrink-0', catCfg.bgCls)}>
                              <CatIcon className={cn('h-3.5 w-3.5', catCfg.iconCls)} />
                            </div>
                            <span className="text-xs font-semibold text-foreground tracking-wide uppercase">{catCfg.label}</span>
                            <span className="text-[11px] text-muted-foreground font-normal normal-case">· {categoryDocs.length} {categoryDocs.length === 1 ? 'file' : 'files'}</span>
                            <div className="flex-1 h-px bg-border/60 ml-1" />
                          </div>

                          {/* Document cards — same shape as loan card: single block, status-tinted bg, structured rows */}
                          <div className="space-y-2">
                            {categoryDocs.slice(0, docVisibleByCategory.get(category) ?? DOC_PAGE_SIZE).map(doc => {
                              const { variant: statusVariant, label: statusLabel } = DOC_STATUS_BADGE[doc.status] ?? { variant: 'secondary' as const, label: labelFor(doc.status) }
                              const fileSizeLabel = doc.fileSize ? formatFileSize(doc.fileSize) : null
                              const ext = doc.fileName ? doc.fileName.split('.').pop()?.toUpperCase() : null
                              const isExpired = !!(doc.expiryDate && new Date(doc.expiryDate) < new Date())
                              const needsReview = canManageDocuments && (doc.status === 'pending_upload' || doc.status === 'under_review')
                              const isApprovedExpired = isExpired && (doc.status === 'valid' || doc.status === 'expired' || !!doc.verifiedAt)
                              const isValid = doc.status === 'valid' && !isExpired

                              return (
                                <div
                                  key={doc.id}
                                  className={cn(
                                    'rounded-lg border bg-card px-3.5 py-2.5 transition-colors',
                                    isValid && 'border-emerald-200 bg-emerald-50/40',
                                    needsReview && 'border-amber-200 bg-amber-50/40',
                                    isApprovedExpired && 'border-red-300 bg-red-50/40',
                                  )}
                                >
                                  {/* Top: icon + title + status + actions (mirrors loan card) */}
                                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
                                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                      <div className={cn('shrink-0 h-8 w-8 rounded-md flex items-center justify-center', catCfg.bgCls)}>
                                        <CatIcon className={cn('h-4 w-4', catCfg.iconCls)} />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <p className="text-sm font-bold text-foreground leading-none truncate">
                                            {doc.docType || doc.fileName || 'Untitled'}
                                          </p>
                                          {isExpired ? (
                                            <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-800">
                                              <AlertCircle className="h-2.5 w-2.5" />Expired
                                            </span>
                                          ) : doc.expiryDate ? (
                                            <ExpiryStatus date={doc.expiryDate} />
                                          ) : (
                                            <Badge variant={statusVariant} className="text-[10px] px-1.5 py-0 leading-none">{statusLabel}</Badge>
                                          )}
                                        </div>
                                        <p className="text-[11px] text-muted-foreground mt-1 leading-tight">
                                          {(ext || fileSizeLabel) && <>{[ext, fileSizeLabel].filter(Boolean).join(' · ')} · </>}
                                          Uploaded {formatDate(doc.createdAt)}
                                          {doc.status === 'valid' && doc.verifiedByName && (
                                            <> · <span className="text-emerald-700 font-medium">✓ {doc.verifiedByName}</span></>
                                          )}
                                        </p>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-1 flex-wrap sm:flex-nowrap shrink-0 self-start sm:self-auto">
                                      {needsReview && !isExpired && (
                                        <Button
                                          variant="success" size="sm" className="h-7 text-xs"
                                          disabled={verifyDocument.isPending}
                                          onClick={() => verifyDocument.mutate(doc.id, {
                                            onSuccess: () => toast.success('Document approved'),
                                            onError: (err: Error) => toast.error('Failed to approve', err?.message),
                                          })}
                                        >
                                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Approve
                                        </Button>
                                      )}
                                      {needsReview && (
                                        <Button
                                          variant="destructive" size="sm" className="h-7 text-xs"
                                          onClick={() => { setRejectDocId(doc.id); setRejectDocReason('') }}
                                        >
                                          <Ban className="h-3.5 w-3.5 mr-1" />Reject
                                        </Button>
                                      )}
                                      <Button variant="ghost" size="icon-sm" aria-label="View" onClick={() => setViewDoc({ id: doc.id, fileName: doc.fileName ?? doc.docType })}>
                                        <Eye className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button variant="ghost" size="icon-sm" aria-label="Download" onClick={() => downloadDoc(doc)}>
                                        <Download className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  </div>

                                  {/* Bottom strip: structured key-value chips (mirrors loan progress strip) */}
                                  {(doc.docNumber || doc.issueDate || doc.expiryDate) && (
                                    <div className="flex items-center gap-x-5 gap-y-1 flex-wrap mt-2 pt-2 border-t border-border/40 text-[11px]">
                                      {doc.docNumber && (
                                        <span className="flex items-center gap-1.5">
                                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">Number</span>
                                          <span className="font-mono tabular-nums text-foreground/90">{doc.docNumber}</span>
                                        </span>
                                      )}
                                      {doc.issueDate && (
                                        <span className="flex items-center gap-1.5">
                                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">Issued</span>
                                          <span className="tabular-nums text-foreground/90">{formatDate(doc.issueDate)}</span>
                                        </span>
                                      )}
                                      {doc.expiryDate && (
                                        <span className="flex items-center gap-1.5">
                                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">Expires</span>
                                          <span className={cn('tabular-nums font-medium', isExpired ? 'text-red-600' : 'text-foreground/90')}>
                                            {formatDate(doc.expiryDate)}
                                          </span>
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                          {(docVisibleByCategory.get(category) ?? DOC_PAGE_SIZE) < categoryDocs.length && (
                            <button
                              type="button"
                              onClick={() => setDocVisibleByCategory(prev => {
                                const next = new Map(prev)
                                next.set(category, (next.get(category) ?? DOC_PAGE_SIZE) + DOC_PAGE_SIZE)
                                return next
                              })}
                              className="mt-2.5 w-full px-3 py-2 text-[11px] font-medium text-primary hover:bg-muted/50 rounded-md border border-dashed border-border transition-colors"
                            >
                              Show {Math.min(DOC_PAGE_SIZE, categoryDocs.length - (docVisibleByCategory.get(category) ?? DOC_PAGE_SIZE))} more
                              <span className="text-muted-foreground"> · {categoryDocs.length - (docVisibleByCategory.get(category) ?? DOC_PAGE_SIZE)} hidden</span>
                            </button>
                          )}

                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Payroll ── */}
          <TabsContent value="payroll" className="mt-4 space-y-4">
            {(() => {
              const today = new Date().toISOString().split('T')[0]
              const upcoming = salaryHistoryData?.find(r => r.effectiveDate > today)
              return (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">Payroll Summary</CardTitle>
                        {upcoming && (
                          <Badge variant="warning" className="text-[10px]">Pending change</Badge>
                        )}
                      </div>
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
                  <CardContent className="space-y-4">
                    {/* Current salary */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        {upcoming ? 'Current Salary (Active)' : 'Current Salary'}
                      </p>
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
                    </div>

                    {/* Upcoming change banner */}
                    {upcoming && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 space-y-2.5">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-amber-600 shrink-0" />
                          <p className="text-sm font-semibold text-amber-900">
                            Upcoming Salary Change — effective {formatDate(upcoming.effectiveDate)}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {[
                            { label: 'New Basic', cur: e.basicSalary, nxt: upcoming.newBasicSalary },
                            { label: 'Housing', cur: e.housingAllowance, nxt: upcoming.newHousingAllowance },
                            { label: 'Transport', cur: e.transportAllowance, nxt: upcoming.newTransportAllowance },
                            { label: 'Other', cur: e.otherAllowances, nxt: upcoming.newOtherAllowances },
                          ].map(({ label, cur, nxt }) => {
                            const curVal = cur != null ? parseFloat(String(cur)) : 0
                            // null nxt means the field wasn't touched in the revision — treat as same as cur
                            const nxtVal = nxt != null ? parseFloat(String(nxt)) : curVal
                            const diff = nxtVal - curVal
                            return (
                              <div key={label} className="bg-white/60 rounded-lg px-3 py-2">
                                <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
                                <p className="text-sm font-bold tabular-nums">{formatCurrency(nxtVal)}</p>
                                {diff !== 0 && (
                                  <p className={cn('text-[10px] font-medium tabular-nums', diff > 0 ? 'text-green-600' : 'text-red-600')}>
                                    {diff > 0 ? '+' : ''}{formatCurrency(diff)}
                                  </p>
                                )}
                              </div>
                            )
                          })}
                        </div>
                        {upcoming.newTotalSalary && (
                          <p className="text-xs text-amber-700">
                            New total package: <span className="font-semibold">{formatCurrency(parseFloat(upcoming.newTotalSalary))}</span>
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })()}

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
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-base">Salary History</CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={salaryHistoryFilters.type ?? '__all'}
                      onValueChange={v => setSalaryHistoryFilters(prev => ({ ...prev, type: v === '__all' ? undefined : v }))}
                    >
                      <SelectTrigger className="h-8 text-xs w-40">
                        <SelectValue placeholder="All types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all">All types</SelectItem>
                        {Object.entries(REVISION_TYPE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {salaryHistoryFilters.type && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-xs text-muted-foreground"
                        onClick={() => setSalaryHistoryFilters({})}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {salaryHistoryLoading ? (
                  <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
                ) : !salaryHistoryData || salaryHistoryData.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <History className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-medium">No salary revisions recorded</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {salaryHistoryData.map(rev => {
                      const today = new Date().toISOString().split('T')[0]
                      const isUpcoming = rev.effectiveDate > today
                      const prev = rev.previousBasicSalary ? parseFloat(rev.previousBasicSalary) : null
                      const next = parseFloat(rev.newBasicSalary)
                      const delta = prev != null ? next - prev : null
                      return (
                        <div
                          key={rev.id}
                          className={cn(
                            'rounded-xl border p-3.5 transition-colors',
                            isUpcoming ? 'border-amber-200 bg-amber-50/50' : 'hover:bg-muted/20',
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 min-w-0">
                              <div className={cn(
                                'h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
                                delta == null || delta >= 0 ? 'bg-green-100' : 'bg-red-100',
                              )}>
                                <CreditCard className={cn('h-3.5 w-3.5', delta == null || delta >= 0 ? 'text-green-600' : 'text-red-600')} />
                              </div>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-sm font-semibold">{formatCurrency(next)}</span>
                                  {delta != null && (
                                    <span className={cn('text-xs font-medium', delta >= 0 ? 'text-green-600' : 'text-red-600')}>
                                      ({delta >= 0 ? '+' : ''}{formatCurrency(delta)})
                                    </span>
                                  )}
                                  <Badge variant={REVISION_TYPE_VARIANT[rev.revisionType] ?? 'secondary'} className="text-[10px]">
                                    {REVISION_TYPE_LABELS[rev.revisionType] ?? rev.revisionType}
                                  </Badge>
                                  {isUpcoming && <Badge variant="warning" className="text-[10px]">Upcoming</Badge>}
                                </div>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Calendar className="h-2.5 w-2.5" />{formatDate(rev.effectiveDate)}
                                  </span>
                                  {rev.newTotalSalary && (
                                    <span className="text-xs text-muted-foreground">Total: {formatCurrency(parseFloat(rev.newTotalSalary))}</span>
                                  )}
                                  {rev.approvedByName && (
                                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                                      <User className="h-2.5 w-2.5" />{rev.approvedByName}
                                    </span>
                                  )}
                                </div>
                                {rev.reason && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{rev.reason}</p>}
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 shrink-0"
                              onClick={() => setViewRevision(rev)}
                              title="View full details"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Loans (HR/payroll only) ── */}
            {canManage && (
              <EmployeeLoansPanel employeeId={id!} canManage={canManage} />
            )}
          </TabsContent>

          {/* ── Performance (with Warnings & Notes) ── */}
          <TabsContent value="performance" className="mt-4 space-y-4">
            {/* Performance + Warnings — 6/6 grid on desktop, stacked on mobile */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Performance Reviews */}
              <Card className="flex flex-col">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Star className="h-4 w-4 text-amber-500" />
                      <CardTitle className="text-base">Performance Reviews</CardTitle>
                      {reviews?.length ? (
                        <span className="text-[11px] font-medium text-muted-foreground bg-muted/60 rounded-full px-2 py-0.5">
                          {reviews.length}
                        </span>
                      ) : null}
                    </div>
                    {canManage && (
                      <Button size="sm" variant="outline" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreateReviewOpen(true)}>
                        New
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex-1">
                  {reviewsLoading ? (
                    <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
                  ) : !reviews || reviews.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground">
                      <Star className="h-9 w-9 mx-auto mb-2 opacity-30" />
                      <p className="text-sm font-medium">No performance records yet</p>
                      <p className="text-xs mt-1">Reviews will appear here</p>
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
                          <Badge variant={r.status === 'completed' ? 'success' : r.status === 'submitted' ? 'info' : 'secondary'} className="text-[10px] shrink-0">
                            {labelFor(r.status)}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Warnings */}
              {canManage && (
                <Card className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-rose-500" />
                        <CardTitle className="text-base">Warnings</CardTitle>
                        {warningsData?.length ? (
                          <span className="text-[11px] font-medium text-muted-foreground bg-muted/60 rounded-full px-2 py-0.5">
                            {warningsData.length}
                          </span>
                        ) : null}
                      </div>
                      <Button size="sm" variant="outline" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setWarningDialogOpen(true)}>
                        New
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1">
                    {warningsLoading ? (
                      <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
                    ) : !warningsData?.length ? (
                      <div className="text-center py-10 text-muted-foreground">
                        <AlertTriangle className="h-9 w-9 mx-auto mb-2 opacity-30" />
                        <p className="text-sm font-medium">No warnings on record</p>
                        <p className="text-xs mt-1">Disciplinary actions will appear here</p>
                      </div>
                    ) : (
                      <div className="divide-y">
                        {warningsData.map(w => (
                          <div key={w.id} className="py-3 flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-medium">{formatDate(w.issueDate)}</p>
                                {w.expiryDate && (
                                  <Badge variant="secondary" className="text-[10px]">
                                    Expires {formatDate(w.expiryDate)}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {w.createdByName ?? 'Unknown'} · {formatDate(w.createdAt)}
                              </p>
                              {w.documentFileName && (
                                <button
                                  className="text-primary hover:underline inline-flex items-center gap-1 text-xs mt-1"
                                  onClick={() => downloadWarningDoc.mutate(w.id, {
                                    onSuccess: (res) => window.open(res.url, '_blank'),
                                    onError: (err: Error) => toast.error('Download failed', err.message),
                                  })}
                                >
                                  <Download className="h-3 w-3" />{w.documentFileName}
                                </button>
                              )}
                            </div>
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive shrink-0"
                              onClick={() => deleteWarning.mutate(w.id, { onError: (err: Error) => toast.error('Failed', err.message) })}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* ── HR Notes — nested ──────────────────────────────────────── */}
            {canManage && (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <StickyNote className="h-4 w-4 text-blue-500" />
                    <CardTitle className="text-base">HR Notes</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2 items-start">
                    <Textarea
                      placeholder="Add a confidential note about this employee…"
                      value={noteInput}
                      onChange={ev => setNoteInput(ev.target.value)}
                      rows={2}
                      className="flex-1 resize-none"
                    />
                    <Button size="sm" className="shrink-0"
                      disabled={!noteInput.trim() || addNote.isPending}
                      onClick={() => {
                        if (!noteInput.trim()) return
                        addNote.mutate(noteInput.trim(), {
                          onSuccess: () => { setNoteInput(''); toast.success('Note added') },
                          onError: (err: Error) => toast.error('Failed', err.message),
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
                            onClick={() => deleteNote.mutate(note.id, { onError: (err: Error) => toast.error('Failed', err.message) })}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
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
                        {attendanceRecords
                          .toSorted((a, b) => b.date.localeCompare(a.date))
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

          {/* ── Training ──────────────────────────────────────────────────── */}
          {canManage && (
            <TabsContent value="training" className="mt-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-base">Training & Development</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {trainingLoading ? (
                    <div className="p-4 space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-10 rounded bg-muted animate-pulse" />)}</div>
                  ) : !trainingData?.data?.length ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <GraduationCap className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm font-medium">No training records</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-muted/40">
                            {['Title', 'Type', 'Provider', 'Start Date', 'End Date', 'Cost (AED)', 'Status'].map(h => (
                              <th key={h} className="text-left font-medium text-muted-foreground px-4 py-2.5 whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(trainingData.data as TrainingRecord[]).map(tr => (
                            <tr key={tr.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                              <td className="px-4 py-2.5 font-medium">{tr.title}</td>
                              <td className="px-4 py-2.5 text-muted-foreground capitalize">{tr.type?.replace('_', ' ') ?? '—'}</td>
                              <td className="px-4 py-2.5 text-muted-foreground">{tr.provider ?? '—'}</td>
                              <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(tr.startDate)}</td>
                              <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{tr.endDate ? formatDate(tr.endDate) : '—'}</td>
                              <td className="px-4 py-2.5 text-muted-foreground">{tr.cost ? formatCurrency(Number(tr.cost)) : '—'}</td>
                              <td className="px-4 py-2.5">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${TRAINING_STATUS_STYLE[tr.status] ?? ''}`}>
                                  {tr.status.replace('_', ' ')}
                                </span>
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
                                <ActionBadge action={log.action} />
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
        )
      })()}

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

      {/* Reject Document Dialog */}
      {canManageDocuments && (
        <Dialog open={!!rejectDocId} onOpenChange={o => !o && setRejectDocId(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Reject Document</DialogTitle>
            </DialogHeader>
            <Textarea
              placeholder="Reason for rejection (optional)"
              value={rejectDocReason}
              onChange={e => setRejectDocReason(e.target.value)}
              rows={3}
            />
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setRejectDocId(null)} disabled={rejectDocument.isPending}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={rejectDocument.isPending}
                onClick={() => {
                  if (!rejectDocId) return
                  rejectDocument.mutate({ id: rejectDocId, reason: rejectDocReason }, {
                    onSuccess: () => { toast.success('Document rejected'); setRejectDocId(null) },
                    onError: (err: Error) => { toast.error('Failed to reject', err?.message) },
                  })
                }}
              >
                Reject
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Salary Revision Detail Dialog */}
      {viewRevision && (
        <Dialog open={!!viewRevision} onOpenChange={o => !o && setViewRevision(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <History className="h-4 w-4" />
                Salary Revision Details
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={REVISION_TYPE_VARIANT[viewRevision.revisionType] ?? 'secondary'}>
                  {REVISION_TYPE_LABELS[viewRevision.revisionType] ?? viewRevision.revisionType}
                </Badge>
                {viewRevision.effectiveDate > new Date().toISOString().split('T')[0] && (
                  <Badge variant="warning">Upcoming</Badge>
                )}
              </div>
              {(() => {
                // Allowances always have a value after the backend fix; for older records
                // that have null, fall back to '0' so the display is always meaningful.
                const fmtSalary = (v: string | null) =>
                  v != null ? formatCurrency(parseFloat(v)) : '—'
                const fmtAllowance = (v: string | null) =>
                  formatCurrency(parseFloat(v ?? '0'))
                return (
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Effective Date', value: formatDate(viewRevision.effectiveDate) },
                      { label: 'Approved By', value: viewRevision.approvedByName ?? '—' },
                      { label: 'Previous Basic', value: fmtSalary(viewRevision.previousBasicSalary) },
                      { label: 'New Basic', value: formatCurrency(parseFloat(viewRevision.newBasicSalary)) },
                      { label: 'Previous Housing', value: fmtAllowance(viewRevision.previousHousingAllowance) },
                      { label: 'New Housing', value: fmtAllowance(viewRevision.newHousingAllowance) },
                      { label: 'Previous Transport', value: fmtAllowance(viewRevision.previousTransportAllowance) },
                      { label: 'New Transport', value: fmtAllowance(viewRevision.newTransportAllowance) },
                      { label: 'Previous Other', value: fmtAllowance(viewRevision.previousOtherAllowances) },
                      { label: 'New Other', value: fmtAllowance(viewRevision.newOtherAllowances) },
                      { label: 'Previous Total', value: fmtSalary(viewRevision.previousTotalSalary) },
                      { label: 'New Total', value: fmtSalary(viewRevision.newTotalSalary) },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-muted/40 rounded-lg px-3 py-2">
                        <p className="text-[10px] text-muted-foreground">{label}</p>
                        <p className="text-sm font-medium mt-0.5 tabular-nums">{value}</p>
                      </div>
                    ))}
                  </div>
                )
              })()}
              {viewRevision.reason && (
                <div className="bg-muted/40 rounded-lg px-3 py-2">
                  <p className="text-[10px] text-muted-foreground">Reason / Remarks</p>
                  <p className="text-sm mt-0.5">{viewRevision.reason}</p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewRevision(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Change Salary Dialog */}
      {canManage && id && (
        <ChangeSalaryDialog
          open={changeSalaryOpen}
          onOpenChange={setChangeSalaryOpen}
          employeeId={id}
          currentBasic={e.basicSalary ? parseFloat(String(e.basicSalary)) : null}
          currentTotal={e.totalSalary ? parseFloat(String(e.totalSalary)) : null}
          currentHousing={e.housingAllowance ? parseFloat(String(e.housingAllowance)) : null}
          currentTransport={e.transportAllowance ? parseFloat(String(e.transportAllowance)) : null}
          currentOther={e.otherAllowances ? parseFloat(String(e.otherAllowances)) : null}
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

      {/* Status change confirmation */}
      {statusTarget && e && (
        <ConfirmDialog
          open={!!statusTarget}
          onOpenChange={o => !o && setStatusTarget(null)}
          title={`${STATUS_CONFIG[statusTarget.status].label} employee?`}
          description={STATUS_CONFIG[statusTarget.status].description}
          confirmLabel={updateStatus.isPending ? 'Updating…' : STATUS_CONFIG[statusTarget.status].confirmLabel}
          variant={statusTarget.status === 'active' ? 'success' : statusTarget.status === 'suspended' ? 'warning' : 'destructive'}
          onConfirm={handleStatusChange}
        />
      )}

      {/* Archive confirmation */}
      {e && (
        <ConfirmDialog
          open={archiveConfirm}
          onOpenChange={o => setArchiveConfirm(o)}
          title="Archive employee record?"
          description={`This will permanently remove ${e.fullName}'s record from the active list. This action cannot be undone.`}
          confirmLabel={archiveEmployee.isPending ? 'Archiving…' : 'Archive'}
          variant="destructive"
          onConfirm={handleArchive}
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

  const [prevDepOpen, setPrevDepOpen] = React.useState(false)
  if (open && !prevDepOpen) {
    setPrevDepOpen(true)
    setForm(dependent ? {
      name: dependent.name,
      birthDate: dependent.birthDate,
      relation: dependent.relation,
      nationality: dependent.nationality,
      visaNumber: dependent.visaNumber,
      medicalInsurance: dependent.medicalInsurance,
    } : blank)
  } else if (!open && prevDepOpen) {
    setPrevDepOpen(false)
  }

  const set = (k: keyof DependentFormData, v: string | null) => setForm(f => ({ ...f, [k]: v || null }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{dependent ? 'Edit Dependent' : 'Add Dependent'}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
          <div className="sm:col-span-2 space-y-1.5">
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
            <DatePicker value={form.birthDate ?? ''} onChange={v => set('birthDate', v ?? '')} />
          </div>
          <div className="space-y-1.5">
            <Label>Nationality</Label>
            <Input value={form.nationality ?? ''} onChange={e => set('nationality', e.target.value)} placeholder="e.g. UAE" />
          </div>
          <div className="space-y-1.5">
            <Label>Visa Number</Label>
            <Input value={form.visaNumber ?? ''} onChange={e => set('visaNumber', e.target.value)} placeholder="Optional" />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
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
  const autoExpiryRef = React.useRef<string>('')

  const [prevWarnOpen, setPrevWarnOpen] = React.useState(true)
  if (!open && prevWarnOpen) {
    setPrevWarnOpen(false)
    setIssueDate(''); setExpiryDate(''); setReason(''); setFile(null); setDragging(false)
  } else if (open && !prevWarnOpen) {
    setPrevWarnOpen(true)
  }
  // Reset the ref in a cleanup effect — ref mutation during render is not allowed.
  React.useEffect(() => { if (!open) autoExpiryRef.current = '' }, [open])

  function handleIssueDateChange(date: string) {
    setIssueDate(date)
    if (date) {
      const d = new Date(date)
      d.setFullYear(d.getFullYear() + 1)
      const auto = d.toISOString().split('T')[0]!
      if (!expiryDate || expiryDate === autoExpiryRef.current) {
        setExpiryDate(auto)
        autoExpiryRef.current = auto
      }
    }
  }

  function handleExpiryDateChange(date: string) {
    setExpiryDate(date)
    autoExpiryRef.current = date
  }

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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Issue date <span className="text-destructive">*</span></Label>
              <DatePicker value={issueDate} onChange={v => handleIssueDateChange(v ?? '')} aria-invalid={!issueDate} />
            </div>
            <div className="space-y-1.5">
              <Label>Expiry date</Label>
              <DatePicker value={expiryDate} onChange={v => handleExpiryDateChange(v ?? '')} />
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
