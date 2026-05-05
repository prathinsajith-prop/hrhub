import { useMemo, useState, memo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { labelFor } from '@/lib/enums'
import {
  MoreHorizontal,
  UserPlus,
  Download,
  Eye,
  Edit2,
  Mail,
  Trash2,
  Users,
  Clock,
  Star,
  UserCheck,
  RefreshCcw,
  CheckCircle2,
  Ban,
  UserX,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { DataTable } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmDialog, toast } from '@/components/ui/overlays'
import { useTranslation } from 'react-i18next'
import { KpiCardCompact } from '@/components/shared/KpiCard'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { cn, formatDate, formatCurrency, getInitials } from '@/lib/utils'
import { useEmployees, useArchiveEmployee, useUpdateEmployeeStatus, exportEmployeesCsv } from '@/hooks/useEmployees'
import { exportEmployees } from '@/lib/export'
import { AddEmployeeDialog, EditEmployeeDialog } from '@/components/shared/action-dialogs'
import { ExportDropdown } from '@/components/shared/ExportDropdown'
import { InviteEmployeeDialog } from '@/components/shared/InviteEmployeeDialog'
import { usePermissions } from '@/hooks/usePermissions'
import { useSearchFilters } from '@/hooks/useSearchFilters'
import { useOrgUnits } from '@/hooks/useOrgUnits'
import { FlagImg, resolveCountryIso } from '@/components/shared/PhoneInput'
import { CopyableEmail } from '@/components/shared'
import type { FilterConfig } from '@/lib/filters'
import type { Employee } from '@/types'

const EMPLOYEE_FILTERS: FilterConfig[] = [
  {
    name: 'status',
    label: 'Status',
    type: 'select',
    field: 'status',
    icon: Star,
    options: [
      { value: 'active', label: 'Active' },
      { value: 'onboarding', label: 'Onboarding' },
      { value: 'suspended', label: 'Suspended' },
      { value: 'terminated', label: 'Terminated' },
      { value: 'visa_expired', label: 'Visa expired' },
    ],
  },
  { name: 'department', label: 'Department', type: 'text', field: 'department', icon: Users },
  { name: 'designation', label: 'Designation', type: 'text', field: 'designation' },
  { name: 'nationality', label: 'Nationality', type: 'text', field: 'nationality' },
  { name: 'salary', label: 'Salary (AED)', type: 'number_range', field: 'totalSalary', min: 0, step: 500, prefix: 'AED' },
  { name: 'joinDate', label: 'Join date', type: 'date_range', field: 'joinDate' },
  { name: 'visaExpiry', label: 'Visa expiry', type: 'date_range', field: 'visaExpiry', icon: Clock },
  { name: 'emirati', label: 'Emirati only', type: 'toggle', field: 'emiratisationCategory' },
]

const statusVariant: Record<
  string,
  'success' | 'warning' | 'destructive' | 'info' | 'secondary'
> = {
  active: 'success',
  onboarding: 'info',
  suspended: 'destructive',
  terminated: 'secondary',
  visa_expired: 'destructive',
}

const ActionMenu = memo(function ActionMenu({
  employee,
  onDelete,
  onEdit,
  onInvite,
  onStatusChange,
  canManage,
}: {
  employee: Employee
  onDelete: (e: Employee) => void
  onEdit: (e: Employee) => void
  onInvite: (e: Employee) => void
  onStatusChange: (e: Employee, status: 'active' | 'suspended' | 'terminated') => void
  canManage: boolean
}) {
  const navigate = useNavigate()
  const s = employee.status
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground" onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52" onClick={e => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => navigate(`/employees/${employee.id}`)}>
          <Eye className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
          View Profile
        </DropdownMenuItem>
        {canManage && (
          <DropdownMenuItem onClick={() => onEdit(employee)}>
            <Edit2 className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
            Edit Details
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          disabled={!(employee.workEmail || employee.email)}
          onClick={() => {
            const em = employee.workEmail || employee.email
            if (em) window.open(`mailto:${em}`, '_self')
          }}
        >
          <Mail className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
          Send Email
        </DropdownMenuItem>
        {canManage && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onInvite(employee)}>
              <UserCheck className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
              Manage Login Access
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {s !== 'active' && (
              <DropdownMenuItem
                onClick={() => onStatusChange(employee, 'active')}
                className="text-success focus:text-success focus:bg-success/10"
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-2" />
                Activate
              </DropdownMenuItem>
            )}
            {(s === 'active' || s === 'onboarding') && (
              <DropdownMenuItem
                onClick={() => onStatusChange(employee, 'suspended')}
                className="text-amber-600 focus:text-amber-600 focus:bg-amber-50"
              >
                <Ban className="h-3.5 w-3.5 mr-2" />
                Suspend
              </DropdownMenuItem>
            )}
            {s !== 'terminated' && (
              <DropdownMenuItem
                onClick={() => onStatusChange(employee, 'terminated')}
                className="text-destructive focus:text-destructive focus:bg-destructive/10"
              >
                <UserX className="h-3.5 w-3.5 mr-2" />
                Terminate
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(employee)}
              className="text-muted-foreground focus:text-destructive focus:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Archive Record
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
})

export function EmployeesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { can } = usePermissions()
  const canManage = can('manage_employees')
  const search = useSearchFilters({
    storageKey: 'hrhub.employees.searchHistory',
    availableFilters: EMPLOYEE_FILTERS,
  })

  const filterStatus = (search.appliedFilters.status?.value as string | undefined) || undefined
  const filterDept = (search.appliedFilters.department?.value as string | undefined) || undefined

  const { data: empData, isLoading, isFetching, isError, error, refetch } = useEmployees({ limit: 50, search: search.searchInput || undefined, status: filterStatus, department: filterDept })
  const { data: orgUnits = [] } = useOrgUnits()
  const orgUnitName = useMemo(() => {
    const map = new Map(orgUnits.map(u => [u.id, u.name]))
    return (id: string | undefined | null) => (id ? (map.get(id) ?? null) : null)
  }, [orgUnits])
  const employeesRaw = useMemo(() => (empData?.data as Employee[]) ?? [], [empData?.data])
  const employees: Employee[] = employeesRaw
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null)
  const [editTarget, setEditTarget] = useState<Employee | null>(null)
  const [inviteTarget, setInviteTarget] = useState<Employee | null>(null)
  const [statusTarget, setStatusTarget] = useState<{ employee: Employee; status: 'active' | 'suspended' | 'terminated' } | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const archiveEmployee = useArchiveEmployee()
  const updateStatus = useUpdateEmployeeStatus()

  async function handleExportCsv() {
    await exportEmployeesCsv({
      department: search.appliedFilters.department?.value as string | undefined,
      status: search.appliedFilters.status?.value as string | undefined,
    })
  }
  const filtered = useMemo(() => {
    const f = search.appliedFilters
    return employees.filter((e: Employee) => {
      if (f.designation?.value && !String(e.designation ?? '').toLowerCase().includes(String(f.designation.value).toLowerCase())) return false
      if (f.nationality?.value && !String(e.nationality ?? '').toLowerCase().includes(String(f.nationality.value).toLowerCase())) return false
      if (f.salary?.value) {
        const { min, max } = f.salary.value as { min?: number; max?: number }
        const v = Number(e.totalSalary ?? 0)
        if (min != null && v < min) return false
        if (max != null && v > max) return false
      }
      if (f.joinDate?.value) {
        const { from, to } = f.joinDate.value as { from?: string; to?: string }
        if (from && e.joinDate && new Date(e.joinDate) < new Date(from)) return false
        if (to && e.joinDate && new Date(e.joinDate) > new Date(to)) return false
      }
      if (f.visaExpiry?.value) {
        const { from, to } = f.visaExpiry.value as { from?: string; to?: string }
        if (from && e.visaExpiry && new Date(e.visaExpiry) < new Date(from)) return false
        if (to && e.visaExpiry && new Date(e.visaExpiry) > new Date(to)) return false
      }
      if (f.emirati?.value === true && e.emiratisationCategory !== 'emirati') return false
      return true
    })
  }, [employees, search.appliedFilters])

  const active = employees.filter((e: Employee) => e.status === 'active').length
  const onboarding = employees.filter((e: Employee) => e.status === 'onboarding').length
  const probation = employees.filter((e: Employee) => e.contractType === 'probation').length
  const emiratis = employees.filter((e: Employee) => e.emiratisationCategory === 'emirati').length

  const handleDelete = () => {
    if (!deleteTarget) return
    archiveEmployee.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success('Record archived', `${deleteTarget.fullName}'s record has been archived.`)
        setDeleteTarget(null)
      },
      onError: () => {
        toast.error('Failed', 'Could not archive employee. Please try again.')
        setDeleteTarget(null)
      },
    })
  }

  const STATUS_CONFIG = {
    active:     { label: 'Activate',  past: 'activated',  variant: 'success'     as const },
    suspended:  { label: 'Suspend',   past: 'suspended',  variant: 'warning'     as const },
    terminated: { label: 'Terminate', past: 'terminated', variant: 'destructive' as const },
  }

  const handleStatusChange = () => {
    if (!statusTarget) return
    updateStatus.mutate({ id: statusTarget.employee.id, status: statusTarget.status }, {
      onSuccess: () => {
        const cfg = STATUS_CONFIG[statusTarget.status]
        toast.success('Status updated', `${statusTarget.employee.fullName} has been ${cfg.past}.`)
        setStatusTarget(null)
      },
      onError: () => {
        toast.error('Failed', 'Could not update employee status. Please try again.')
        setStatusTarget(null)
      },
    })
  }

  const columns: ColumnDef<Employee>[] = useMemo(() => [
    {
      id: 'employee',
      header: 'Employee',
      cell: ({ row: { original: e } }) => (
        <button
          onClick={() => navigate(`/employees/${e.id}`)}
          className="flex items-center gap-3 text-left hover:opacity-80 transition-opacity"
        >
          <Avatar className="h-8 w-8 shrink-0">
            {e.avatarUrl && <AvatarImage src={e.avatarUrl} alt={e.fullName} />}
            <AvatarFallback className="text-[10px] font-semibold bg-primary text-primary-foreground">
              {getInitials(e.fullName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-0.5">
            <p className="font-semibold text-sm text-foreground truncate">{e.fullName}</p>
            <div className="flex items-center gap-1.5 min-w-0">
              <p className="text-[11px] text-muted-foreground shrink-0">{e.employeeNo}</p>
              {e.designation && (
                <Badge className="text-[10px] font-medium px-1.5 py-0 rounded-md truncate bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800">
                  {e.designation}
                </Badge>
              )}
            </div>
            {(() => {
              const email = e.workEmail || (e as any).email || e.personalEmail || null
              return email ? (
                <span onClick={ev => ev.stopPropagation()}>
                  <CopyableEmail email={email} className="text-[11px] text-muted-foreground/70 truncate" />
                </span>
              ) : null
            })()}
          </div>
        </button>
      ),
      size: 260,
    },
    {
      id: 'department',
      header: 'Department',
      cell: ({ row: { original: e } }) => {
        const branch = orgUnitName(e.branchId)
        const division = orgUnitName(e.divisionId)
        const dept = orgUnitName(e.departmentId) ?? e.department ?? null
        const parts = [branch, division, dept].filter(Boolean) as string[]
        if (parts.length === 0) return <span className="text-xs text-muted-foreground">—</span>
        return (
          <div className="flex items-center gap-1 min-w-0 flex-wrap">
            {parts.map((part, i) => (
              <span key={i} className="flex items-center gap-1 min-w-0">
                {i > 0 && <span className="text-muted-foreground/40 text-[10px] shrink-0">›</span>}
                <span className={cn(
                  'truncate text-xs',
                  i === parts.length - 1
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground/70',
                )}>
                  {part}
                </span>
              </span>
            ))}
          </div>
        )
      },
      size: 200,
    },
    {
      accessorKey: 'nationality',
      header: 'Nationality',
      cell: ({ getValue }) => {
        const nat = getValue() as string | null | undefined
        if (!nat) return <span className="text-xs text-muted-foreground">—</span>
        const iso = resolveCountryIso(nat)
        return (
          <div className="flex items-center gap-2 min-w-0">
            {iso && <FlagImg iso2={iso} size={16} className="shrink-0" />}
            <span className="text-xs truncate">{nat}</span>
          </div>
        )
      },
      size: 150,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ getValue }) => {
        const s = getValue() as string
        return (
          <Badge variant={statusVariant[s] ?? 'secondary'} className="capitalize text-[11px]">
            {labelFor(s)}
          </Badge>
        )
      },
      size: 120,
    },
    {
      id: 'visa',
      header: 'Visa Expiry',
      cell: ({ row: { original: e } }) => {
        if (!e.visaExpiry) return <span className="text-xs text-muted-foreground">—</span>
        const days = Math.ceil(
          (new Date(e.visaExpiry).getTime() - Date.now()) / 86400000,
        )
        return (
          <div>
            <p
              className={cn(
                'text-xs font-semibold',
                days < 0
                  ? 'text-destructive'
                  : days < 30
                    ? 'text-destructive'
                    : days < 90
                      ? 'text-warning'
                      : 'text-success',
              )}
            >
              {days < 0 ? 'Expired' : `${days}d left`}
            </p>
            <p className="text-[10px] text-muted-foreground">{formatDate(e.visaExpiry)}</p>
          </div>
        )
      },
      size: 110,
    },
    {
      accessorKey: 'totalSalary',
      header: 'Salary (AED)',
      cell: ({ getValue }) => (
        <span className="text-sm font-semibold">{formatCurrency(getValue() as number)}</span>
      ),
      size: 130,
    },
    {
      accessorKey: 'joinDate',
      header: 'Join Date',
      cell: ({ getValue }) => <span className="text-sm">{formatDate(getValue() as string)}</span>,
      size: 110,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <ActionMenu employee={row.original} onDelete={setDeleteTarget} onEdit={setEditTarget} onInvite={setInviteTarget} onStatusChange={(e, s) => setStatusTarget({ employee: e, status: s })} canManage={canManage} />
      ),
      size: 44,
    },
  ], [navigate, canManage, orgUnitName])

  return (
    <PageWrapper>
      <PageHeader
        title={t('employees.title')}
        description={t('employees.description')}
        actions={
          <>
            <Button variant="outline" size="sm" leftIcon={<RefreshCcw className={isFetching ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />} onClick={() => refetch()} disabled={isFetching}>
              Refresh
            </Button>
            <ExportDropdown
              onExportCsv={handleExportCsv}
              onExportPdf={() => exportEmployees({ format: 'pdf' }).catch(() => toast.error('Export failed', 'Could not download PDF.'))}
            />
            {canManage && (
              <Button size="sm" leftIcon={<UserPlus className="h-3.5 w-3.5" />} onClick={() => setAddOpen(true)}>
                Add Employee
              </Button>
            )}
          </>
        }
      />

      {/* Error banner */}
      {isError && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-center justify-between py-3 px-4">
            <p className="text-sm text-destructive font-medium">
              Failed to load employees: {(error as Error)?.message ?? 'Unknown error'}
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCardCompact label="Active" value={active} icon={Users} color="green" loading={isLoading} />
        <KpiCardCompact label="Onboarding" value={onboarding} icon={UserPlus} color="blue" loading={isLoading} />
        <KpiCardCompact label="Probation" value={probation} icon={Clock} color="amber" loading={isLoading} />
        <KpiCardCompact label="Emiratis" value={emiratis} icon={Star} color="cyan" loading={isLoading} />
      </div>

      {/* Table card */}
      <Card>
        <CardHeader className="flex-row items-start sm:items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base">All Employees</CardTitle>
            <CardDescription className="mt-0.5">
              {employees.length} total records
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            advancedFilter={{
              search,
              filters: EMPLOYEE_FILTERS,
              placeholder: 'Search by name, ID, email…',
            }}
            pageSize={8}
            emptyMessage="No employees found."
            enableSelection
            onRowClick={(row: Employee) => navigate(`/employees/${row.id}`)}
            getRowId={(row: Employee) => String(row.id)}
            bulkActions={(selected) => (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Download className="h-3.5 w-3.5" />}
                  onClick={() => toast.success(`Exported ${selected.length} employees to CSV`)}
                >
                  Export
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Mail className="h-3.5 w-3.5" />}
                  onClick={() => toast.info(`Email composed to ${selected.length} recipients`)}
                >
                  Email
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                  onClick={() => toast.warning(`${selected.length} employees queued for termination review`)}
                >
                  Terminate
                </Button>
              </>
            )}
          />
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Archive Employee Record"
        description={`Are you sure you want to archive ${deleteTarget?.fullName}'s record? This action removes them from all active lists.`}
        confirmLabel="Archive"
        onConfirm={handleDelete}
        variant="destructive"
      />

      {statusTarget && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setStatusTarget(null)}
          title={`${STATUS_CONFIG[statusTarget.status].label} Employee`}
          description={
            statusTarget.status === 'active'
              ? `Restore ${statusTarget.employee.fullName} to active status. They will regain access to all HR systems.`
              : statusTarget.status === 'suspended'
              ? `Suspend ${statusTarget.employee.fullName}'s account. Their access will be disabled until reactivated.`
              : `Mark ${statusTarget.employee.fullName} as terminated. This updates their employment status across all records.`
          }
          confirmLabel={STATUS_CONFIG[statusTarget.status].label}
          onConfirm={handleStatusChange}
          variant={STATUS_CONFIG[statusTarget.status].variant}
        />
      )}

      <AddEmployeeDialog open={addOpen} onOpenChange={setAddOpen} />
      {editTarget && (
        <EditEmployeeDialog
          open={!!editTarget}
          onOpenChange={(open) => !open && setEditTarget(null)}
          employee={editTarget}
        />
      )}
      {inviteTarget && (
        <InviteEmployeeDialog
          employee={inviteTarget}
          open={!!inviteTarget}
          onOpenChange={(open) => !open && setInviteTarget(null)}
        />
      )}
    </PageWrapper>
  )
}
