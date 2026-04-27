import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarClock, Save, RotateCcw } from 'lucide-react'
import { useLeavePolicies, useSaveLeavePolicies, useRolloverYear, type LeavePolicy, type AccrualRule } from '@/hooks/useLeave'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConfirmDialog, toast } from '@/components/ui/overlays'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Skeleton } from '@/components/ui/skeleton'

const ACCRUAL_RULES: AccrualRule[] = ['flat', 'monthly_2_then_30', 'unlimited', 'none']

export function LeavePoliciesPage() {
    const { t } = useTranslation()
    const { data: policies, isLoading } = useLeavePolicies()
    const saveMut = useSaveLeavePolicies()
    const rolloverMut = useRolloverYear()
    const [draft, setDraft] = useState<LeavePolicy[]>(() => policies ?? [])
    const [rolloverOpen, setRolloverOpen] = useState(false)
    const [prevPolicies, setPrevPolicies] = useState(policies)
    if (policies !== prevPolicies) {
        setPrevPolicies(policies)
        if (policies) setDraft(policies)
    }

    const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(policies ?? []), [draft, policies])

    const update = (i: number, patch: Partial<LeavePolicy>) => {
        setDraft((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))
    }

    const onSave = async () => {
        try {
            await saveMut.mutateAsync(draft)
            toast.success(t('leavePolicies.saved'))
        } catch (e: any) {
            toast.error(e?.message ?? t('leavePolicies.saveFailed'))
        }
    }

    const onRollover = async () => {
        try {
            const fromYear = new Date().getFullYear() - 1
            const res: any = await rolloverMut.mutateAsync(fromYear)
            const summary = res?.data ?? res
            toast.success(t('leavePolicies.rolloverSuccess', { count: summary?.closed ?? 0, from: fromYear, to: fromYear + 1 }))
        } catch (e: any) {
            toast.error(e?.message ?? t('leavePolicies.rolloverFailed'))
        } finally {
            setRolloverOpen(false)
        }
    }

    return (
        <PageWrapper width="default">
            <PageHeader
                eyebrow={t('leavePolicies.eyebrow')}
                title={t('leavePolicies.title')}
                description={t('leavePolicies.description')}
                actions={
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => setRolloverOpen(true)} disabled={rolloverMut.isPending}>
                            <RotateCcw className="mr-2 h-4 w-4" />
                            {t('leavePolicies.runRollover')}
                        </Button>
                        <Button onClick={onSave} disabled={!dirty || saveMut.isPending}>
                            <Save className="mr-2 h-4 w-4" />
                            {saveMut.isPending ? t('leavePolicies.saving') : t('leavePolicies.saveChanges')}
                        </Button>
                    </div>
                }
            />

            {isLoading ? (
                <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}</div>
            ) : (
                <div className="grid gap-4">
                    {draft.map((p, i) => (
                        <Card key={p.leaveType}>
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle className="text-base">
                                            {t(`leavePolicies.types.${p.leaveType}`, { defaultValue: p.leaveType })}
                                        </CardTitle>
                                        <CardDescription className="font-mono text-xs">{p.leaveType}</CardDescription>
                                    </div>
                                    <CalendarClock className="h-5 w-5 text-muted-foreground" />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="grid gap-4 md:grid-cols-4">
                                    <div className="space-y-1.5">
                                        <Label>{t('leavePolicies.daysPerYear')}</Label>
                                        <Input
                                            type="number"
                                            min={0}
                                            max={365}
                                            value={p.daysPerYear}
                                            onChange={(e) => update(i, { daysPerYear: Number(e.target.value) || 0 })}
                                            disabled={p.accrualRule === 'unlimited' || p.accrualRule === 'none'}
                                        />
                                    </div>
                                    <div className="space-y-1.5 md:col-span-2">
                                        <Label>{t('leavePolicies.accrualRule')}</Label>
                                        <Select value={p.accrualRule} onValueChange={(v) => update(i, { accrualRule: v as AccrualRule })}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {ACCRUAL_RULES.map((r) => (
                                                    <SelectItem key={r} value={r}>{t(`leavePolicies.accrualRules.${r}`)}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>{t('leavePolicies.maxCarryForward')}</Label>
                                        <Input
                                            type="number"
                                            min={0}
                                            max={p.daysPerYear || 365}
                                            value={p.maxCarryForward}
                                            onChange={(e) => update(i, { maxCarryForward: Number(e.target.value) || 0 })}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>{t('leavePolicies.carryExpiresAfter')}</Label>
                                        <Input
                                            type="number"
                                            min={0}
                                            max={36}
                                            value={p.carryExpiresAfterMonths}
                                            onChange={(e) => update(i, { carryExpiresAfterMonths: Number(e.target.value) || 0 })}
                                        />
                                        <p className="text-xs text-muted-foreground">{t('leavePolicies.neverExpires')}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <ConfirmDialog
                open={rolloverOpen}
                onOpenChange={setRolloverOpen}
                title={t('leavePolicies.rolloverConfirmTitle')}
                description={t('leavePolicies.rolloverConfirmDesc')}
                confirmLabel={rolloverMut.isPending ? t('leavePolicies.running') : t('leavePolicies.runRollover')}
                onConfirm={onRollover}
                variant="warning"
            />
        </PageWrapper>
    )
}

export default LeavePoliciesPage
