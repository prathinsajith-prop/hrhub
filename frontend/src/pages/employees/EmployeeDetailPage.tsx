import React from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  User,
  Briefcase,
  Plane,
  FileText,
  CreditCard,
  Star,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Building2,
  Hash,
  Shield,
  Edit2,
  Clock,
  Download,
  Eye,
  Camera,
  Loader2,
  Plus,
  Package,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn, formatDate, formatCurrency, getInitials } from '@/lib/utils'
import { useEmployee, useUploadEmployeeAvatar } from '@/hooks/useEmployees'
import { useDocuments, useUploadDocument } from '@/hooks/useDocuments'
import { usePerformanceReviews } from '@/hooks/usePerformance'
import { useEmployeeAssets } from '@/hooks/useAssets'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { EditEmployeeDialog } from '@/components/shared/action-dialogs'
import { DocumentViewerDialog } from '@/components/shared/DocumentViewerDialog'
import { toast } from 'sonner'
import { api } from '@/lib/api'

const statusVariant: Record<string, any> = {
  active: 'success',
  probation: 'warning',
  onboarding: 'info',
  suspended: 'destructive',
  terminated: 'secondary',
  visa_expired: 'destructive',
}

function InfoRow({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value?: string | null
  icon?: React.ElementType
}) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/60 last:border-0">
      {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />}
      <div className="flex-1 min-w-0 flex items-start justify-between gap-4">
        <span className="text-xs text-muted-foreground shrink-0 w-32">{label}</span>
        <span className="text-sm font-medium text-right text-foreground truncate">
          {value ?? '—'}
        </span>
      </div>
    </div>
  )
}

