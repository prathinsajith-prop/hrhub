import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { type ColumnDef } from '@tanstack/react-table'
import { Plane, Clock, AlertTriangle, CheckCircle2, Plus, RefreshCw, Eye } from 'lucide-react'
import { DataTable } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Tabs } from '@/components/ui/form-controls'
import { KpiCardCompact } from '@/components/ui/kpi-card'
import { PageHeader } from '@/components/layout/PageHeader'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { formatDate, cn } from '@/lib/utils'
import { useVisas, useAdvanceVisaStep, useCancelVisa, useRecalcVisaUrgency } from '@/hooks/useVisa'
import type { VisaApplication, VisaStatus } from '@/types'
import { toast } from '@/components/ui/overlays'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { NewVisaApplicationDialog } from '@/components/shared/action-dialogs'

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

const statusStyles: Record<VisaStatus, string> = {
  not_started: 'bg-muted text-muted-foreground',
  entry_permit: 'bg-info/10 text-info border-info/20',
  medical_pending: 'bg-warning/10 text-warning border-warning/20',
  eid_pending: 'bg-warning/10 text-warning border-warning/20',
  stamping: 'bg-info/10 text-info border-info/20',
  active: 'bg-success/10 text-success border-success/20',
  expiring_soon: 'bg-warning/10 text-warning border-warning/20',
  expired: 'bg-destructive/10 text-destructive border-destructive/20',
  cancelled: 'bg-muted text-muted-foreground',
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
          <h3 className="font-semibold text-sm text-foreground">{application.employeeName}</h3>
          <p className="text-xs text-muted-foreground capitalize">{application.visaType.replace('_', ' ')}</p>
        </div>
        <Badge variant="outline" className={statusStyles[application.status]}>
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
                done ? 'bg-success border-success text-success-foreground' :
                  current ? 'bg-primary border-primary text-primary-foreground animate-pulse' :
                    'bg-card border-border text-muted-foreground'
              )}>
                {done ? '\u2713' : i + 1}
              </div>
              <p className={cn('text-xs', done ? 'text-success line-through' : current ? 'font-semibold text-primary' : 'text-muted-foreground')}>
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
    cell: ({ getValue }) => <span className="font-medium text-sm text-foreground">{getValue() as string}</span>,
  },
  {
    accessorKey: 'visaType',
    header: 'Visa Type',
    cell: ({ getValue }) => (
      <span className="text-sm capitalize text-foreground">{(getValue() as string).replace(/_/g, ' ')}</span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }) => {
      const s = getValue() as VisaStatus
      return <Badge variant="outline" className={cn('text-[11px]', statusStyles[s])}>{statusLabel[s]}</Badge>
    },
  },
  {
    id: 'progress',
    header: 'Progress',
    cell: ({ row: { original: v } }) => {
      const progressClass = v.urgencyLevel === 'critical' ? '[&>div]:bg-destructive' : v.urgencyLevel === 'urgent' ? '[&>div]:bg-warning' : '[&>div]:bg-primary'
      return (
        <div className="w-28 space-y-1">
          <Progress value={(v.currentStep / v.totalSteps) * 100} className={cn('h-1.5', progressClass)} />
          <p className="text-[10px] text-muted-foreground">{v.currentStep}/{v.totalSteps} steps</p>
        </div>
      )
    },
  },
  {
    accessorKey: 'urgencyLevel',
    header: 'Priority',
    cell: ({ getValue }) => {
      const u = getValue() as string
      const styles: Record<string, string> = {
        critical: 'bg-destructive/10 text-destructive border-destructive/20',
        urgent: 'bg-warning/10 text-warning border-warning/20',
        normal: 'bg-muted text-muted-foreground',
      }
      return (
        <Badge variant="outline" className={cn('capitalize text-[11px]', styles[u] || styles.normal)}>
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
      return d ? <span className="text-xs text-muted-foreground">{formatDate(d)}</span> : <span className="text-xs text-muted-foreground">&mdash;</span>
    },
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row: { original: v } }) => (
      <VisaDetailButton visa={v} />
    ),
    size: 40,
  },
]

