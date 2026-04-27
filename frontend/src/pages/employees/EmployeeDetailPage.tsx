import React from 'react'
import { useTranslation } from 'react-i18next'
import { labelFor } from '@/lib/enums'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, User, Briefcase, Plane, FileText, CreditCard, Star,
  Phone, Mail, MapPin, Calendar, Building2, Hash, Shield, Edit2,
  Clock, Download, Eye, Camera, Loader2, Plus, Package,
  CalendarDays, ClipboardList, TrendingDown, UserCheck,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn, formatDate, formatCurrency, getInitials } from '@/lib/utils'
import { useEmployee, useUploadEmployeeAvatar, useEmployeeAccount } from '@/hooks/useEmployees'
import { useDocuments, useUploadDocument } from '@/hooks/useDocuments'
import { usePerformanceReviews } from '@/hooks/usePerformance'
import { useEmployeeAssets } from '@/hooks/useAssets'
import { useLeaveBalance, useLeaveRequests } from '@/hooks/useLeave'
import { useAttendance } from '@/hooks/useAttendance'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { EditEmployeeDialog } from '@/components/shared/action-dialogs'
import { InviteEmployeeDialog } from '@/components/shared/InviteEmployeeDialog'
import { DocumentViewerDialog } from '@/components/shared/DocumentViewerDialog'
import { toast } from '@/components/ui/overlays'
import { api } from '@/lib/api'
import { usePermissions } from '@/hooks/usePermissions'

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

