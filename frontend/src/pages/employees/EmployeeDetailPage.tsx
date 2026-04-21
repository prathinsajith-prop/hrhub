import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, User, Briefcase, Plane, FileText, CreditCard, Star,
  Phone, Mail, MapPin, Calendar, Building2, Hash, Shield, Edit2,
  Clock, CheckCircle2, AlertTriangle, Download
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, Badge, Avatar, AvatarFallback, Progress } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { cn, formatDate, formatCurrency, getInitials } from '@/lib/utils'
import { useEmployee } from '@/hooks/useEmployees'
import { PageWrapper } from '@/components/layout/PageWrapper'

const tabs = [
  { id: 'personal', label: 'Personal', icon: User },
  { id: 'employment', label: 'Employment', icon: Briefcase },
  { id: 'visa', label: 'Visa & ID', icon: Plane },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'payroll', label: 'Payroll', icon: CreditCard },
  { id: 'performance', label: 'Performance', icon: Star },
]

const statusVariant: Record<string, any> = {
  active: 'success', probation: 'warning', onboarding: 'info',
  suspended: 'destructive', terminated: 'secondary', visa_expired: 'destructive',
}

function InfoRow({ label, value, icon: Icon }: { label: string; value?: string | null; icon?: React.ElementType }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/50 last:border-0">
      {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />}
      <div className="flex-1 min-w-0 flex items-start justify-between gap-4">
        <span className="text-xs text-muted-foreground shrink-0 w-32">{label}</span>
        <span className="text-sm font-medium text-right text-foreground">{value ?? '—'}</span>
      </div>
    </div>
  )
}

export function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('personal')
  const { data: employee, isLoading } = useEmployee(id!)

  const e = employee as any

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    )
  }

  if (!e) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-muted-foreground">Employee not found</p>
        <Button variant="outline" size="sm" onClick={() => navigate('/employees')}>Back to Employees</Button>
      </div>
    )
  }

  const visaDays = e.visaExpiry
    ? Math.ceil((new Date(e.visaExpiry).getTime() - Date.now()) / 86400000)
    : null

  return (
    <PageWrapper>
      {/* Back + header */}
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => navigate('/employees')}
          aria-label="Back to employees"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold">
              {e.fullName}
            </h1>
            <Badge variant={statusVariant[e.status] ?? 'secondary'} className="capitalize text-xs">
              {e.status?.replace('_', ' ')}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {e.designation} · {e.department} · {e.employeeNo}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" leftIcon={<Download className="h-3.5 w-3.5" />}>
            Export
          </Button>
          <Button size="sm" leftIcon={<Edit2 className="h-3.5 w-3.5" />}>
            Edit
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Sidebar profile card */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardContent className="p-5 flex flex-col items-center text-center">
              <Avatar className="h-20 w-20 mb-3">
                <AvatarFallback className="text-xl font-bold bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
                  {getInitials(e.fullName)}
                </AvatarFallback>
              </Avatar>
              <h2 className="font-bold text-base">{e.fullName}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{e.designation}</p>
              <p className="text-[11px] text-muted-foreground">{e.department}</p>

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
              value: visaDays === null ? 'N/A' : visaDays < 0 ? 'Expired' : `${visaDays}d left`,
              color: visaDays === null ? '' : visaDays < 0 ? 'text-red-600' : visaDays < 90 ? 'text-amber-600' : 'text-emerald-600',
            },
            { label: 'Total Salary', value: formatCurrency(e.totalSalary ?? 0), color: '' },
            { label: 'Join Date', value: formatDate(e.joinDate), color: '' },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
                <p className={cn('text-base font-bold mt-0.5 font-display', s.color || 'text-foreground')}>
                  {s.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main content */}
        <div className="lg:col-span-3 space-y-4">
          {/* Tabs */}
          <div className="flex gap-1 p-1 rounded-xl bg-muted overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap',
                  activeTab === tab.id
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab panels */}
          {activeTab === 'personal' && (
            <Card>
              <CardHeader>
                <CardTitle>Personal Information</CardTitle>
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
          )}

          {activeTab === 'employment' && (
            <Card>
              <CardHeader>
                <CardTitle>Employment Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                  <div>
                    <InfoRow label="Employee No." value={e.employeeNo} icon={Hash} />
                    <InfoRow label="Designation" value={e.designation} icon={Briefcase} />
                    <InfoRow label="Department" value={e.department} icon={Building2} />
                    <InfoRow label="Company" value={e.companyName ?? e.entityName} icon={Building2} />
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
          )}

          {activeTab === 'visa' && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle>Visa & Immigration</CardTitle>
                    {visaDays !== null && (
                      <Badge
                        variant={visaDays < 0 ? 'destructive' : visaDays < 30 ? 'destructive' : visaDays < 90 ? 'warning' : 'success'}
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
            </div>
          )}

          {activeTab === 'documents' && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Employee Documents</CardTitle>
                  <Button size="sm" leftIcon={<FileText className="h-3.5 w-3.5" />}>Upload</Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-center py-10 text-muted-foreground">
                  <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-medium">No documents uploaded</p>
                  <p className="text-xs mt-1">Upload contracts, certificates, and ID documents</p>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'payroll' && (
            <Card>
              <CardHeader>
                <CardTitle>Payroll Summary</CardTitle>
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
          )}

          {activeTab === 'performance' && (
            <Card>
              <CardHeader>
                <CardTitle>Performance & Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-10 text-muted-foreground">
                  <Star className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-medium">No performance records yet</p>
                  <p className="text-xs mt-1">Reviews and performance data will appear here</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </PageWrapper>
  )
}
