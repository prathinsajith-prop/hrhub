import { useTranslation } from 'react-i18next'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Receipt, Download, RefreshCcw } from 'lucide-react'
import { useMyPayslips } from '@/hooks/useMe'
import { useAuthStore } from '@/store/authStore'
import { useDownloadPayslip } from '@/hooks/usePayroll'

const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']

const STATUS_VARIANT: Record<string, string> = {
    paid: 'success', wps_submitted: 'success', approved: 'default',
    processing: 'warning', draft: 'secondary', failed: 'destructive',
}

function fmt(val: string | number, locale: string) {
    return Number(val).toLocaleString(locale === 'ar' ? 'ar-AE' : 'en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function MyPayslipsContent() {
    const { t, i18n } = useTranslation()
    const user = useAuthStore(s => s.user)
    const employeeId = (user as { employeeId?: string } | null)?.employeeId
    const { data: payslips = [], isLoading, isFetching, refetch } = useMyPayslips()
    const download = useDownloadPayslip()
    const months = i18n.language.startsWith('ar') ? MONTHS_AR : MONTHS_EN
    const STATUS_LABELS: Record<string, string> = {
        paid: t('myPayslips.statusPaid'),
        wps_submitted: t('myPayslips.statusWpsSubmitted'),
        approved: t('myPayslips.statusApproved'),
        processing: t('myPayslips.statusProcessing'),
        draft: t('myPayslips.statusDraft'),
        failed: t('myPayslips.statusFailed'),
    }

    return (
        <div>
            <div className="flex justify-end mb-4">
                <Button variant="outline" size="sm" leftIcon={<RefreshCcw className={isFetching ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />} onClick={() => refetch()} disabled={isFetching}>
                    {t('common.refresh')}
                </Button>
            </div>

            {!employeeId ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                    <Receipt className="h-10 w-10 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">{t('myPayslips.notLinked')}</p>
                </div>
            ) : isLoading ? (
                <div className="space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
            ) : payslips.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                    <Receipt className="h-10 w-10 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">{t('myPayslips.noneYet')}</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {payslips.map(p => (
                        <div key={p.id} className="flex items-center gap-4 rounded-xl border px-4 py-3.5 bg-card">
                            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                <Receipt className="h-5 w-5 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold">{months[p.month - 1]} {p.year}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {t('myPayslips.basic')}: AED {fmt(p.basicSalary, i18n.language)} · {t('myPayslips.gross')}: AED {fmt(p.grossSalary, i18n.language)} · {t('myPayslips.deductions')}: AED {fmt(p.deductions, i18n.language)}
                                </p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                <div className="text-right hidden sm:block">
                                    <p className="text-sm font-bold">AED {fmt(p.netSalary, i18n.language)}</p>
                                    <p className="text-[10px] text-muted-foreground">{t('myPayslips.netPay')}</p>
                                </div>
                                <Badge variant={STATUS_VARIANT[p.runStatus] as 'success' | 'default' | 'warning' | 'secondary' | 'destructive'}>
                                    {STATUS_LABELS[p.runStatus] ?? p.runStatus}
                                </Badge>
                                {(p.runStatus === 'paid' || p.runStatus === 'wps_submitted' || p.runStatus === 'approved') && (
                                    <Button
                                        size="sm" variant="outline"
                                        className="gap-1.5"
                                        onClick={() => download.mutate(p.id)}
                                        disabled={download.isPending}
                                    >
                                        <Download className="h-3.5 w-3.5" />
                                        <span className="hidden sm:inline">PDF</span>
                                    </Button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

export function MyPayslipsPage() {
    const { t } = useTranslation()
    return (
        <PageWrapper>
            <PageHeader title={t('myPayslips.title')} description={t('myPayslips.description')} />
            <MyPayslipsContent />
        </PageWrapper>
    )
}
