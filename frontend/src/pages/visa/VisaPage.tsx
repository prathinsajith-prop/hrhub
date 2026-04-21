import React, { useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { Plane, Clock, AlertTriangle, CheckCircle2, Plus, RefreshCw, Eye, MoreHorizontal } from 'lucide-react'
import { DataTable } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import { Badge, Card, Progress } from '@/components/ui/primitives'
import { Tabs } from '@/components/ui/form-controls'
import { KpiCardCompact } from '@/components/ui/kpi-card'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { formatDate, cn } from '@/lib/utils'
import { useVisas } from '@/hooks/useVisa'
import type { VisaApplication, VisaStatus } from '@/types'
import { toast } from '@/components/ui/overlays'

const statusLabel: Record<VisaStatus, string> = {
  not_started: 'Not Started',
  entry_permit: 'Entry Permit',
  medical_pending: 'Medical',
  eid_pending: 'EID Pending',
  stamping: 'Stamping',
  active: 'Active',
  expiring_soon: 'Expiring',
  expired: 'Expired',
  cancelled: 'Cancelled',
}

const statusVariant: Record<VisaStatus, string> = {
  not_started: 'secondary',
  entry_permit: 'info',
  medical_pending: 'warning',
  eid_pending: 'warning',
  stamping: 'info',
  active: 'success',
  expiring_soon: 'warning',
  expired: 'destructive',
  cancelled: 'secondary',
}

const visaSteps = [
  'Entry Permit Application',
  'Entry Permit Approval',
  'Employee Entry to UAE',
  'Medical Fitness Test',
  'Emirates ID Biometrics',
  'Visa Stamping',
  'Labour Card Issuance',
  'Completion',
]

function VisaTimeline({ application }: { application: VisaApplication }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-sm">{application.employeeName}</h3>
          <p className="text-xs text-muted-foreground capitalize">{application.visaType.replace('_', ' ')}</p>
        </div>
        <Badge variant={statusVariant[application.status] as any}>
          {statusLabel[application.status]}
        </Badge>
      </div>
      <div className="space-y-2">
        {Array.from({ length: application.totalSteps }).map((_, i) => {
          const done = i < application.currentStep - 1
          const current = i === application.currentStep - 1
          const label = visaSteps[i] || `Step ${i + 1}`
          return (
            <div key={i} className="flex items-center gap-3">
              <div className={cn(
                'h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold border-2',
                done ? 'bg-emerald-500 border-emerald-500 text-white' :
                  current ? 'bg-blue-600 border-blue-600 text-white animate-pulse' :
                    'bg-card border-border text-muted-foreground'
              )}>
                {done ? '✓' : i + 1}
              </div>
              <p className={cn('text-xs', done ? 'text-emerald-600 line-through' : current ? 'font-semibold text-blue-600' : 'text-muted-foreground')}>
                {label}
              </p>
            </div>
          )
        })}
      </div>
      {application.mohreRef && (
        <div className="mt-4 pt-4 border-t border-border space-y-1">
          {application.mohreRef && <p className="text-[11px] text-muted-foreground">MOHRE Ref: <span className="font-medium text-foreground">{application.mohreRef}</span></p>}
          {application.gdfrRef && <p className="text-[11px] text-muted-foreground">GDRFA Ref: <span className="font-medium text-foreground">{application.gdfrRef}</span></p>}
        </div>
      )}
    </Card>
  )
}

const columns: ColumnDef<VisaApplication>[] = [
  {
    accessorKey: 'employeeName',
    header: 'Employee',
    cell: ({ getValue }) => <span className="font-medium text-sm">{getValue() as string}</span>,
  },
  {
    accessorKey: 'visaType',
    header: 'Visa Type',
    cell: ({ getValue }) => (
      <span className="text-sm capitalize">{(getValue() as string).replace(/_/g, ' ')}</span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }) => {
      const s = getValue() as VisaStatus
      return <Badge variant={statusVariant[s] as any} className="text-[11px]">{statusLabel[s]}</Badge>
    },
  },
  {
    id: 'progress',
    header: 'Progress',
    cell: ({ row: { original: v } }) => (
      <div className="w-28 space-y-1">
        <Progress value={(v.currentStep / v.totalSteps) * 100} className="h-1.5"
          color={v.urgencyLevel === 'critical' ? 'bg-red-500' : v.urgencyLevel === 'urgent' ? 'bg-amber-500' : 'bg-blue-500'}
        />
        <p className="text-[10px] text-muted-foreground">{v.currentStep}/{v.totalSteps} steps</p>
      </div>
    ),
  },
  {
    accessorKey: 'urgencyLevel',
    header: 'Priority',
    cell: ({ getValue }) => {
      const u = getValue() as string
      return (
        <Badge variant={u === 'critical' ? 'destructive' : u === 'urgent' ? 'warning' : 'secondary'} className="capitalize text-[11px]">
          {u}
        </Badge>
      )
    },
  },
  {
    accessorKey: 'expiryDate',
    header: 'Expiry',
    cell: ({ getValue }) => {
      const d = getValue() as string
      return d ? <span className="text-xs">{formatDate(d)}</span> : <span className="text-xs text-muted-foreground">—</span>
    },
  },
  {
    id: 'actions',
    header: '',
    cell: () => (
      <Button size="icon-sm" variant="ghost">
        <Eye className="h-3.5 w-3.5" />
      </Button>
    ),
    size: 40,
  },
]

export function VisaPage() {
  const [activeTab, setActiveTab] = useState('all')
  const { data: visaData } = useVisas({ limit: 50 })
  const visaApplications: VisaApplication[] = (visaData?.data as VisaApplication[]) ?? []

  const filtered = activeTab === 'all' ? visaApplications :
    activeTab === 'critical' ? visaApplications.filter((v: any) => v.urgencyLevel === 'critical') :
      activeTab === 'active' ? visaApplications.filter((v: any) => v.status === 'active' || v.status === 'expiring_soon') :
        visaApplications

  return (
    <PageWrapper>
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCardCompact label="Active Visas" value={visaApplications.filter((v: any) => v.status === 'active').length} icon={CheckCircle2} color="green" />
        <KpiCardCompact label="In Processing" value={visaApplications.filter((v: any) => !['active', 'expired', 'cancelled'].includes(v.status)).length} icon={Clock} color="blue" />
        <KpiCardCompact label="Critical" value={visaApplications.filter((v: any) => v.urgencyLevel === 'critical').length} icon={AlertTriangle} color="red" />
        <KpiCardCompact label="Expiring 30d" value={visaApplications.filter((v: any) => v.status === 'expiring_soon').length} icon={Plane} color="amber" />
      </div>

      <Tabs
        tabs={[
          { id: 'all', label: 'All Applications', badge: visaApplications.length },
          { id: 'critical', label: 'Critical', badge: visaApplications.filter((v: any) => v.urgencyLevel === 'critical').length },
          { id: 'timeline', label: 'Timeline View' },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === 'timeline' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visaApplications.map((v: any) => <VisaTimeline key={v.id} application={v} />)}
        </div>
      ) : (
        <Card className="p-5">
          <DataTable
            columns={columns}
            data={filtered}
            searchKey="employeeName"
            searchPlaceholder="Search by employee..."
            pageSize={8}
            toolbar={
              <>
                <Button variant="outline" size="sm" leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
                  onClick={() => toast.info('Syncing portals...', 'Checking MOHRE & GDRFA for updates.')}>
                  Sync Portals
                </Button>
                <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />}>New Application</Button>
              </>
            }
          />
        </Card>
      )}
    </PageWrapper>
  )
}
