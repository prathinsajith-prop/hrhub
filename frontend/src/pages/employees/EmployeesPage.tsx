import { useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
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
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { DataTable } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
import { KpiCardCompact } from '@/components/ui/kpi-card'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { cn, formatDate, formatCurrency, getInitials } from '@/lib/utils'
import { useEmployees } from '@/hooks/useEmployees'
import { AddEmployeeDialog, EditEmployeeDialog } from '@/components/shared/action-dialogs'
import type { Employee } from '@/types'

const statusVariant: Record<
  string,
  'success' | 'warning' | 'destructive' | 'info' | 'secondary'
> = {
  active: 'success',
  probation: 'warning',
  onboarding: 'info',
  suspended: 'destructive',
  terminated: 'secondary',
  visa_expired: 'destructive',
}

function ActionMenu({
  employee,
  onDelete,
  onEdit,
}: {
  employee: Employee
  onDelete: (e: Employee) => void
  onEdit: (e: Employee) => void
}) {
  const navigate = useNavigate()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => navigate(`/employees/${employee.id}`)}>
          <Eye className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
          View Profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onEdit(employee)}>
          <Edit2 className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
          Edit Details
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Mail className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
          Send Email
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => onDelete(employee)}
          className="text-destructive focus:text-destructive focus:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5 mr-2" />
          Terminate
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function EmployeesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: empData, isLoading } = useEmployees({ limit: 50 })
  const employees: Employee[] = (empData?.data as Employee[]) ?? []
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null)
  const [editTarget, setEditTarget] = useState<Employee | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const active = employees.filter((e: any) => e.status === 'active').length
  const onboarding = employees.filter((e: any) => e.status === 'onboarding').length
  const probation = employees.filter((e: any) => e.status === 'probation').length
  const emiratis = employees.filter((e: any) => e.emiratisationCategory === 'emirati').length

  const handleDelete = () => {
    if (!deleteTarget) return
    toast.success(
      'Termination initiated',
      `${deleteTarget.fullName}'s exit workflow has started.`,
    )
    setDeleteTarget(null)
  }

  const columns: ColumnDef<Employee>[] = [
    {
      id: 'employee',
      header: 'Employee',
      cell: ({ row: { original: e } }) => (
        <button
          onClick={() => navigate(`/employees/${e.id}`)}
          className="flex items-center gap-3 text-left hover:opacity-80 transition-opacity"
        >
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="text-[10px] font-semibold bg-primary text-primary-foreground">
              {getInitials(e.fullName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="font-semibold text-sm text-foreground truncate">{e.fullName}</p>
            <p className="text-[11px] text-muted-foreground">{e.employeeNo}</p>
          </div>
        </button>
      ),
      size: 220,
    },
    {
      accessorKey: 'designation',
      header: 'Role',
      cell: ({ row: { original: e } }) => (
        <div>
          <p className="text-sm font-medium">{e.designation}</p>
          <p className="text-[11px] text-muted-foreground">{e.department}</p>
        </div>
      ),
    },
    {
      accessorKey: 'nationality',
      header: 'Nationality',
      cell: ({ getValue }) => <span className="text-sm">{getValue() as string}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ getValue }) => {
        const s = getValue() as string
        return (
          <Badge variant={statusVariant[s] ?? 'secondary'} className="capitalize text-[11px]">
            {s.replace('_', ' ')}
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
        <ActionMenu employee={row.original} onDelete={setDeleteTarget} onEdit={setEditTarget} />
      ),
      size: 44,
    },
  ]

  return (
    <PageWrapper>
      <PageHeader
        title={t('employees.title')}
        description={t('employees.description')}
        actions={
          <>
            <Button variant="outline" size="sm" leftIcon={<Download className="h-3.5 w-3.5" />}>
              Export
            </Button>
            <Button size="sm" leftIcon={<UserPlus className="h-3.5 w-3.5" />} onClick={() => setAddOpen(true)}>
              Add Employee
            </Button>
          </>
        }
      />

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
            data={employees}
            isLoading={isLoading}
            searchKey="fullName"
            searchPlaceholder="Search by name, ID..."
            pageSize={8}
            emptyMessage="No employees found."
            enableSelection
            getRowId={(row: any) => String(row.id)}
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
        title="Terminate Employee"
        description={`Are you sure you want to initiate termination for ${deleteTarget?.fullName}? This will start the exit workflow and visa cancellation process.`}
        confirmLabel="Terminate"
        onConfirm={handleDelete}
        variant="destructive"
      />

      <AddEmployeeDialog open={addOpen} onOpenChange={setAddOpen} />
      {editTarget && (
        <EditEmployeeDialog
          open={!!editTarget}
          onOpenChange={(open) => !open && setEditTarget(null)}
          employee={editTarget}
        />
      )}
    </PageWrapper>
  )
}
