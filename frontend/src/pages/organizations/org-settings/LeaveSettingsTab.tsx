import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    CalendarClock, Save, CheckCircle2, LockKeyhole, UnlockKeyhole,
    CalendarDays, CalendarRange, RotateCcw, Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { DatePicker } from '@/components/ui/date-picker'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toast, ConfirmDialog } from '@/components/ui/overlays'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { NumericInput } from '@/components/ui/numeric-input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useLeaveSettings, useUpdateLeaveSettings, type Weekday } from '@/hooks/useSettings'
import { useLeavePolicies, useSaveLeavePolicies, useRolloverYear, type LeavePolicy, type AccrualRule } from '@/hooks/useLeave'
import { Section } from './_shared'
import { cn } from '@/lib/utils'

const DAYS_IDS: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

const ACCRUAL_RULE_VALUES: AccrualRule[] = ['flat', 'monthly_2_then_30', 'unlimited', 'none']

const POLICY_TYPE_KEYS: Record<string, string> = {
    annual:        'orgSettings.leave.policyTypes.annual',
    sick:          'orgSettings.leave.policyTypes.sick',
    maternity:     'orgSettings.leave.policyTypes.maternity',
    paternity:     'orgSettings.leave.policyTypes.paternity',
    unpaid:        'orgSettings.leave.policyTypes.unpaid',
    compassionate: 'orgSettings.leave.policyTypes.compassionate',
    emergency:     'orgSettings.leave.policyTypes.emergency',
    bereavement:   'orgSettings.leave.policyTypes.bereavement',
    hajj:          'orgSettings.leave.policyTypes.hajj',
}

