import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Clock, LogIn, LogOut } from 'lucide-react'

import { useAttendance, useCheckIn, useCheckOut } from '@/hooks/useAttendance'
import { useAuthStore } from '@/store/authStore'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { GlassCard } from '@/components/shared/GlassCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { cn, formatDate } from '@/lib/utils'

export function EmployeeAttendancePage() {
    const { t } = useTranslation()
    const user = useAuthStore((s) => s.user)
    const employeeId = user?.employeeId ?? undefined

    const today = new Date().toISOString().slice(0, 10)
    const { data: todayList } = useAttendance({ employeeId, startDate: today, endDate: today, limit: 1 })
    const { data: history, isLoading } = useAttendance({ employeeId, limit: 30 })
    const checkIn = useCheckIn()
    const checkOut = useCheckOut()

    const todayRecord = todayList?.data?.[0]
    const isCheckedIn = !!todayRecord?.checkIn && !todayRecord?.checkOut

    return (
        <div className="space-y-6">
            <PageHeader title={t('attendance.title')} />

            <GlassCard tone={isCheckedIn ? 'success' : 'primary'} className="p-5">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-wider opacity-80">
                            {formatDate(today, { weekday: 'long', day: '2-digit', month: 'long' })}
                        </div>
                        <div className="mt-2 text-sm">
                            {todayRecord?.checkIn ? (
                                <>
                                    {t('home.checkedInAt', {
                                        time: new Date(todayRecord.checkIn).toLocaleTimeString([], {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                        }),
                                    })}
                                    {todayRecord.checkOut ? (
                                        <>
                                            {' '}
                                            ·{' '}
                                            {new Date(todayRecord.checkOut).toLocaleTimeString([], {
                                                hour: '2-digit',
                                                minute: '2-digit',
                                            })}
                                        </>
                                    ) : null}
                                </>
                            ) : (
                                t('home.checkInPrompt')
                            )}
                        </div>
                    </div>
                    {isCheckedIn ? (
                        <Button
                            onClick={() =>
                                checkOut.mutate(undefined, {
                                    onSuccess: () => toast.success(t('attendance.checkOut')),
                                })
                            }
                            loading={checkOut.isPending}
                        >
                            <LogOut className="h-4 w-4" /> {t('attendance.checkOut')}
                        </Button>
                    ) : !todayRecord?.checkIn ? (
                        <Button
                            onClick={() =>
                                checkIn.mutate(undefined, {
                                    onSuccess: () => toast.success(t('attendance.checkIn')),
                                })
                            }
                            loading={checkIn.isPending}
                        >
                            <LogIn className="h-4 w-4" /> {t('attendance.checkIn')}
                        </Button>
                    ) : (
                        <Badge variant="secondary">{t('attendance.alreadyCheckedIn')}</Badge>
                    )}
                </div>
            </GlassCard>

            {isLoading ? (
                <div className="space-y-3">
                    <Skeleton className="h-16" />
                    <Skeleton className="h-16" />
                </div>
            ) : !history?.data?.length ? (
                <EmptyState icon={<Clock className="h-8 w-8" />} title={t('attendance.noRecords')} />
            ) : (
                <div className="space-y-2">
                    {history.data.map((r) => (
                        <Card key={r.id} className="border-border/70">
                            <CardContent className="flex items-center justify-between gap-3 p-3">
                                <div>
                                    <div className="text-sm font-medium">{formatDate(r.date)}</div>
                                    <div className="mt-0.5 text-xs text-muted-foreground">
                                        {r.checkIn
                                            ? new Date(r.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                            : '—'}
                                        {' → '}
                                        {r.checkOut
                                            ? new Date(r.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                            : '—'}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm font-medium tabular-figures">{r.hoursWorked ?? '—'}</div>
                                    <Badge
                                        className={cn(
                                            'border-0 text-[10px] uppercase tracking-wider',
                                            r.status === 'present'
                                                ? 'bg-emerald-100 text-emerald-800'
                                                : r.status === 'on_leave'
                                                  ? 'bg-amber-100 text-amber-800'
                                                  : 'bg-muted text-muted-foreground',
                                        )}
                                    >
                                        {r.status}
                                    </Badge>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}
