/**
 * Employee-facing activity feed at /my/activity.
 *
 * Renders the calling user's own audit trail — anything the backend logged
 * with entityType='employee' + entityId=<their employeeId>. The backend
 * scopes the query server-side (route enforces self-scope), so this page
 * never needs the entityId from the client.
 *
 * What lands here:
 *   - profile self-updates (PATCH /employees/me)
 *   - password change, 2FA enable/disable
 *   - leave submissions + approve/reject decisions
 *   - payslip generation each payroll cycle
 *   - loan request + approve/reject
 *   - document uploads / verify / reject
 *   - attendance: check-in, check-out, manual punches, biometric
 *   - HR-side events that affect this employee: transfers, exit, asset
 *     assignments, performance reviews, visa stage advances, etc.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ActivityFeed } from '@/components/shared/ActivityFeed'
import { useInfiniteMyActivity, type ActivityLog } from '@/hooks/useAudit'

export function MyActivityPage() {
    const { t } = useTranslation()
    const {
        data,
        isLoading,
        hasNextPage,
        isFetchingNextPage,
        fetchNextPage,
    } = useInfiniteMyActivity({ pageSize: 20 })

    const logs = useMemo<ActivityLog[]>(
        () => (data?.pages ?? []).flat(),
        [data],
    )

    return (
        <PageWrapper>
            <PageHeader
                eyebrow={t('myActivity.eyebrow', { defaultValue: 'My account' })}
                title={t('myActivity.title', { defaultValue: 'My Activity' })}
                description={t('myActivity.description', {
                    defaultValue: 'Everything that has happened to your record — leave decisions, payslips, document uploads, profile edits, security changes, and more.',
                })}
            />

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-base">
                            {t('myActivity.cardTitle', { defaultValue: 'Recent activity' })}
                        </CardTitle>
                        {logs.length > 0 && (
                            <span className="text-[11px] text-muted-foreground tabular-nums">
                                {logs.length} event{logs.length === 1 ? '' : 's'}{hasNextPage ? '+' : ''}
                            </span>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <ActivityFeed
                        logs={logs}
                        isLoading={isLoading}
                        hasNextPage={hasNextPage ?? false}
                        isFetchingNextPage={isFetchingNextPage}
                        fetchNextPage={fetchNextPage}
                        viewer="self"
                        emptyTitle={t('myActivity.emptyTitle', { defaultValue: 'Nothing here yet' })}
                        emptyDescription={t('myActivity.emptyDescription', {
                            defaultValue: 'Your activity will appear here as you submit leave, upload documents, receive payslips, and more.',
                        })}
                    />
                </CardContent>
            </Card>
        </PageWrapper>
    )
}