export function LeaveSettingsTab() {
    const { t } = useTranslation()
    const { data: settingsData, isLoading: settingsLoading } = useLeaveSettings()
    const { data: policiesData, isLoading: policiesLoading } = useLeavePolicies()
    const updateSettingsMut = useUpdateLeaveSettings()
    const savePoliciesMut = useSaveLeavePolicies()
    const rolloverMut = useRolloverYear()

    // ── Working week state ──────────────────────────────────────────────────────
    const [rolloverEnabledFrom, setRolloverEnabledFrom] = useState<string>('')
    const [weekOffDays, setWeekOffDays] = useState<Weekday[]>(['saturday', 'sunday'])
    const [workingWeekStart, setWorkingWeekStart] = useState<Weekday>('monday')
    const [settingsSynced, setSettingsSynced] = useState(false)
    if (!settingsSynced && settingsData) {
        setRolloverEnabledFrom(settingsData.rolloverEnabledFrom ?? '')
        setWeekOffDays(settingsData.weekOffDays?.length ? settingsData.weekOffDays : ['saturday', 'sunday'])
        setWorkingWeekStart(settingsData.workingWeekStart ?? 'monday')
        setSettingsSynced(true)
    }

    // ── Leave policies state ────────────────────────────────────────────────────
    const [policyDraft, setPolicyDraft] = useState<LeavePolicy[]>([])
    const [prevPoliciesData, setPrevPoliciesData] = useState(policiesData)
    if (policiesData !== prevPoliciesData) {
        setPrevPoliciesData(policiesData)
        if (policiesData) setPolicyDraft(policiesData)
    }

    const updatePolicy = (i: number, patch: Partial<LeavePolicy>) => {
        setPolicyDraft(prev => prev.map((p, idx) => idx === i ? { ...p, ...patch } : p))
    }

    // ── Dirty state ─────────────────────────────────────────────────────────────
    const settingsDirty = useMemo(() => {
        if (!settingsData) return false
        const savedDays = settingsData.weekOffDays ?? ['saturday', 'sunday']
        const daysChanged = weekOffDays.length !== savedDays.length || weekOffDays.some((d, i) => d !== savedDays[i])
        return rolloverEnabledFrom !== (settingsData.rolloverEnabledFrom ?? '') ||
            daysChanged ||
            workingWeekStart !== (settingsData.workingWeekStart ?? 'monday')
    }, [settingsData, rolloverEnabledFrom, weekOffDays, workingWeekStart])
    const policiesDirty = useMemo(
        () => JSON.stringify(policyDraft) !== JSON.stringify(policiesData ?? []),
        [policyDraft, policiesData],
    )
    const dirty = settingsDirty || policiesDirty

    // ── Rollover gate ───────────────────────────────────────────────────────────
    const rolloverEnabledFromServer = settingsData?.rolloverEnabledFrom
    const isRolloverLocked = useMemo(() => {
        if (!rolloverEnabledFromServer) return false
        const unlock = new Date(rolloverEnabledFromServer)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        return today < unlock
    }, [rolloverEnabledFromServer])

    const [rolloverConfirmOpen, setRolloverConfirmOpen] = useState(false)
    const [saved, setSaved] = useState(false)

    // ── Helpers ─────────────────────────────────────────────────────────────────
    const getDayShort = (id: Weekday) => t(`orgSettings.leave.dayShort.${id}`)
    const getDayFull = (id: Weekday) => t(`orgSettings.leave.dayFull.${id}`)
    const getAccrualLabel = (value: AccrualRule) => t(`orgSettings.leave.accrualRules.${value}`)

    // ── Handlers ────────────────────────────────────────────────────────────────
    const toggleWeekOff = (day: Weekday) => {
        setWeekOffDays(prev =>
            prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day],
        )
    }

    const handleSave = async () => {
        try {
            const promises: Promise<unknown>[] = []
            if (settingsDirty) {
                promises.push(updateSettingsMut.mutateAsync({
                    rolloverEnabledFrom: rolloverEnabledFrom || null,
                    weekOffDays,
                    workingWeekStart,
                }))
            }
            if (policiesDirty) {
                promises.push(savePoliciesMut.mutateAsync(policyDraft))
            }
            await Promise.all(promises)
            setSaved(true)
            toast.success(t('orgSettings.leave.settingsSaved'), t('orgSettings.leave.settingsSavedDesc'))
            setTimeout(() => setSaved(false), 2000)
        } catch {
            toast.error(t('orgSettings.leave.saveFailed'), t('orgSettings.leave.saveFailedDesc'))
        }
    }

    const handleClearGate = async () => {
        try {
            setRolloverEnabledFrom('')
            await updateSettingsMut.mutateAsync({ rolloverEnabledFrom: null })
            toast.success(t('orgSettings.leave.gateRemoved'), t('orgSettings.leave.gateRemovedDesc'))
        } catch {
            toast.error(t('orgSettings.leave.saveFailed'), t('orgSettings.leave.saveFailedDesc'))
        }
    }

    const handleRollover = async () => {
        try {
            const fromYear = new Date().getFullYear() - 1
            const res = await rolloverMut.mutateAsync(fromYear) as { data?: { closed?: number }; closed?: number }
            const summary = (res as { data?: { closed?: number } })?.data ?? res
            toast.success(
                t('orgSettings.leave.rolloverComplete'),
                t('orgSettings.leave.rolloverCompleteDesc', { count: summary?.closed ?? 0, from: fromYear, to: fromYear + 1 }),
            )
        } catch (e) {
            toast.error(t('orgSettings.leave.rolloverFailed'), (e as Error)?.message ?? t('orgSettings.leave.rolloverFailed'))
        } finally {
            setRolloverConfirmOpen(false)
        }
    }

    const workingDays = DAYS_IDS.filter(d => !weekOffDays.includes(d))
    const isSaving = updateSettingsMut.isPending || savePoliciesMut.isPending
    const isLoading = settingsLoading || policiesLoading

    if (isLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-72 w-full" />
                <Skeleton className="h-36 w-full" />
            </div>
        )
    }

    return (
        <div className="space-y-5">
            {/* ── Working Week ─────────────────────────────────────────── */}
            <Section
                icon={CalendarRange}
                title={t('orgSettings.leave.workingWeekTitle')}
                description={t('orgSettings.leave.workingWeekDesc')}
            >
                <div className="space-y-6">
                    <div className="space-y-2">
                        <Label>{t('orgSettings.leave.weeklyOffDays')}</Label>
                        <p className="text-[11px] text-muted-foreground">
                            {t('orgSettings.leave.weeklyOffDaysHint')}
                        </p>
                        <div className="flex flex-wrap gap-2 pt-1">
                            {DAYS_IDS.map(id => {
                                const selected = weekOffDays.includes(id)
                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => toggleWeekOff(id)}
                                        className={cn(
                                            'h-10 min-w-[72px] rounded-lg border px-3 text-sm font-medium transition-all',
                                            'flex items-center justify-center gap-1.5',
                                            selected
                                                ? 'border-rose-200 bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                                                : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted/50',
                                        )}
                                    >
                                        <span>{getDayShort(id)}</span>
                                        {selected && <span className="size-1 rounded-full bg-rose-500" />}
                                    </button>
                                )
                            })}
                        </div>
                        {weekOffDays.length === 0 && (
                            <p className="text-[11px] text-amber-700">{t('orgSettings.leave.noWeeklyOff')}</p>
                        )}
                    </div>

                    <div className="space-y-2 max-w-sm">
                        <Label htmlFor="weekStart">{t('orgSettings.leave.weekStartLabel')}</Label>
                        <Select value={workingWeekStart} onValueChange={(v) => setWorkingWeekStart(v as Weekday)}>
                            <SelectTrigger id="weekStart">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {DAYS_IDS.map(id => (
                                    <SelectItem key={id} value={id}>{getDayFull(id)}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-[11px] text-muted-foreground">
                            {t('orgSettings.leave.weekStartHint')}
                        </p>
                    </div>

                    <div className="rounded-lg border bg-muted/30 p-3.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">{t('orgSettings.leave.schedulePreview')}</p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                            {workingDays.length > 0 ? workingDays.map(id => (
                                <Badge key={id} variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                                    {getDayShort(id)}
                                </Badge>
                            )) : (
                                <span className="text-xs text-muted-foreground">{t('orgSettings.leave.noWorkingDays')}</span>
                            )}
                            <span className="mx-1.5 text-muted-foreground/50">·</span>
                            <span className="text-xs text-muted-foreground">
                                {workingDays.length === 1
                                    ? t('orgSettings.leave.workingDaysPerWeek', { count: workingDays.length })
                                    : t('orgSettings.leave.workingDaysPerWeek_plural', { count: workingDays.length })}
                            </span>
                        </div>
                    </div>
                </div>
            </Section>

            {/* ── Leave Policies ───────────────────────────────────────── */}
            <Section
                icon={CalendarDays}
                title={t('orgSettings.leave.leavePoliciesTitle')}
                description={t('orgSettings.leave.leavePoliciesDesc')}
            >
                {policyDraft.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                        <CalendarDays className="size-8 text-muted-foreground/20 mb-2" />
                        <p className="text-sm text-muted-foreground">{t('orgSettings.leave.noLeaveTypes')}</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {/* Column headers - desktop only */}
                        <div className="hidden sm:grid sm:grid-cols-[1fr_100px_180px_90px_90px] gap-3 px-1 pb-1 border-b">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('orgSettings.leave.leaveTypeCol')}</span>
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-center">{t('orgSettings.leave.daysYearCol')}</span>
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('orgSettings.leave.accrualRuleCol')}</span>
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-center">{t('orgSettings.leave.maxCarryCol')}</span>
                            <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                <span>{t('orgSettings.leave.carryExpCol')}</span>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger>
                                            <Info className="size-3 text-muted-foreground/60" />
                                        </TooltipTrigger>
                                        <TooltipContent>{t('orgSettings.leave.carryExpTooltip')}</TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                        </div>

                        {policyDraft.map((p, i) => {
                            const labelKey = POLICY_TYPE_KEYS[p.leaveType]
                            const label = labelKey ? t(labelKey) : p.leaveType
                            const isUnlimitedOrNone = p.accrualRule === 'unlimited' || p.accrualRule === 'none'
                            return (
                                <div
                                    key={p.leaveType}
                                    className="rounded-lg border bg-card p-3 sm:p-0 sm:rounded-none sm:border-0 sm:border-b sm:pb-3 last:border-b-0 last:pb-0"
                                >
                                    {/* Desktop row */}
                                    <div className="hidden sm:grid sm:grid-cols-[1fr_100px_180px_90px_90px] gap-3 items-center">
                                        <div>
                                            <p className="text-sm font-medium text-foreground">{label}</p>
                                            <p className="text-[10px] font-mono text-muted-foreground/60 mt-0.5">{p.leaveType}</p>
                                        </div>
                                        <div className="flex justify-center">
                                            <NumericInput
                                                decimal={false}
                                                value={String(p.daysPerYear)}
                                                onChange={(e) => {
                                                    const n = Math.min(365, Number(e.target.value) || 0)
                                                    updatePolicy(i, { daysPerYear: n })
                                                }}
                                                disabled={isUnlimitedOrNone}
                                                className="w-20 text-center"
                                            />
                                        </div>
                                        <Select
                                            value={p.accrualRule}
                                            onValueChange={(v) => updatePolicy(i, { accrualRule: v as AccrualRule })}
                                        >
                                            <SelectTrigger className="h-9 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {ACCRUAL_RULE_VALUES.map(r => (
                                                    <SelectItem key={r} value={r}>
                                                        <span className="text-sm">{getAccrualLabel(r)}</span>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <div className="flex justify-center">
                                            <NumericInput
                                                decimal={false}
                                                value={String(p.maxCarryForward)}
                                                onChange={(e) => {
                                                    const cap = p.daysPerYear || 365
                                                    updatePolicy(i, { maxCarryForward: Math.min(cap, Number(e.target.value) || 0) })
                                                }}
                                                className="w-20 text-center"
                                            />
                                        </div>
                                        <div className="flex justify-center">
                                            <NumericInput
                                                decimal={false}
                                                value={String(p.carryExpiresAfterMonths)}
                                                onChange={(e) => {
                                                    updatePolicy(i, { carryExpiresAfterMonths: Math.min(36, Number(e.target.value) || 0) })
                                                }}
                                                className="w-20 text-center"
                                            />
                                        </div>
                                    </div>

                                    {/* Mobile card */}
                                    <div className="sm:hidden space-y-3">
                                        <div>
                                            <p className="text-sm font-semibold text-foreground">{label}</p>
                                            <p className="text-[10px] font-mono text-muted-foreground/60">{p.leaveType}</p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <Label className="text-[11px]">{t('orgSettings.leave.daysLabel')}</Label>
                                                <NumericInput
                                                    decimal={false}
                                                    value={String(p.daysPerYear)}
                                                    onChange={(e) => updatePolicy(i, { daysPerYear: Math.min(365, Number(e.target.value) || 0) })}
                                                    disabled={isUnlimitedOrNone}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[11px]">{t('orgSettings.leave.maxCarryLabel')}</Label>
                                                <NumericInput
                                                    decimal={false}
                                                    value={String(p.maxCarryForward)}
                                                    onChange={(e) => updatePolicy(i, { maxCarryForward: Math.min(p.daysPerYear || 365, Number(e.target.value) || 0) })}
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-[11px]">{t('orgSettings.leave.accrualLabel')}</Label>
                                            <Select
                                                value={p.accrualRule}
                                                onValueChange={(v) => updatePolicy(i, { accrualRule: v as AccrualRule })}
                                            >
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {ACCRUAL_RULE_VALUES.map(r => (
                                                        <SelectItem key={r} value={r}>{getAccrualLabel(r)}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-[11px]">{t('orgSettings.leave.mobileCarryExpiry')}</Label>
                                            <NumericInput
                                                decimal={false}
                                                value={String(p.carryExpiresAfterMonths)}
                                                onChange={(e) => updatePolicy(i, { carryExpiresAfterMonths: Math.min(36, Number(e.target.value) || 0) })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </Section>

            {/* ── Year-End Rollover Gate ───────────────────────────────── */}
            <Section
                icon={CalendarClock}
                title={t('orgSettings.leave.rolloverGateTitle')}
                description={t('orgSettings.leave.rolloverGateDesc')}
                action={
                    isRolloverLocked ? (
                        <Badge variant="destructive" className="gap-1.5">
                            <LockKeyhole className="size-3" />
                            {t('orgSettings.leave.lockedUntil', { date: settingsData?.rolloverEnabledFrom })}
                        </Badge>
                    ) : (
                        <Badge variant="secondary" className="gap-1.5 text-emerald-700 bg-emerald-50 border-emerald-200">
                            <UnlockKeyhole className="size-3" />
                            {settingsData?.rolloverEnabledFrom
                                ? t('orgSettings.leave.unlockedSince', { date: settingsData.rolloverEnabledFrom })
                                : t('orgSettings.leave.noGateSet')}
                        </Badge>
                    )
                }
            >
                <div className="space-y-4">
                    <div className="space-y-2 max-w-sm">
                        <Label htmlFor="rolloverDate">{t('orgSettings.leave.allowRolloverFrom')}</Label>
                        <div className="flex items-center gap-2">
                            <DatePicker
                                id="rolloverDate"
                                value={rolloverEnabledFrom}
                                onChange={v => setRolloverEnabledFrom(v ?? '')}
                                className="flex-1"
                            />
                            {rolloverEnabledFrom && (
                                <Button variant="ghost" size="sm" onClick={handleClearGate} disabled={updateSettingsMut.isPending}>
                                    {t('orgSettings.leave.clear')}
                                </Button>
                            )}
                        </div>
                        <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
                            <CalendarDays className="size-3" />
                            {t('orgSettings.leave.rolloverTip')}
                        </p>
                    </div>

                    <div className="border-t pt-4">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-sm font-medium">{t('orgSettings.leave.runRolloverTitle')}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {t('orgSettings.leave.runRolloverDesc')}
                                </p>
                            </div>
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span tabIndex={isRolloverLocked ? 0 : -1}>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => !isRolloverLocked && setRolloverConfirmOpen(true)}
                                                disabled={rolloverMut.isPending || isRolloverLocked}
                                                className="shrink-0"
                                            >
                                                {isRolloverLocked
                                                    ? <LockKeyhole className="size-3.5 mr-1.5" />
                                                    : <RotateCcw className="size-3.5 mr-1.5" />
                                                }
                                                {t('orgSettings.leave.runRollover')}
                                            </Button>
                                        </span>
                                    </TooltipTrigger>
                                    {isRolloverLocked && (
                                        <TooltipContent>
                                            {t('orgSettings.leave.rolloverLockedTooltip', { date: settingsData?.rolloverEnabledFrom })}
                                        </TooltipContent>
                                    )}
                                </Tooltip>
                            </TooltipProvider>
                        </div>
                    </div>
                </div>
            </Section>

            {/* ── Sticky save bar ──────────────────────────────────────── */}
            <div className="flex items-center justify-between gap-4 pt-2 sticky bottom-0 bg-gradient-to-t from-background via-background to-transparent pb-2 -mb-2">
                {dirty && (
                    <p className="text-[11px] text-muted-foreground">{t('orgSettings.leave.unsavedChanges')}</p>
                )}
                <div className="ml-auto">
                    <Button
                        onClick={handleSave}
                        loading={isSaving}
                        disabled={!dirty}
                        leftIcon={saved ? <CheckCircle2 className="size-4" /> : <Save className="size-4" />}
                        variant={saved ? 'success' : 'default'}
                    >
                        {saved ? t('orgSettings.leave.saved') : t('orgSettings.leave.saveChanges')}
                    </Button>
                </div>
            </div>

            <ConfirmDialog
                open={rolloverConfirmOpen}
                onOpenChange={setRolloverConfirmOpen}
                title={t('orgSettings.leave.rolloverConfirmTitle')}
                description={t('orgSettings.leave.rolloverConfirmDesc', {
                    from: new Date().getFullYear() - 1,
                    to: new Date().getFullYear(),
                })}
                confirmLabel={rolloverMut.isPending ? t('orgSettings.leave.runningRollover') : t('orgSettings.leave.runRollover')}
                onConfirm={handleRollover}
                variant="warning"
            />
        </div>
    )
}
