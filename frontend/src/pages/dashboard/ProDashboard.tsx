import { useNavigate } from 'react-router-dom'
import {
  Plane, FileText, ShieldCheck, AlertTriangle,
  Clock, CheckCircle2, ArrowUpRight, Eye, ClipboardCheck,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { labelFor } from '@/lib/enums'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { KpiCardCompact } from '@/components/ui/kpi-card'
import { useAuthStore } from '@/store/authStore'
import { useVisas } from '@/hooks/useVisa'
import { useDocuments, useExpiringDocuments } from '@/hooks/useDocuments'
import { useDashboardKPIs } from '@/hooks/useDashboard'
import { QuickAction, SectionHeading, SkeletonRows } from './_shared'

// ─── Types ────────────────────────────────────────────────────────────────────
interface VisaItem {
  id: string
  employee?: { firstName?: string; lastName?: string }
  employeeName?: string
  visaType?: string
  urgencyLevel?: string
  status?: string
  expiryDate?: string
  totalSteps?: number
  currentStep?: number
}

interface DocItem {
  id: string
  fileName?: string
  docType?: string
  category?: string
  status?: string
  createdAt?: string
  employeeName?: string
}

const URGENCY_META: Record<string, { variant: 'destructive' | 'warning' | 'info'; label: string }> = {
  critical: { variant: 'destructive', label: 'Critical' },
  urgent:   { variant: 'warning',     label: 'Urgent' },
  normal:   { variant: 'info',        label: 'Normal' },
}

export function ProDashboard() {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)

  const { data: kpis, isLoading: kpisLoading } = useDashboardKPIs()
  const { data: allVisas, isLoading: visaLoading } = useVisas({ limit: 15 })
  const { data: expiringDocs, isLoading: expDocsLoading } = useExpiringDocuments(90)
  const { data: pendingDocs, isLoading: pendingDocsLoading } = useDocuments({ status: 'pending_review', limit: 10 })

  const visaList = (Array.isArray(allVisas?.data) ? allVisas.data : []) as VisaItem[]
  const criticalVisas = visaList.filter(v => v.urgencyLevel === 'critical')
  const pipeline      = visaList.slice(0, 8)

  const expiringDocList = (Array.isArray(expiringDocs) ? expiringDocs : []) as DocItem[]
  const pendingDocList  = (Array.isArray(pendingDocs?.data) ? pendingDocs.data : []) as DocItem[]

  const today = new Date().toLocaleDateString('en-AE', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <PageWrapper>
      <PageHeader
        title={`Good ${getTimeOfDay()}, ${user?.name?.split(' ')[0] ?? 'PRO Officer'}`}
        description={`PRO Officer · ${today}`}
      />

      {/* Critical alert banner */}
      {criticalVisas.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3 animate-fade-fast">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-destructive">
              {criticalVisas.length} critical visa case{criticalVisas.length > 1 ? 's' : ''} require immediate action
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {criticalVisas.slice(0, 2).map(v => {
                const name = v.employee
                  ? `${v.employee.firstName ?? ''} ${v.employee.lastName ?? ''}`.trim()
                  : v.employeeName ?? 'Unknown'
                return name
              }).join(', ')}
              {criticalVisas.length > 2 && ` and ${criticalVisas.length - 2} more`}
            </p>
          </div>
          <Button size="sm" variant="ghost" className="text-destructive h-auto px-2 py-1 text-xs shrink-0" onClick={() => navigate('/visa')}>
            View <ArrowUpRight className="h-3 w-3 ml-1" />
          </Button>
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCardCompact
          label="Active Visas"
          value={kpisLoading ? undefined : kpis?.activeVisas}
          icon={Plane}
          color="blue"
          loading={kpisLoading}
          hint="Processing now"
        />
        <KpiCardCompact
          label="Expiring Visas"
          value={kpisLoading ? undefined : kpis?.expiringVisas}
          icon={Clock}
          color={kpis?.expiringVisas ? 'red' : 'green'}
          loading={kpisLoading}
          hint="Next 90 days"
        />
        <KpiCardCompact
          label="Critical Cases"
          value={visaLoading ? undefined : criticalVisas.length}
          icon={AlertTriangle}
          color={criticalVisas.length > 0 ? 'red' : 'green'}
          loading={visaLoading}
          hint="Need immediate action"
        />
        <KpiCardCompact
          label="Docs to Review"
          value={pendingDocsLoading ? undefined : pendingDocList.length}
          icon={FileText}
          color={pendingDocList.length > 0 ? 'amber' : 'green'}
          loading={pendingDocsLoading}
          hint="Pending verification"
        />
      </div>

      {/* Main content: visa pipeline + doc queue */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Visa pipeline (wider) */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Visa Pipeline</CardTitle>
                <CardDescription>Active cases by urgency</CardDescription>
              </div>
              <Button variant="ghost" size="sm" className="text-primary h-auto px-2 py-1 text-xs" onClick={() => navigate('/visa')}>
                All cases <ArrowUpRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {visaLoading ? (
              <SkeletonRows count={5} />
            ) : pipeline.length === 0 ? (
              <div className="py-10 text-center">
                <CheckCircle2 className="h-8 w-8 text-success/60 mx-auto mb-2" />
                <p className="text-sm font-medium">No active visa cases</p>
                <p className="text-xs text-muted-foreground mt-0.5">All visa cases have been processed</p>
              </div>
            ) : (
              <div className="space-y-3.5">
                {pipeline.map((v) => {
                  const name = v.employee
                    ? `${v.employee.firstName ?? ''} ${v.employee.lastName ?? ''}`.trim()
                    : v.employeeName ?? 'Unknown'
                  const urgency = v.urgencyLevel ?? 'normal'
                  const meta = URGENCY_META[urgency] ?? URGENCY_META.normal
                  const pct = v.totalSteps ? Math.round(((v.currentStep ?? 0) / v.totalSteps) * 100) : 0
                  const barClass = urgency === 'critical' ? 'bg-destructive' : urgency === 'urgent' ? 'bg-warning' : 'bg-primary'

                  return (
                    <div key={v.id} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{name}</p>
                          <p className="text-[11px] text-muted-foreground">{labelFor(v.visaType ?? '')}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge variant={meta.variant} className="text-[10px] h-5">{meta.label}</Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
                            onClick={() => navigate(`/visa/${v.id}`)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className={cn('h-full rounded-full transition-all', barClass)} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0 w-8 text-right">{pct}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Document verification queue + expiry */}
        <div className="lg:col-span-2 flex flex-col gap-4">

          {/* Pending verification */}
          <Card className="flex-1">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Docs to Verify</CardTitle>
                  <CardDescription>Pending review</CardDescription>
                </div>
                <Button variant="ghost" size="sm" className="text-primary h-auto px-2 py-1 text-xs" onClick={() => navigate('/documents')}>
                  All <ArrowUpRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {pendingDocsLoading ? (
                <SkeletonRows count={3} />
              ) : pendingDocList.length === 0 ? (
                <div className="py-8 text-center">
                  <ClipboardCheck className="h-7 w-7 text-success/60 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No documents pending review</p>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {pendingDocList.slice(0, 5).map((doc) => (
                    <div key={doc.id} className="flex items-start gap-2.5 py-2.5">
                      <div className="h-7 w-7 rounded-lg bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center shrink-0">
                        <FileText className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{doc.fileName ?? doc.docType ?? 'Document'}</p>
                        <p className="text-[10px] text-muted-foreground">{doc.employeeName ?? '—'}</p>
                      </div>
                      <Badge variant="warning" className="text-[9px] h-4 px-1.5 shrink-0">Review</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Expiring documents */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Expiring Documents</CardTitle>
              <CardDescription>Next 90 days</CardDescription>
            </CardHeader>
            <CardContent>
              {expDocsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <div key={i} className="flex gap-2"><div className="skeleton-shimmer h-3 flex-1 rounded-full" /></div>)}
                </div>
              ) : expiringDocList.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No documents expiring soon</p>
              ) : (
                <div className="space-y-2.5">
                  {expiringDocList.slice(0, 4).map((doc) => {
                    const expiry = doc as unknown as { expiryDate?: string }
                    const days = expiry.expiryDate
                      ? Math.ceil((new Date(expiry.expiryDate).getTime() - Date.now()) / 86_400_000)
                      : null
                    return (
                      <div key={doc.id} className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{doc.fileName ?? doc.docType ?? 'Document'}</p>
                          <p className="text-[10px] text-muted-foreground">{doc.employeeName ?? '—'}</p>
                        </div>
                        <span className={cn(
                          'text-[10px] font-semibold shrink-0 tabular-figures',
                          days !== null && days <= 30 ? 'text-destructive' : 'text-warning',
                        )}>
                          {days !== null ? `${days}d` : '—'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Quick actions */}
      <div className="space-y-3">
        <SectionHeading title="Quick Actions" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <QuickAction icon={Plane}        label="Visa Cases"   onClick={() => navigate('/visa')} />
          <QuickAction icon={FileText}     label="Documents"    onClick={() => navigate('/documents')} />
          <QuickAction icon={ShieldCheck}  label="Compliance"   onClick={() => navigate('/compliance')} />
          <QuickAction icon={ClipboardCheck} label="Reports"    onClick={() => navigate('/reports')} />
        </div>
      </div>
    </PageWrapper>
  )
}

function getTimeOfDay() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
