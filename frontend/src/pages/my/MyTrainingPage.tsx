import { useTranslation } from 'react-i18next'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Skeleton } from '@/components/ui/skeleton'
import { GraduationCap, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useMyTraining } from '@/hooks/useTraining'

const STATUS_STYLE: Record<string, string> = {
    planned:     'bg-slate-100 text-slate-600',
    in_progress: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
    completed:   'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    cancelled:   'bg-red-50 text-red-600 ring-1 ring-red-200',
}

export function MyTrainingPage() {
    const { t } = useTranslation()
    const { data, isLoading } = useMyTraining()
    const records = data?.data ?? []

    return (
        <PageWrapper>
            <PageHeader
                title={t('training.myPageTitle')}
                description={t('training.myPageDesc')}
            />

            <div className="rounded-xl border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="border-b bg-muted/40">
                            <tr>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('training.title')}</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('training.provider')}</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('training.type')}</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('training.table.dates')}</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('common.status')}</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('training.certificate')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                Array.from({ length: 4 }).map((_, i) => (
                                    <tr key={i} className="border-b">
                                        {Array.from({ length: 6 }).map((__, j) => (
                                            <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                                        ))}
                                    </tr>
                                ))
                            ) : records.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                                        <GraduationCap className="h-10 w-10 mx-auto mb-2 opacity-30" />
                                        <p>{t('training.noMyRecords')}</p>
                                    </td>
                                </tr>
                            ) : (
                                records.map(r => (
                                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                                        <td className="px-4 py-3 font-medium">{r.title}</td>
                                        <td className="px-4 py-3 text-muted-foreground">{r.provider ?? '—'}</td>
                                        <td className="px-4 py-3">
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                                {t(`training.types.${r.type}`)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                            {r.startDate}{r.endDate && ` – ${r.endDate}`}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', STATUS_STYLE[r.status])}>
                                                {t(`training.statuses.${r.status}`)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            {r.certificateUrl ? (
                                                <a href={r.certificateUrl} target="_blank" rel="noreferrer">
                                                    <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                                                        <ExternalLink className="h-3 w-3" />
                                                        {t('training.viewCert')}
                                                    </Button>
                                                </a>
                                            ) : (
                                                <span className="text-muted-foreground">—</span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </PageWrapper>
    )
}
