import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format, formatDistanceToNow } from 'date-fns'
import { arSA } from 'date-fns/locale'
import {
    MonitorIcon,
    SmartphoneIcon,
    TabletIcon,
    LogInIcon,
    LogOutIcon,
    XCircleIcon,
    ShieldAlertIcon,
    KeyRoundIcon,
    AlertTriangleIcon,
} from 'lucide-react'
import { useLoginHistory, type LoginHistoryRecord } from '@/hooks/useAudit'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

const eventConfig = {
    login: { icon: LogInIcon, variant: 'default' as const, labelKey: 'loginHistory.login' },
    logout: { icon: LogOutIcon, variant: 'secondary' as const, labelKey: 'loginHistory.logout' },
    failed_login: { icon: XCircleIcon, variant: 'destructive' as const, labelKey: 'loginHistory.failedLogin' },
    password_change: { icon: KeyRoundIcon, variant: 'outline' as const, labelKey: 'loginHistory.passwordChange' },
    password_reset: { icon: KeyRoundIcon, variant: 'outline' as const, labelKey: 'loginHistory.passwordReset' },
    token_refresh: { icon: LogInIcon, variant: 'secondary' as const, labelKey: 'common.na' },
}

const deviceIcon = (type: LoginHistoryRecord['deviceType']) => {
    if (type === 'mobile') return <SmartphoneIcon className="size-4 text-muted-foreground" />
    if (type === 'tablet') return <TabletIcon className="size-4 text-muted-foreground" />
    return <MonitorIcon className="size-4 text-muted-foreground" />
}

export function LoginHistoryPage() {
    const { t, i18n } = useTranslation()
    const [filter, setFilter] = useState<string>('all')

    const { data: records = [], isLoading } = useLoginHistory({ limit: 100 })

    const isArabic = i18n.language === 'ar'
    const dateFnsLocale = isArabic ? arSA : undefined

    const hasRecentFailures = records
        .slice(0, 10)
        .some((r) => r.eventType === 'failed_login')

    const filtered =
        filter === 'all' ? records : records.filter((r) => r.eventType === filter)

    const formatTime = (iso: string) => {
        const date = new Date(iso)
        const distance = formatDistanceToNow(date, { addSuffix: true, locale: dateFnsLocale })
        const absolute = format(date, 'dd MMM yyyy, HH:mm')
        return { distance, absolute }
    }

    return (
        <div className="container mx-auto max-w-5xl px-4 py-8 space-y-6">
            <div>
                <h1 className="text-2xl font-bold">{t('loginHistory.title')}</h1>
                <p className="text-muted-foreground mt-1">{t('loginHistory.description')}</p>
            </div>

            {hasRecentFailures && (
                <div className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-destructive">
                    <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
                    <div>
                        <p className="font-semibold flex items-center gap-1">
                            <ShieldAlertIcon className="size-4" />
                            {t('loginHistory.securityTip')}
                        </p>
                        <p className="mt-1 text-sm">{t('loginHistory.suspicious')}</p>
                    </div>
                </div>
            )}

            <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
                    <div>
                        <CardTitle>{t('loginHistory.title')}</CardTitle>
                        <CardDescription>{t('loginHistory.allDevices')}</CardDescription>
                    </div>
                    <Select value={filter} onValueChange={setFilter}>
                        <SelectTrigger className="w-48">
                            <SelectValue placeholder={t('loginHistory.filterEvent')} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t('loginHistory.allEvents')}</SelectItem>
                            <SelectItem value="login">{t('loginHistory.login')}</SelectItem>
                            <SelectItem value="logout">{t('loginHistory.logout')}</SelectItem>
                            <SelectItem value="failed_login">{t('loginHistory.failedLogin')}</SelectItem>
                            <SelectItem value="password_change">{t('loginHistory.passwordChange')}</SelectItem>
                            <SelectItem value="password_reset">{t('loginHistory.passwordReset')}</SelectItem>
                        </SelectContent>
                    </Select>
                </CardHeader>
                <CardContent className="p-0">
                    {isLoading ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    {[120, 100, 90, 80, 100, 100, 110].map((w, i) => (
                                        <TableHead key={i}><Skeleton className="h-4" style={{ width: w }} /></TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {Array.from({ length: 8 }).map((_, i) => (
                                    <TableRow key={i}>
                                        <TableCell><Skeleton className="h-5 w-24 rounded-full" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-14" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-24 font-mono" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : filtered.length === 0 ? (
                        <div className="py-16 text-center text-muted-foreground">{t('loginHistory.noHistory')}</div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t('loginHistory.eventType')}</TableHead>
                                    <TableHead>{t('loginHistory.device')}</TableHead>
                                    <TableHead>{t('loginHistory.browser')}</TableHead>
                                    <TableHead>{t('loginHistory.os')}</TableHead>
                                    <TableHead>{t('loginHistory.ipAddress')}</TableHead>
                                    <TableHead>{t('loginHistory.location')}</TableHead>
                                    <TableHead>{t('loginHistory.time')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filtered.map((record) => {
                                    const cfg = eventConfig[record.eventType] ?? eventConfig.login
                                    const Icon = cfg.icon
                                    const { distance, absolute } = formatTime(record.createdAt)
                                    const location = [record.city, record.country]
                                        .filter(Boolean)
                                        .join(', ') || t('common.na')

                                    return (
                                        <TableRow
                                            key={record.id}
                                            className={record.eventType === 'failed_login' ? 'bg-destructive/5' : undefined}
                                        >
                                            <TableCell>
                                                <Badge variant={cfg.variant} className="gap-1.5">
                                                    <Icon className="size-3" />
                                                    {t(cfg.labelKey)}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1.5">
                                                    {deviceIcon(record.deviceType)}
                                                    <span className="text-sm capitalize">
                                                        {record.deviceType
                                                            ? t(`loginHistory.${record.deviceType}`)
                                                            : t('loginHistory.unknown')}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-sm">
                                                    {record.browser
                                                        ? `${record.browser}${record.browserVersion ? ` ${record.browserVersion}` : ''}`
                                                        : t('loginHistory.unknown')}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-sm">
                                                    {record.os
                                                        ? `${record.os}${record.osVersion ? ` ${record.osVersion}` : ''}`
                                                        : t('loginHistory.unknown')}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                                                    {record.ipAddress ?? t('common.na')}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-sm">{location}</span>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="text-sm">{distance}</span>
                                                    <span className="text-xs text-muted-foreground" dir="ltr">
                                                        {absolute}
                                                    </span>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