export function EmployeeDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: employee, isLoading } = useEmployee(id!)
  const { data: docsResult, isLoading: docsLoading } = useDocuments({ employeeId: id })
  const { data: reviews, isLoading: reviewsLoading } = usePerformanceReviews(id)
  const { data: employeeAssignments, isLoading: assetsLoading } = useEmployeeAssets(id!)
  const uploadAvatar = useUploadEmployeeAvatar(id!)
  const uploadDoc = useUploadDocument()
  const [editOpen, setEditOpen] = React.useState(false)
  const [viewDoc, setViewDoc] = React.useState<{ id: string; fileName?: string } | null>(null)
  const avatarInputRef = React.useRef<HTMLInputElement>(null)
  const docInputRef = React.useRef<HTMLInputElement>(null)

  const e = employee as any

  const handleAvatarChange = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be smaller than 5 MB')
      return
    }
    uploadAvatar.mutate(file, {
      onSuccess: () => toast.success('Profile image updated'),
      onError: (err: any) => toast.error(err?.message ?? 'Upload failed'),
    })
    ev.target.value = ''
  }

  const handleDocChange = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File must be smaller than 10 MB')
      return
    }
    uploadDoc.mutate(
      { file, employeeId: id, category: 'other', docType: file.name },
      {
        onSuccess: () => toast.success('Document uploaded'),
        onError: (err: any) => toast.error(err?.message ?? 'Upload failed'),
      },
    )
    ev.target.value = ''
  }

  if (isLoading) {
    return (
      <PageWrapper>
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-9 rounded-md" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-64" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
          <Skeleton className="h-72 lg:col-span-1" />
          <Skeleton className="h-72 lg:col-span-3" />
        </div>
      </PageWrapper>
    )
  }

  if (!e) {
    return (
      <PageWrapper>
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-64 gap-3">
            <p className="text-muted-foreground">{t('employees.noEmployees')}</p>
            <Button variant="outline" size="sm" onClick={() => navigate('/employees')}>
              {t('common.back')}
            </Button>
          </CardContent>
        </Card>
      </PageWrapper>
    )
  }

  // eslint-disable-next-line react-hooks/purity
  const visaDays = e.visaExpiry
    ? Math.ceil((new Date(e.visaExpiry).getTime() - Date.now()) / 86400000)
    : null

  return (
    <PageWrapper>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => navigate('/employees')}
          aria-label="Back to employees"
          className="shrink-0 self-start"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight font-display truncate">
              {e.fullName}
            </h1>
            <Badge variant={statusVariant[e.status] ?? 'secondary'} className="capitalize text-xs">
              {e.status?.replace('_', ' ')}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {e.designation} &middot; {e.department} &middot; {e.employeeNo}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Download className="h-3.5 w-3.5" />}
            onClick={() => {
              const rows: [string, string][] = [
                ['Employee No', e.employeeNo ?? ''],
                ['Full Name', e.fullName ?? ''],
                ['Designation', e.designation ?? ''],
                ['Department', e.department ?? ''],
                ['Email', e.email ?? ''],
                ['Phone', e.phone ?? ''],
                ['Nationality', e.nationality ?? ''],
                ['Status', e.status ?? ''],
                ['Join Date', e.joinDate ?? ''],
                ['Visa Expiry', e.visaExpiry ?? ''],
                ['Passport No', e.passportNo ?? ''],
                ['Emirates ID', e.emiratesId ?? ''],
              ]
              const csv = rows
                .map(([k, v]) => `"${k}","${String(v).replace(/"/g, '""')}"`)
                .join('\n')
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
              const a = document.createElement('a')
              a.href = URL.createObjectURL(blob)
              a.download = `employee-${e.employeeNo ?? e.id}.csv`
              document.body.appendChild(a)
              a.click()
              a.remove()
            }}
          >
            Export
          </Button>
          <Button size="sm" leftIcon={<Edit2 className="h-3.5 w-3.5" />} onClick={() => setEditOpen(true)}>
            Edit
          </Button>
        </div>
      </div>

      {editOpen && <EditEmployeeDialog open={editOpen} onOpenChange={setEditOpen} employee={e} />}
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleAvatarChange}
      />
      <input ref={docInputRef} type="file" className="hidden" onChange={handleDocChange} />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 lg:gap-5">
        {/* Sidebar profile card */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardContent className="p-5 flex flex-col items-center text-center">
              <div className="relative group mb-3">
                <Avatar className="h-20 w-20">
                  {e.avatarUrl && <AvatarImage src={e.avatarUrl} alt={e.fullName} />}
                  <AvatarFallback className="text-xl font-bold bg-primary text-primary-foreground">
                    {getInitials(e.fullName)}
                  </AvatarFallback>
                </Avatar>
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={uploadAvatar.isPending}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition disabled:opacity-100"
                  aria-label="Change profile image"
                >
                  {uploadAvatar.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Camera className="h-5 w-5" />
                  )}
                </button>
              </div>
              <h2 className="font-bold text-base font-display">{e.fullName}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{e.designation}</p>
              <p className="text-[11px] text-muted-foreground">{e.department}</p>
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadAvatar.isPending}
                className="mt-3 text-[11px] text-primary hover:underline inline-flex items-center gap-1"
              >
                <Camera className="h-3 w-3" />
                {e.avatarUrl ? 'Change photo' : 'Upload photo'}
              </button>

              <div className="w-full mt-4 space-y-2">
                {(e.workEmail ?? e.email) && (
                  <div className="flex items-center gap-2 text-xs text-left">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{e.workEmail ?? e.email}</span>
                  </div>
                )}
                {(e.mobileNo ?? e.phone) && (
                  <div className="flex items-center gap-2 text-xs text-left">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span>{e.mobileNo ?? e.phone}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Quick stats */}
          {[
            {
              label: 'Visa Status',
              value:
                visaDays === null
                  ? 'N/A'
                  : visaDays < 0
                    ? 'Expired'
                    : `${visaDays}d left`,
              color:
                visaDays === null
                  ? ''
                  : visaDays < 0
                    ? 'text-destructive'
                    : visaDays < 90
                      ? 'text-warning'
                      : 'text-success',
            },
            { label: 'Total Salary', value: formatCurrency(e.totalSalary ?? 0), color: '' },
            { label: 'Join Date', value: formatDate(e.joinDate), color: '' },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  {s.label}
                </p>
                <p
                  className={cn(
                    'text-base font-bold mt-0.5 font-display',
                    s.color || 'text-foreground',
                  )}
                >
                  {s.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main content */}
        <div className="lg:col-span-3">
          <Tabs defaultValue="personal">
            <TabsList className="w-full sm:w-auto sm:inline-flex overflow-x-auto">
              <TabsTrigger value="personal" className="gap-1.5 text-xs">
                <User className="h-3.5 w-3.5" /> Personal
              </TabsTrigger>
              <TabsTrigger value="employment" className="gap-1.5 text-xs">
                <Briefcase className="h-3.5 w-3.5" /> Employment
              </TabsTrigger>
              <TabsTrigger value="visa" className="gap-1.5 text-xs">
                <Plane className="h-3.5 w-3.5" /> Visa &amp; ID
              </TabsTrigger>
              <TabsTrigger value="documents" className="gap-1.5 text-xs">
                <FileText className="h-3.5 w-3.5" /> Documents
              </TabsTrigger>
              <TabsTrigger value="payroll" className="gap-1.5 text-xs">
                <CreditCard className="h-3.5 w-3.5" /> Payroll
              </TabsTrigger>
              <TabsTrigger value="performance" className="gap-1.5 text-xs">
                <Star className="h-3.5 w-3.5" /> Performance
              </TabsTrigger>
              <TabsTrigger value="assets" className="gap-1.5 text-xs">
                <Package className="h-3.5 w-3.5" /> Assets
              </TabsTrigger>
            </TabsList>

            <TabsContent value="personal" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Personal Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                    <div>
                      <InfoRow label="Full Name" value={e.fullName} icon={User} />
                      <InfoRow label="Date of Birth" value={formatDate(e.dateOfBirth)} icon={Calendar} />
                      <InfoRow label="Gender" value={e.gender} icon={User} />
                      <InfoRow label="Nationality" value={e.nationality} icon={MapPin} />
                      <InfoRow label="Marital Status" value={e.maritalStatus} />
                    </div>
                    <div>
                      <InfoRow label="Mobile" value={e.mobileNo ?? e.phone} icon={Phone} />
                      <InfoRow label="Personal Email" value={e.personalEmail} icon={Mail} />
                      <InfoRow label="Work Email" value={e.workEmail ?? e.email} icon={Mail} />
                      <InfoRow label="Emergency Contact" value={e.emergencyContact} icon={Phone} />
                      <InfoRow label="Address" value={e.homeCountryAddress} icon={MapPin} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="employment" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Employment Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                    <div>
                      <InfoRow label="Employee No." value={e.employeeNo} icon={Hash} />
                      <InfoRow label="Designation" value={e.designation} icon={Briefcase} />
                      <InfoRow label="Department" value={e.department} icon={Building2} />
                      <InfoRow label="Company" value={e.entityName ?? '—'} icon={Building2} />
                      <InfoRow label="Contract Type" value={e.contractType} />
                      <InfoRow label="Work Location" value={e.workLocation} icon={MapPin} />
                    </div>
                    <div>
                      <InfoRow label="Join Date" value={formatDate(e.joinDate)} icon={Calendar} />
                      <InfoRow label="Probation End" value={formatDate(e.probationEndDate)} icon={Clock} />
                      <InfoRow label="Contract End" value={formatDate(e.contractEndDate)} icon={Calendar} />
                      <InfoRow label="Status" value={e.status?.replace('_', ' ')} icon={Shield} />
                      <InfoRow label="Grade / Band" value={e.gradeLevel} />
                      <InfoRow label="Direct Manager" value={e.managerName} icon={User} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="visa" className="mt-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <CardTitle className="text-base">Visa &amp; Immigration</CardTitle>
                    {visaDays !== null && (
                      <Badge
                        variant={
                          visaDays < 0
                            ? 'destructive'
                            : visaDays < 30
                              ? 'destructive'
                              : visaDays < 90
                                ? 'warning'
                                : 'success'
                        }
                        className="text-xs"
                      >
                        {visaDays < 0
                          ? 'Visa Expired'
                          : visaDays < 30
                            ? `Expiring in ${visaDays}d`
                            : `Valid — ${visaDays}d left`}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                    <div>
                      <InfoRow label="Visa Type" value={e.visaType?.replace(/_/g, ' ')} icon={Plane} />
                      <InfoRow label="Visa Number" value={e.visaNumber} icon={Hash} />
                      <InfoRow label="Visa Issue Date" value={formatDate(e.visaIssueDate)} icon={Calendar} />
                      <InfoRow label="Visa Expiry" value={formatDate(e.visaExpiry)} icon={Calendar} />
                      <InfoRow label="Sponsoring Entity" value={e.sponsoringEntity} icon={Building2} />
                    </div>
                    <div>
                      <InfoRow label="Emirates ID" value={e.emiratesId} icon={Hash} />
                      <InfoRow label="EID Expiry" value={formatDate(e.emiratesIdExpiry)} icon={Calendar} />
                      <InfoRow label="Passport No." value={e.passportNo} icon={Hash} />
                      <InfoRow label="Passport Expiry" value={formatDate(e.passportExpiry)} icon={Calendar} />
                      <InfoRow label="Labour Card No." value={e.labourCardNumber} icon={Hash} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

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
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : (docsResult?.data as unknown[] | undefined ?? []).length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground">
                      <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
                      <p className="text-sm font-medium">No documents uploaded</p>
                      <p className="text-xs mt-1">Upload contracts, certificates, and ID documents</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {(docsResult?.data as Array<{ id: string; fileName?: string; docType?: string; category: string; status: string; createdAt: string }> ?? []).map((doc) => (
                        <div key={doc.id} className="flex items-center justify-between py-3">
                          <div className="flex items-center gap-3">
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div>
                              <p className="text-sm font-medium">{doc.fileName ?? doc.docType ?? 'Untitled'}</p>
                              <p className="text-xs text-muted-foreground capitalize">
                                {doc.category?.replace(/_/g, ' ')} · {formatDate(doc.createdAt)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={doc.status === 'verified' ? 'success' : doc.status === 'expired' ? 'destructive' : 'secondary'} className="text-[10px] capitalize">
                              {doc.status}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="View document"
                              onClick={() => setViewDoc({ id: doc.id, fileName: doc.fileName ?? doc.docType })}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Download document"
                              onClick={async () => {
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
                                  toast.error('Download failed')
                                }
                              }}
                            >
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

            <TabsContent value="payroll" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Payroll Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                    <div>
                      <InfoRow label="Basic Salary" value={formatCurrency(e.basicSalary ?? 0)} icon={CreditCard} />
                      <InfoRow label="Housing Allow." value={formatCurrency(e.housingAllowance ?? 0)} />
                      <InfoRow label="Transport Allow." value={formatCurrency(e.transportAllowance ?? 0)} />
                      <InfoRow label="Other Allow." value={formatCurrency(e.otherAllowances ?? 0)} />
                    </div>
                    <div>
                      <InfoRow label="Total Salary" value={formatCurrency(e.totalSalary ?? 0)} icon={CreditCard} />
                      <InfoRow label="Payment Method" value={e.paymentMethod} />
                      <InfoRow label="Bank" value={e.bankName} icon={Building2} />
                      <InfoRow label="IBAN" value={e.iban} icon={Hash} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="performance" className="mt-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Performance &amp; Notes</CardTitle>
                    <Button
                      size="sm"
                      variant="outline"
                      leftIcon={<Plus className="h-3.5 w-3.5" />}
                      onClick={() => navigate(`/performance?employeeId=${id}`)}
                    >
                      New review
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {reviewsLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
                    </div>
                  ) : !reviews || reviews.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground">
                      <Star className="h-10 w-10 mx-auto mb-3 opacity-30" />
                      <p className="text-sm font-medium">No performance records yet</p>
                      <p className="text-xs mt-1">Reviews and performance data will appear here</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {reviews.map((r) => (
                        <div key={r.id} className="py-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{r.period}</p>
                            <p className="text-xs text-muted-foreground">
                              {r.reviewDate ? formatDate(r.reviewDate) : '—'}
                              {r.overallRating != null && ` · ${r.overallRating}/5`}
                            </p>
                            {r.managerComments && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {r.managerComments}
                              </p>
                            )}
                          </div>
                          <Badge
                            variant={r.status === 'completed' ? 'success' : r.status === 'submitted' ? 'info' : 'secondary'}
                            className="text-[10px] capitalize shrink-0"
                          >
                            {r.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="assets" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Assigned Assets</CardTitle>
                </CardHeader>
                <CardContent>
                  {assetsLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                    </div>
                  ) : !employeeAssignments || employeeAssignments.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground">
                      <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
                      <p className="text-sm font-medium">No assets assigned</p>
                      <p className="text-xs mt-1">Assets assigned to this employee will appear here</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {employeeAssignments.map((a) => (
                        <div key={a.id} className="flex items-center justify-between py-3">
                          <div className="flex items-center gap-3">
                            <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div>
                              <p className="text-sm font-medium">{a.assetName}</p>
                              <p className="text-xs text-muted-foreground">
                                {a.categoryName && `${a.categoryName} · `}
                                {a.assetBrand} {a.assetModel}
                                {a.assetSerialNumber && ` · S/N: ${a.assetSerialNumber}`}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Assigned: {formatDate(a.assignedDate)}
                                {a.expectedReturnDate && ` · Due: ${formatDate(a.expectedReturnDate)}`}
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
          </Tabs>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleAvatarChange}
      />
      <input
        ref={docInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx"
        className="hidden"
        onChange={handleDocChange}
      />

      {editOpen && e && (
        <EditEmployeeDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          employee={e}
        />
      )}
      <DocumentViewerDialog
        open={!!viewDoc}
        onOpenChange={(o) => !o && setViewDoc(null)}
        documentId={viewDoc?.id ?? null}
        fileName={viewDoc?.fileName}
      />
    </PageWrapper>
  )
}
