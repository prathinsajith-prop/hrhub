import { useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { labelFor } from '@/lib/enums'
import { type ColumnDef } from '@tanstack/react-table'
import { Plane, Clock, AlertTriangle, CheckCircle2, Plus, RefreshCw, RefreshCcw, Eye, Edit2 } from 'lucide-react'
import { DataTable } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Tabs } from '@/components/ui/form-controls'
import { KpiCardCompact } from '@/components/ui/kpi-card'
import { InitialsAvatar } from '@/components/shared/Avatar'
import { PageHeader } from '@/components/layout/PageHeader'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { formatDate, cn } from '@/lib/utils'
import { useVisas, useAdvanceVisaStep, useCancelVisa, useRecalcVisaUrgency, useUpdateVisa } from '@/hooks/useVisa'
import { useSearchFilters } from '@/hooks/useSearchFilters'
import { applyClientFilters, type FilterConfig } from '@/lib/filters'
import type { VisaApplication, VisaStatus } from '@/types'
import { toast } from '@/components/ui/overlays'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { NewVisaApplicationDialog } from '@/components/shared/action-dialogs'
import { exportVisa } from '@/lib/export'
import { ExportDropdown } from '@/components/shared/ExportDropdown'

const VISA_FILTERS: FilterConfig[] = [
  { name: 'employeeName', label: 'Employee', type: 'text', field: 'employeeName' },
  {
    name: 'status', label: 'Status', type: 'select', field: 'status',
    options: [
      { value: 'active', label: 'Active' },
      { value: 'expiring_soon', label: 'Expiring soon' },
      { value: 'expired', label: 'Expired' },
      { value: 'not_started', label: 'Not started' },
      { value: 'stamping', label: 'Stamping' },
      { value: 'medical_pending', label: 'Medical pending' },
      { value: 'eid_pending', label: 'EID pending' },
      { value: 'cancelled', label: 'Cancelled' },
    ],
  },
  {
    name: 'urgencyLevel', label: 'Priority', type: 'select', field: 'urgencyLevel',
    options: [
      { value: 'critical', label: 'Critical' },
      { value: 'urgent', label: 'Urgent' },
      { value: 'normal', label: 'Normal' },
    ],
  },
  {
    name: 'visaType', label: 'Visa type', type: 'select', field: 'visaType',
    options: [
      { value: 'employment_new', label: 'Employment (new)' },
      { value: 'employment_renewal', label: 'Employment (renewal)' },
    ],
  },
  { name: 'expiryDate', label: 'Expiry date', type: 'date_range', field: 'expiryDate' },
  { name: 'currentStep', label: 'Current step', type: 'number_range', field: 'currentStep', min: 0, max: 8 },
]

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
          <p className="text-xs text-muted-foreground capitalize">{labelFor(application.visaType)}</p>
        </div>
        <Badge variant="outline" className={statusStyles[application.status]}>
          {statusLabel[application.status]}
        </Badge>
      </div>
      <div className="space-y-2">
        {Array.from({ length: application.totalSteps }).map((_, i) => {
          const allDone = application.status === 'active'
          const done = allDone || i < application.currentStep - 1
          const current = !allDone && i === application.currentStep - 1
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
    cell: ({ row: { original: v } }) => (
      <div className="flex items-center gap-2.5 min-w-0">
        <InitialsAvatar name={v.employeeName || '—'} src={v.employeeAvatarUrl} size="sm" />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{v.employeeName || '—'}</p>
          {(v.employeeNo || v.employeeDepartment) && (
            <p className="text-[11px] text-muted-foreground truncate">
              {v.employeeNo}{v.employeeNo && v.employeeDepartment ? ' · ' : ''}{v.employeeDepartment}
            </p>
          )}
        </div>
      </div>
    ),
  },
  {
    accessorKey: 'visaType',
    header: 'Visa Type',
    cell: ({ getValue }) => (
      <span className="text-sm capitalize text-foreground">{labelFor(getValue() as string)}</span>
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
      <VisaRowActions visa={v} />
    ),
    size: 80,
  },
]

function VisaRowActions({ visa: v }: { visa: VisaApplication }) {
  const navigate = useNavigate()
  return (
    <div className="flex gap-0.5 justify-end">
      <VisaDetailButton visa={v} />
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8"
        aria-label="Edit visa application"
        onClick={(e) => { e.stopPropagation(); navigate(`/visa/${v.id}`) }}
      >
        <Edit2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

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
  const isActivated = v.status === 'active'
  const isCancelled = v.status === 'cancelled' || v.status === 'expired'
  const currentLabel = visaSteps[v.currentStep - 1] ?? `Step ${v.currentStep}`
  const advanceLabel = isDone ? 'Complete & activate visa' : `Mark "${currentLabel}" complete`

  function handleAdvance() {
    advanceStep.mutate(v.id, {
      onSuccess: () => toast.success(isDone ? 'Visa activated' : `Marked "${currentLabel}" complete`),
      onError: () => toast.error(isDone ? 'Failed to activate visa' : 'Failed to advance step'),
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
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
      >
        <Eye className="h-3.5 w-3.5" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>{v.employeeName}</SheetTitle>
            <p className="text-sm text-muted-foreground capitalize">{labelFor(v.visaType)}</p>
          </SheetHeader>

          {/* Priority badge */}
          {v.urgencyLevel !== 'normal' && (
            <div className={cn('text-xs font-semibold mb-4', urgencyStyles[v.urgencyLevel ?? 'normal'])}>
              ⚠ {v.urgencyLevel.toUpperCase()} PRIORITY
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
            {(v.mohreRef || v.gdfrRef) && (
              <div className="rounded-lg border border-border p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Government References</p>
                {v.mohreRef && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">MOHRE Ref</span>
                    <span className="font-mono text-xs font-medium">{v.mohreRef}</span>
                  </div>
                )}
                {v.gdfrRef && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">GDRFA Ref</span>
                    <span className="font-mono text-xs font-medium">{v.gdfrRef}</span>
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
              {!isActivated && (
                <Button
                  className="w-full"
                  onClick={handleAdvance}
                  disabled={advanceStep.isPending}
                >
                  {advanceStep.isPending ? (isDone ? 'Activating…' : 'Advancing…') : advanceLabel}
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
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('all')
  const [newAppOpen, setNewAppOpen] = useState(false)
  const { data: visaData, isLoading, isFetching, refetch } = useVisas({ limit: 50 })
  const recalcUrgency = useRecalcVisaUrgency()
  const updateVisa = useUpdateVisa()
  const visaApplications: VisaApplication[] = (visaData?.data as VisaApplication[]) ?? []

  const handleBulkRenew = useCallback(async (selected: VisaApplication[]) => {
    try {
      await Promise.all(selected.map(v =>
        updateVisa.mutateAsync({ id: v.id, data: { visaType: 'employment_renewal', status: 'not_started', currentStep: 1 } })
      ))
      toast.success(`${selected.length} visa(s) queued for renewal`, 'Each visa has been reset to employment renewal status.')
    } catch {
      toast.error('Renewal failed', 'Some visas could not be updated. Please try again.')
    }
  }, [updateVisa])

  const handleBulkExport = useCallback((selected: VisaApplication[]) => {
    const headers = ['Employee', 'Visa Type', 'Status', 'Current Step', 'Total Steps', 'Urgency', 'Expiry Date', 'MOHRE Ref', 'GDRFA Ref']
    const rows = selected.map(v => [
      v.employeeName ?? '',
      v.visaType ? labelFor(v.visaType) : '',
      v.status ? labelFor(v.status) : '',
      String(v.currentStep),
      String(v.totalSteps),
      v.urgencyLevel ?? '',
      v.expiryDate ? formatDate(v.expiryDate) : '',
      v.mohreRef ?? '',
      v.gdfrRef ?? '',
    ])
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `visa_export_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${selected.length} visa records`)
  }, [])

  const filtered = activeTab === 'all' ? visaApplications :
    activeTab === 'critical' ? visaApplications.filter((v) => v.urgencyLevel === 'critical') :
      activeTab === 'active' ? visaApplications.filter((v) => v.status === 'active' || v.status === 'expiring_soon') :
        visaApplications

  const search = useSearchFilters({
    storageKey: 'hrhub.visa.searchHistory',
    availableFilters: VISA_FILTERS,
  })
  const filteredVisas = useMemo(
    () => applyClientFilters(filtered as unknown as Record<string, unknown>[], {
      searchInput: search.searchInput,
      appliedFilters: search.appliedFilters,
      searchFields: ['employeeName', 'employeeNo', 'visaType', 'mohreRef', 'gdfrRef'],
    }) as unknown as VisaApplication[],
    [filtered, search.appliedFilters, search.searchInput],
  )

  const activeCount = visaApplications.filter((v) => v.status === 'active').length
  const processingCount = visaApplications.filter((v) => !['active', 'expired', 'cancelled'].includes(v.status)).length
  const criticalCount = visaApplications.filter((v) => v.urgencyLevel === 'critical').length
  const expiringCount = visaApplications.filter((v) => v.status === 'expiring_soon').length

  return (
    <PageWrapper>
      <PageHeader
        title={t('visa.title')}
        description={t('visa.description')}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" leftIcon={<RefreshCcw className={isFetching ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />} onClick={() => refetch()} disabled={isFetching}>
              Refresh
            </Button>
            <ExportDropdown
              onExportCsv={() => exportVisa({ format: 'csv' })}
              onExportPdf={() => exportVisa({ format: 'pdf' })}
            />
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => recalcUrgency.mutate(undefined, {
                onSuccess: (r) => toast.success(`Urgency updated for ${(r as { data?: { updated?: number } })?.data?.updated ?? 0} visa(s)`),
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
        <KpiCardCompact label="Active Visas" value={activeCount} icon={CheckCircle2} color="green" loading={isLoading} hint="All active visas" />
        <KpiCardCompact label="In Processing" value={processingCount} icon={Clock} color="blue" loading={isLoading} hint="Applications" />
        <KpiCardCompact label="Critical" value={criticalCount} icon={AlertTriangle} color="red" loading={isLoading} hint="Require attention" />
        <KpiCardCompact label="Expiring 30d" value={expiringCount} icon={Plane} color="amber" loading={isLoading} hint="Expiring soon" />
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
            visaApplications.map((v) => <VisaTimeline key={v.id} application={v} />)
          )}
        </div>
      ) : (
        <Card className="p-4 sm:p-5">
          <DataTable
            columns={columns}
            data={filteredVisas}
            isLoading={isLoading}
            advancedFilter={{
              search,
              filters: VISA_FILTERS,
              placeholder: 'Search by employee, MOHRE, GDRFA…',
            }}
            pageSize={8}
            enableSelection
            onRowClick={(row: VisaApplication) => navigate(`/visa/${row.id}`)}
            getRowId={(row) => String(row.id)}
            bulkActions={(selected) => (
              <>
                <Button variant="outline" size="sm" leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
                  onClick={() => handleBulkRenew(selected as VisaApplication[])}
                  disabled={updateVisa.isPending}>
                  Renew
                </Button>
                <Button variant="outline" size="sm"
                  onClick={() => handleBulkExport(selected as VisaApplication[])}>
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
