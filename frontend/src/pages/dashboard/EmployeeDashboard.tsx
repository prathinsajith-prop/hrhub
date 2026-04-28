import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { User, CalendarDays, CreditCard, FileText, Info } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn, formatCurrency } from '@/lib/utils'
import { labelFor } from '@/lib/enums'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { useMyEmployee, useMyPayslips } from '@/hooks/useMe'
import { useLeaveBalance } from '@/hooks/useLeave'
import { QuickAction, SectionHeading } from './_shared'

export function EmployeeDashboard() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: myEmployee, isLoading: empLoading } = useMyEmployee()
  const { data: payslips, isLoading: payslipsLoading } = useMyPayslips()
  const { data: leaveBalance, isLoading: leaveLoading } = useLeaveBalance(myEmployee?.id)

  const PROFILE_FIELDS = ['phone', 'mobileNo', 'personalEmail', 'emergencyContact', 'homeCountryAddress', 'nationality', 'dateOfBirth', 'maritalStatus'] as const
  const filled = PROFILE_FIELDS.filter(f => !!(myEmployee as Record<string, unknown> | undefined)?.[f]).length
  const completeness = empLoading ? 100 : Math.round((filled / PROFILE_FIELDS.length) * 100)

  type BalanceEntry = { entitled: number; taken: number; available: number; pending: number }
  const leaveEntries = leaveBalance?.balance
    ? Object.entries(leaveBalance.balance as Record<string, BalanceEntry>).filter(([, b]) => b.entitled !== 0)
    : []

  const recentPayslips = (payslips ?? []).slice(0, 3)

  return (
    <PageWrapper>
      <PageHeader
        title={empLoading ? t('dashboard.title') : `Welcome back, ${myEmployee?.firstName ?? ''}!`}
        description="Your self-service portal"
      />

      {/* Profile completeness banner */}
      {!empLoading && completeness < 100 && (
        <div className="flex items-start gap-4 rounded-xl border border-info/20 bg-info/5 px-5 py-4">
          <Info className="h-5 w-5 text-info shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Complete your profile ({completeness}%)</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Some details are missing. Keeping your record up to date helps HR manage your employment accurately.
            </p>
            <div className="mt-2 h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-info rounded-full transition-all" style={{ width: `${completeness}%` }} />
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate('/my/profile')} className="shrink-0">
            Update
          </Button>
        </div>
      )}

      {/* Leave balance */}
      <div className="space-y-3">
        <SectionHeading title={`Leave Balance — ${new Date().getFullYear()}`} />
        {leaveLoading || empLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : leaveEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No leave balance data available.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {leaveEntries.map(([type, b]) => {
              const isUnlimited = b.entitled === -1
              const pct = isUnlimited ? 0 : Math.min(100, Math.round((b.taken / (b.entitled || 1)) * 100))
              const isLow = !isUnlimited && b.available <= 3 && b.entitled > 0
              return (
                <Card key={type} className="card-hover">
                  <CardContent className="p-4 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">{labelFor(type)}</p>
                    <div className="flex items-baseline gap-1">
                      <span className={cn('text-2xl font-bold font-display', isLow ? 'text-destructive' : 'text-foreground')}>
                        {isUnlimited ? '∞' : b.available}
                      </span>
                      <span className="text-[11px] text-muted-foreground">/ {isUnlimited ? '∞' : b.entitled} days</span>
                    </div>
                    {!isUnlimited && (
                      <div className="w-full bg-muted rounded-full h-1.5">
                        <div
                          className={cn('h-1.5 rounded-full transition-all', pct >= 80 ? 'bg-destructive' : pct >= 50 ? 'bg-warning' : 'bg-success')}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                    <div className="text-[10px] text-muted-foreground">
                      Used: <strong className="text-foreground">{b.taken}</strong>
                      {b.pending > 0 && <span> · Pending: <strong className="text-warning">{b.pending}</strong></span>}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="space-y-3">
        <SectionHeading title="Quick Actions" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <QuickAction icon={CalendarDays} label="Request Leave" onClick={() => navigate('/my/leave')} />
          <QuickAction icon={User} label="My Profile" onClick={() => navigate('/my/profile')} />
          <QuickAction icon={CreditCard} label="Payslips" onClick={() => navigate('/my/payslips')} />
          <QuickAction icon={FileText} label="Documents" onClick={() => navigate('/documents')} />
        </div>
      </div>

      {/* Recent payslips */}
      {(recentPayslips.length > 0 || payslipsLoading) && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Recent Payslips</CardTitle>
              <Button size="sm" variant="outline" onClick={() => navigate('/my/payslips')}>View all</Button>
            </div>
          </CardHeader>
          <CardContent>
            {payslipsLoading ? (
              <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
            ) : (
              <div className="divide-y divide-border/50">
                {recentPayslips.map(p => (
                  <div key={p.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-medium">
                        {new Date(p.year, p.month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
                      </p>
                      <p className="text-xs text-muted-foreground capitalize">{p.runStatus}</p>
                    </div>
                    <p className="text-sm font-semibold tabular-figures">{formatCurrency(parseFloat(p.netSalary))}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </PageWrapper>
  )
}