interface LeaveRecord {
  id: string
  leaveType: string
  startDate: string
  endDate: string
  days: number
  status: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'info' | 'destructive' | 'secondary'> = {
  active: 'success', probation: 'warning', onboarding: 'info',
  suspended: 'destructive', terminated: 'secondary', visa_expired: 'destructive',
}

const ATTENDANCE_STATUS_VARIANT: Record<string, 'success' | 'destructive' | 'warning' | 'info' | 'secondary'> = {
  present: 'success', absent: 'destructive', late: 'warning',
  half_day: 'info', wfh: 'secondary', on_leave: 'secondary',
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
  const { data: docsResult, isLoading: docsLoading } = useDocuments({ employeeId: id })
  const { data: reviews, isLoading: reviewsLoading } = usePerformanceReviews(id)
  const { data: employeeAssignments, isLoading: assetsLoading } = useEmployeeAssets(id!)
  const { data: leaveBalanceData, isLoading: leaveBalanceLoading } = useLeaveBalance(id)
  const { data: leaveHistoryData, isLoading: leaveHistoryLoading } = useLeaveRequests({ employeeId: id, limit: 20 })

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

  const uploadAvatar = useUploadEmployeeAvatar(id!)
  const uploadDoc = useUploadDocument()
  const [editOpen, setEditOpen] = React.useState(false)
  const [inviteOpen, setInviteOpen] = React.useState(false)
  const [viewDoc, setViewDoc] = React.useState<{ id: string; fileName?: string } | null>(null)
  const avatarInputRef = React.useRef<HTMLInputElement>(null)
  const docInputRef = React.useRef<HTMLInputElement>(null)

  const e = employee

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

  function handleDocChange(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { toast.error('File too large', 'File must be smaller than 10 MB'); return }
    uploadDoc.mutate(
      { file, employeeId: id, category: 'other', docType: file.name },
      {
        onSuccess: () => toast.success('Uploaded', 'Document uploaded.'),
        onError: (err: Error) => toast.error('Upload failed', err?.message ?? 'Upload failed'),
      },
    )
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
                    {e.department && <span className="text-xs text-muted-foreground">{e.department}</span>}
                  </div>
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight font-display truncate">{e.fullName}</h1>
                  <p className="text-sm text-muted-foreground mt-0.5">{e.designation ?? '—'} · {e.employeeNo}</p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                    {(e.mobileNo ?? e.phone) && (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Phone className="h-3.5 w-3.5" />{e.mobileNo ?? e.phone}
                      </span>
                    )}
                    {(e.workEmail ?? e.email) && (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Mail className="h-3.5 w-3.5" />{e.workEmail ?? e.email}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="outline" size="sm" leftIcon={<Download className="h-3.5 w-3.5" />} onClick={() => exportCSV(e as unknown as Record<string, unknown>)}>
                    Export
                  </Button>
                  <Button size="sm" leftIcon={<Edit2 className="h-3.5 w-3.5" />} onClick={() => setEditOpen(true)}>
                    Edit
                  </Button>
                </div>
              </div>

              {/* Key stats strip */}
              <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 pt-4 border-t border-border/60">
                <QuickStat label="Join Date" value={formatDate(e.joinDate) || '—'} />
                <QuickStat label="Total Salary" value={formatCurrency(e.totalSalary ?? 0)} />
                <QuickStat label="Visa" value={visaLabel} valueClass={visaClass} />
                {e.contractType && <QuickStat label="Contract" value={e.contractType} />}
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
                { value: 'personal',    icon: User,          label: 'Personal' },
                { value: 'employment',  icon: Briefcase,     label: 'Employment' },
                { value: 'visa',        icon: Plane,         label: 'Visa & ID' },
                { value: 'documents',   icon: FileText,      label: 'Documents' },
                { value: 'payroll',     icon: CreditCard,    label: 'Payroll' },
                { value: 'performance', icon: Star,          label: 'Performance' },
                { value: 'assets',      icon: Package,       label: 'Assets' },
                { value: 'leave',       icon: CalendarDays,  label: 'Leave' },
                { value: 'attendance',  icon: ClipboardList, label: 'Attendance' },
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
                    <InfoRow label="Full Name"      value={e.fullName}                                         icon={User} />
                    <InfoRow label="Date of Birth"  value={e.dateOfBirth ? formatDate(e.dateOfBirth) : null}  icon={Calendar} />
                    <InfoRow label="Gender"         value={e.gender}                                           icon={User} />
                    <InfoRow label="Nationality"    value={e.nationality}                                      icon={MapPin} />
                    <InfoRow label="Marital Status" value={e.maritalStatus}                                    icon={User} />
                  </div>
                  <div>
                    <InfoRow label="Mobile"            value={e.mobileNo ?? e.phone}  icon={Phone} />
                    <InfoRow label="Personal Email"    value={e.personalEmail}        icon={Mail} />
                    <InfoRow label="Work Email"        value={e.workEmail ?? e.email} icon={Mail} />
                    <InfoRow label="Emergency Contact" value={e.emergencyContact}     icon={Phone} />
                    <InfoRow label="Address"           value={e.homeCountryAddress}   icon={MapPin} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Employment ── */}
          <TabsContent value="employment" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Employment Details</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                  <div>
                    <InfoRow label="Employee No."  value={e.employeeNo}                                            icon={Hash} />
                    <InfoRow label="Designation"   value={e.designation}                                           icon={Briefcase} />
                    <InfoRow label="Department"    value={e.department}                                            icon={Building2} />
                    <InfoRow label="Company"       value={(e as unknown as Record<string, unknown>)['entityName'] as string ?? '—'} icon={Building2} />
                    <InfoRow label="Contract Type" value={e.contractType} />
                    <InfoRow label="Work Location" value={e.workLocation}                                          icon={MapPin} />
                  </div>
                  <div>
                    <InfoRow label="Join Date"      value={formatDate(e.joinDate)}                                        icon={Calendar} />
                    <InfoRow label="Probation End"  value={e.probationEndDate ? formatDate(e.probationEndDate) : null}   icon={Clock} />
                    <InfoRow label="Contract End"   value={e.contractEndDate ? formatDate(e.contractEndDate) : null}     icon={Calendar} />
                    <InfoRow label="Status"         value={labelFor(e.status)}                                            icon={Shield} />
                    <InfoRow label="Grade / Band"   value={e.gradeLevel} />
                    <InfoRow label="Direct Manager" value={e.managerName}                                                 icon={User} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Visa & ID ── */}
          <TabsContent value="visa" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3 flex-wrap">
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
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                  <div>
                    <InfoRow label="Visa Type"        value={labelFor(e.visaType)}                                icon={Plane} />
                    <InfoRow label="Visa Number"      value={e.visaNumber}                                        icon={Hash} />
                    <InfoRow label="Visa Issue Date"  value={e.visaIssueDate ? formatDate(e.visaIssueDate) : null} icon={Calendar} />
                    <InfoRow label="Visa Expiry"      value={e.visaExpiry ? formatDate(e.visaExpiry) : null}      icon={Calendar} />
                    <InfoRow label="Sponsoring Entity" value={e.sponsoringEntity}                                 icon={Building2} />
                  </div>
                  <div>
                    <InfoRow label="Emirates ID"     value={e.emiratesId}                                             icon={Hash} />
                    <InfoRow label="EID Expiry"      value={e.emiratesIdExpiry ? formatDate(e.emiratesIdExpiry) : null} icon={Calendar} />
                    <InfoRow label="Passport No."    value={e.passportNo}                                             icon={Hash} />
                    <InfoRow label="Passport Expiry" value={e.passportExpiry ? formatDate(e.passportExpiry) : null}   icon={Calendar} />
                    <InfoRow label="Labour Card No." value={e.labourCardNumber}                                       icon={Hash} />
                  </div>
                </div>
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
                    leftIcon={uploadDoc.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                    onClick={() => docInputRef.current?.click()}
                    disabled={uploadDoc.isPending}
                  >
                    {uploadDoc.isPending ? 'Uploading…' : 'Upload'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {docsLoading ? (
                  <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
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
          <TabsContent value="payroll" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Payroll Summary</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                  <div>
                    <InfoRow label="Basic Salary"     value={formatCurrency(e.basicSalary ?? 0)}        icon={CreditCard} />
                    <InfoRow label="Housing Allow."   value={formatCurrency(e.housingAllowance ?? 0)} />
                    <InfoRow label="Transport Allow." value={formatCurrency(e.transportAllowance ?? 0)} />
                    <InfoRow label="Other Allow."     value={formatCurrency(e.otherAllowances ?? 0)} />
                  </div>
                  <div>
                    <InfoRow label="Total Salary"    value={formatCurrency(e.totalSalary ?? 0)} icon={CreditCard} />
                    <InfoRow label="Payment Method"  value={e.paymentMethod} />
                    <InfoRow label="Bank"            value={e.bankName}                         icon={Building2} />
                    <InfoRow label="IBAN"            value={e.iban}                             icon={Hash} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Performance ── */}
          <TabsContent value="performance" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Performance &amp; Notes</CardTitle>
                  <Button size="sm" variant="outline" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => navigate(`/performance?employeeId=${id}`)}>
                    New review
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {reviewsLoading ? (
                  <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
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
              <CardHeader><CardTitle className="text-base">Assigned Assets</CardTitle></CardHeader>
              <CardContent>
                {assetsLoading ? (
                  <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : !employeeAssignments || employeeAssignments.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">No assets assigned</p>
                    <p className="text-xs mt-1">Assets assigned to this employee will appear here</p>
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
          <TabsContent value="leave" className="mt-4 space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Leave Balance — {new Date().getFullYear()}</CardTitle></CardHeader>
              <CardContent>
                {leaveBalanceLoading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {[1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}
                  </div>
                ) : !leaveBalanceData?.balance ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No leave data available</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {Object.entries(leaveBalanceData.balance)
                      .filter(([, b]) => b.entitled !== 0)
                      .map(([type, b]) => {
                        const isUnlimited = b.entitled === -1
                        const pct = isUnlimited ? 0 : Math.min(100, Math.round((b.taken / (b.entitled || 1)) * 100))
                        const isLow = !isUnlimited && b.available <= 3 && b.entitled > 0
                        return (
                          <div key={type} className="rounded-lg border bg-card p-3 space-y-2">
                            <div className="flex items-start justify-between gap-1">
                              <span className="text-xs font-medium leading-tight">{labelFor(type)}</span>
                              {isLow && <TrendingDown className="h-3 w-3 text-destructive shrink-0 mt-0.5" />}
                            </div>
                            <div className="flex items-baseline gap-1">
                              <span className={cn('text-xl font-bold font-display', isLow ? 'text-destructive' : 'text-foreground')}>
                                {isUnlimited ? '∞' : b.available}
                              </span>
                              <span className="text-[10px] text-muted-foreground">/ {isUnlimited ? '∞' : b.entitled} days</span>
                            </div>
                            {!isUnlimited && (
                              <div className="w-full bg-muted rounded-full h-1.5">
                                <div
                                  className={cn('h-1.5 rounded-full transition-all', pct >= 80 ? 'bg-destructive' : pct >= 50 ? 'bg-warning' : 'bg-success')}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            )}
                            <div className="flex gap-2 text-[10px] text-muted-foreground">
                              <span>Used: <strong className="text-foreground">{b.taken}</strong></span>
                              {b.pending > 0 && <span>Pending: <strong className="text-warning">{b.pending}</strong></span>}
                            </div>
                          </div>
                        )
                      })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Leave History</CardTitle>
                  <Button size="sm" variant="outline" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => navigate(`/leave?employeeId=${id}`)}>
                    View all
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {leaveHistoryLoading ? (
                  <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : !leaveHistoryData?.data || leaveHistoryData.data.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-medium">No leave requests found</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {(leaveHistoryData.data as LeaveRecord[]).map(req => (
                      <div key={req.id} className="py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium capitalize">{labelFor(req.leaveType)} Leave</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(req.startDate)} — {formatDate(req.endDate)} · {req.days} day{req.days !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <Badge
                          variant={req.status === 'approved' ? 'success' : req.status === 'rejected' ? 'destructive' : req.status === 'pending' ? 'warning' : 'secondary'}
                          className="text-[10px] capitalize shrink-0"
                        >
                          {req.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Account ── */}
          {canManage && (
            <TabsContent value="account" className="mt-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Login Account</CardTitle>
                    {!accountLoading && (
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
                  ) : !accountData?.hasAccount ? (
                    <div className="flex items-start gap-4 rounded-xl border bg-muted/30 p-5">
                      <Shield className="h-9 w-9 text-muted-foreground/40 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">No login account yet</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          This employee cannot log in to the self-service portal. Click "Manage Access" to send an invitation.
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
                          {accountData.account?.email}
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
                  <div className="p-4 space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
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

        </div>
      </Tabs>

      {/* Hidden file inputs */}
      <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleAvatarChange} />
      <input ref={docInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx" className="hidden" onChange={handleDocChange} />

      {editOpen && <EditEmployeeDialog open={editOpen} onOpenChange={setEditOpen} employee={e} />}
      {inviteOpen && canManage && (
        <InviteEmployeeDialog employee={e} open={inviteOpen} onOpenChange={setInviteOpen} />
      )}
      <DocumentViewerDialog
        open={!!viewDoc}
        onOpenChange={o => !o && setViewDoc(null)}
        documentId={viewDoc?.id ?? null}
        fileName={viewDoc?.fileName}
      />
    </PageWrapper>
  )
}