function VisaDetailButton({ visa: v }: { visa: VisaApplication }) {
  const [open, setOpen] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const navigate = useNavigate()
  const advanceStep = useAdvanceVisaStep()
  const cancelVisa = useCancelVisa()
  const urgencyStyles: Record<string, string> = {
    critical: 'text-destructive',
    urgent: 'text-warning',
    normal: 'text-muted-foreground',
  }
  const isDone = v.currentStep >= v.totalSteps
  const isCancelled = v.status === 'cancelled' || v.status === 'expired'

  function handleAdvance() {
    advanceStep.mutate(v.id, {
      onSuccess: () => toast.success('Step advanced'),
      onError: () => toast.error('Failed to advance step'),
    })
  }

  function handleCancel() {
    cancelVisa.mutate({ id: v.id }, {
      onSuccess: () => { toast.success('Visa cancelled'); setConfirmCancel(false); setOpen(false) },
      onError: () => toast.error('Failed to cancel visa'),
    })
  }

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8"
        aria-label="View visa details"
        onClick={() => setOpen(true)}
      >
        <Eye className="h-3.5 w-3.5" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>{v.employeeName}</SheetTitle>
            <p className="text-sm text-muted-foreground capitalize">{v.visaType.replace(/_/g, ' ')}</p>
          </SheetHeader>

          {/* Priority badge */}
          {(v as any).urgencyLevel !== 'normal' && (
            <div className={cn('text-xs font-semibold mb-4', urgencyStyles[(v as any).urgencyLevel ?? 'normal'])}>
              ⚠ {((v as any).urgencyLevel as string).toUpperCase()} PRIORITY
            </div>
          )}

          {/* Full timeline */}
          <VisaTimeline application={v} />

          {/* Government references */}
          <div className="mt-4 space-y-3">
            {v.expiryDate && (
              <div className="rounded-lg border border-border p-3 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Visa Expiry</p>
                <p className="text-sm font-semibold">{formatDate(v.expiryDate)}</p>
              </div>
            )}
            {((v as any).mohreRef || (v as any).gdfrRef) && (
              <div className="rounded-lg border border-border p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Government References</p>
                {(v as any).mohreRef && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">MOHRE Ref</span>
                    <span className="font-mono text-xs font-medium">{(v as any).mohreRef}</span>
                  </div>
                )}
                {(v as any).gdfrRef && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">GDRFA Ref</span>
                    <span className="font-mono text-xs font-medium">{(v as any).gdfrRef}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          {!isCancelled && (
            <div className="mt-6 space-y-3">
              <Button variant="outline" className="w-full" onClick={() => { setOpen(false); navigate(`/visa/${v.id}`) }}>
                View Full Details
              </Button>
              {!isDone && (
                <Button
                  className="w-full"
                  onClick={handleAdvance}
                  disabled={advanceStep.isPending}
                >
                  {advanceStep.isPending ? 'Advancing…' : 'Advance Step'}
                </Button>
              )}
              {!confirmCancel ? (
                <Button
                  variant="outline"
                  className="w-full text-destructive border-destructive/40 hover:bg-destructive/10"
                  onClick={() => setConfirmCancel(true)}
                >
                  Cancel Visa
                </Button>
              ) : (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-3">
                  <p className="text-xs text-destructive font-medium">Confirm visa cancellation? This cannot be undone.</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      className="flex-1"
                      onClick={handleCancel}
                      disabled={cancelVisa.isPending}
                    >
                      {cancelVisa.isPending ? 'Cancelling…' : 'Confirm Cancel'}
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setConfirmCancel(false)}>
                      Keep
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}

export function VisaPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState('all')
  const [newAppOpen, setNewAppOpen] = useState(false)
  const { data: visaData, isLoading } = useVisas({ limit: 50 })
  const recalcUrgency = useRecalcVisaUrgency()
  const visaApplications: VisaApplication[] = (visaData?.data as VisaApplication[]) ?? []

  const filtered = activeTab === 'all' ? visaApplications :
    activeTab === 'critical' ? visaApplications.filter((v: any) => v.urgencyLevel === 'critical') :
      activeTab === 'active' ? visaApplications.filter((v: any) => v.status === 'active' || v.status === 'expiring_soon') :
        visaApplications

  const activeCount = visaApplications.filter((v: any) => v.status === 'active').length
  const processingCount = visaApplications.filter((v: any) => !['active', 'expired', 'cancelled'].includes(v.status)).length
  const criticalCount = visaApplications.filter((v: any) => v.urgencyLevel === 'critical').length
  const expiringCount = visaApplications.filter((v: any) => v.status === 'expiring_soon').length

  return (
    <PageWrapper>
      <PageHeader
        title={t('visa.title')}
        description={t('visa.description')}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => recalcUrgency.mutate(undefined, {
                onSuccess: (r) => toast.success(`Urgency updated for ${(r as any).data?.updated ?? 0} visa(s)`),
                onError: () => toast.error('Recalculation failed'),
              })}
              disabled={recalcUrgency.isPending}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', recalcUrgency.isPending && 'animate-spin')} />
              <span className="hidden sm:inline">Recalc Urgency</span>
            </Button>
            <Button className="gap-2" onClick={() => setNewAppOpen(true)}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New Application</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCardCompact label="Active Visas" value={activeCount} icon={CheckCircle2} color="green" />
        <KpiCardCompact label="In Processing" value={processingCount} icon={Clock} color="cyan" />
        <KpiCardCompact label="Critical" value={criticalCount} icon={AlertTriangle} color="red" />
        <KpiCardCompact label="Expiring 30d" value={expiringCount} icon={Plane} color="amber" />
      </div>

      <Tabs
        tabs={[
          { id: 'all', label: 'All Applications', badge: visaApplications.length },
          { id: 'critical', label: 'Critical', badge: criticalCount },
          { id: 'timeline', label: 'Timeline View' },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
        className="border-b-0"
      />

      {activeTab === 'timeline' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visaApplications.length === 0 ? (
            <Card className="col-span-full p-8 text-center">
              <Plane className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-muted-foreground">No visa applications found</p>
            </Card>
          ) : (
            visaApplications.map((v: any) => <VisaTimeline key={v.id} application={v} />)
          )}
        </div>
      ) : (
        <Card className="p-4 sm:p-5">
          <DataTable
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            searchPlaceholder="Search by employee..."
            pageSize={8}
            enableSelection
            getRowId={(row: any) => String(row.id)}
            bulkActions={(selected) => (
              <>
                <Button variant="outline" size="sm" leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
                  onClick={() => toast.success(`Renewal initiated for ${selected.length} visas`)}>
                  Renew
                </Button>
                <Button variant="outline" size="sm"
                  onClick={() => toast.success(`Exporting ${selected.length} visa records`)}>
                  Export
                </Button>
              </>
            )}
            toolbar={
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-1.5"
                  onClick={() => toast.info('Syncing portals...', 'Checking MOHRE & GDRFA for updates.')}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Sync Portals</span>
                </Button>
                <Button size="sm" className="gap-1.5" onClick={() => setNewAppOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">New Application</span>
                </Button>
              </div>
            }
          />
        </Card>
      )}

      <NewVisaApplicationDialog open={newAppOpen} onOpenChange={setNewAppOpen} />
    </PageWrapper>
  )
}

export default VisaPage
