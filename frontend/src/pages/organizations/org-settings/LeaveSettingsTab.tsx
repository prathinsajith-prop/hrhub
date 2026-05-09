import { useMemo, useState } from 'react'
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

const DAYS: { id: Weekday; full: string; short: string }[] = [
    { id: 'monday',    full: 'Monday',    short: 'Mon' },
    { id: 'tuesday',   full: 'Tuesday',   short: 'Tue' },
    { id: 'wednesday', full: 'Wednesday', short: 'Wed' },
    { id: 'thursday',  full: 'Thursday',  short: 'Thu' },
    { id: 'friday',    full: 'Friday',    short: 'Fri' },
    { id: 'saturday',  full: 'Saturday',  short: 'Sat' },
    { id: 'sunday',    full: 'Sunday',    short: 'Sun' },
]

const ACCRUAL_RULES: { value: AccrualRule; label: string; desc: string }[] = [
    { value: 'flat',               label: 'Flat (annual grant)',    desc: 'All days granted on Jan 1' },
    { value: 'monthly_2_then_30',  label: 'Monthly (2 → 30 days)', desc: '2 days/month for first 15 months, then 30/year' },
    { value: 'unlimited',          label: 'Unlimited',              desc: 'No cap; employees can take as needed' },
    { value: 'none',               label: 'None',                   desc: 'Leave type is tracked but not accrued' },
]

const POLICY_TYPE_LABELS: Record<string, string> = {
    annual:        'Annual Leave',
    sick:          'Sick Leave',
    maternity:     'Maternity Leave',
    paternity:     'Paternity Leave',
    unpaid:        'Unpaid Leave',
    compassionate: 'Compassionate Leave',
    emergency:     'Emergency Leave',
    bereavement:   'Bereavement Leave',
    hajj:          'Hajj Leave',
}

export function LeaveSettingsTab() {
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
    const settingsDirty = useMemo(() => !!(settingsData && (
        rolloverEnabledFrom !== (settingsData.rolloverEnabledFrom ?? '') ||
        JSON.stringify(weekOffDays) !== JSON.stringify(settingsData.weekOffDays ?? ['saturday', 'sunday']) ||
        workingWeekStart !== (settingsData.workingWeekStart ?? 'monday')
    )), [settingsData, rolloverEnabledFrom, weekOffDays, workingWeekStart])
    const policiesDirty = useMemo(
        () => JSON.stringify(policyDraft) !== JSON.stringify(policiesData ?? []),
        [policyDraft, policiesData],
    )
    const dirty = settingsDirty || policiesDirty

    // ── Rollover gate ───────────────────────────────────────────────────────────
    const isRolloverLocked = (() => {
        if (!settingsData?.rolloverEnabledFrom) return false
        const unlock = new Date(settingsData.rolloverEnabledFrom)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        return today < unlock
    })()

    const [rolloverConfirmOpen, setRolloverConfirmOpen] = useState(false)
    const [saved, setSaved] = useState(false)

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
            toast.success('Leave settings saved', 'Working week and leave policies have been updated.')
            setTimeout(() => setSaved(false), 2000)
        } catch {
            toast.error('Save failed', 'Could not update leave settings.')
        }
    }

    const handleClearGate = async () => {
        try {
            setRolloverEnabledFrom('')
            await updateSettingsMut.mutateAsync({ rolloverEnabledFrom: null })
            toast.success('Gate removed', 'Year-end rollover is now always available.')
        } catch {
            toast.error('Save failed', 'Could not update leave settings.')
        }
    }

    const handleRollover = async () => {
        try {
            const fromYear = new Date().getFullYear() - 1
            const res = await rolloverMut.mutateAsync(fromYear) as { data?: { closed?: number }; closed?: number }
            const summary = (res as { data?: { closed?: number } })?.data ?? res
            toast.success('Rollover complete', `${summary?.closed ?? 0} employee balances rolled over from ${fromYear} → ${fromYear + 1}.`)
        } catch (e) {
            toast.error('Rollover failed', (e as Error)?.message ?? 'Could not run year-end rollover.')
        } finally {
            setRolloverConfirmOpen(false)
        }
    }

    const workingDays = DAYS.filter(d => !weekOffDays.includes(d.id))
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
                title="Working Week"
                description="Define which days are weekly off and when the working week begins. This drives leave-day counting and calendar views."
            >
                <div className="space-y-6">
                    <div className="space-y-2">
                        <Label>Weekly off days</Label>
                        <p className="text-[11px] text-muted-foreground">
                            Select the days your team doesn't work. These are skipped when calculating leave days.
                        </p>
                        <div className="flex flex-wrap gap-2 pt-1">
                            {DAYS.map(d => {
                                const selected = weekOffDays.includes(d.id)
                                return (
                                    <button
                                        key={d.id}
                                        type="button"
                                        onClick={() => toggleWeekOff(d.id)}
                                        className={cn(
                                            'h-10 min-w-[72px] rounded-lg border px-3 text-sm font-medium transition-all',
                                            'flex items-center justify-center gap-1.5',
                                            selected
                                                ? 'border-rose-200 bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                                                : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted/50',
                                        )}
                                    >
                                        <span>{d.short}</span>
                                        {selected && <span className="h-1 w-1 rounded-full bg-rose-500" />}
                                    </button>
                                )
                            })}
                        </div>
                        {weekOffDays.length === 0 && (
                            <p className="text-[11px] text-amber-700">No weekly off selected — every day will count as a working day.</p>
                        )}
                    </div>

                    <div className="space-y-2 max-w-sm">
                        <Label htmlFor="weekStart">Working week starts on</Label>
                        <Select value={workingWeekStart} onValueChange={(v) => setWorkingWeekStart(v as Weekday)}>
                            <SelectTrigger id="weekStart">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {DAYS.map(d => (
                                    <SelectItem key={d.id} value={d.id}>{d.full}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-[11px] text-muted-foreground">
                            Used as the first day of week in calendars and timesheet views.
                        </p>
                    </div>

                    <div className="rounded-lg border bg-muted/30 p-3.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Working schedule preview</p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                            {workingDays.length > 0 ? workingDays.map(d => (
                                <Badge key={d.id} variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                                    {d.short}
                                </Badge>
                            )) : (
                                <span className="text-xs text-muted-foreground">No working days configured.</span>
                            )}
                            <span className="mx-1.5 text-muted-foreground/50">·</span>
                            <span className="text-xs text-muted-foreground">
                                {workingDays.length} working {workingDays.length === 1 ? 'day' : 'days'} per week
                            </span>
                        </div>
                    </div>
                </div>
            </Section>

            {/* ── Leave Policies ───────────────────────────────────────── */}
            <Section
                icon={CalendarDays}
                title="Leave Policies"
                description="Configure entitlements, accrual rules, and carry-forward limits for each leave type."
            >
                {policyDraft.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                        <CalendarDays className="h-8 w-8 text-muted-foreground/20 mb-2" />
                        <p className="text-sm text-muted-foreground">No leave types configured yet.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {/* Column headers — desktop only */}
                        <div className="hidden sm:grid sm:grid-cols-[1fr_100px_180px_90px_90px] gap-3 px-1 pb-1 border-b">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Leave Type</span>
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-center">Days / Year</span>
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Accrual Rule</span>
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-center">Max Carry</span>
                            <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                <span>Carry Exp.</span>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger>
                                            <Info className="h-3 w-3 text-muted-foreground/60" />
                                        </TooltipTrigger>
                                        <TooltipContent>Months after year-end before carried days expire (0 = never expires)</TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                        </div>

                        {policyDraft.map((p, i) => {
                            const label = POLICY_TYPE_LABELS[p.leaveType] ?? p.leaveType
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
                                                {ACCRUAL_RULES.map(r => (
                                                    <SelectItem key={r.value} value={r.value}>
                                                        <span className="text-sm">{r.label}</span>
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
                                                <Label className="text-[11px]">Days / Year</Label>
                                                <NumericInput
                                                    decimal={false}
                                                    value={String(p.daysPerYear)}
                                                    onChange={(e) => updatePolicy(i, { daysPerYear: Math.min(365, Number(e.target.value) || 0) })}
                                                    disabled={isUnlimitedOrNone}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[11px]">Max Carry</Label>
                                                <NumericInput
                                                    decimal={false}
                                                    value={String(p.maxCarryForward)}
                                                    onChange={(e) => updatePolicy(i, { maxCarryForward: Math.min(p.daysPerYear || 365, Number(e.target.value) || 0) })}
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-[11px]">Accrual Rule</Label>
                                            <Select
                                                value={p.accrualRule}
                                                onValueChange={(v) => updatePolicy(i, { accrualRule: v as AccrualRule })}
                                            >
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {ACCRUAL_RULES.map(r => (
                                                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-[11px]">Carry expiry (months, 0 = never)</Label>
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
                title="Year-End Rollover Gate"
                description="Block HR from running the annual leave rollover before a chosen date. Leave blank to allow it any time."
                action={
                    isRolloverLocked ? (
                        <Badge variant="destructive" className="gap-1.5">
                            <LockKeyhole className="h-3 w-3" />
                            Locked until {settingsData?.rolloverEnabledFrom}
                        </Badge>
                    ) : (
                        <Badge variant="secondary" className="gap-1.5 text-emerald-700 bg-emerald-50 border-emerald-200">
                            <UnlockKeyhole className="h-3 w-3" />
                            {settingsData?.rolloverEnabledFrom ? `Unlocked since ${settingsData.rolloverEnabledFrom}` : 'No gate set'}
                        </Badge>
                    )
                }
            >
                <div className="space-y-4">
                    <div className="space-y-2 max-w-sm">
                        <Label htmlFor="rolloverDate">Allow rollover from</Label>
                        <div className="flex items-center gap-2">
                            <DatePicker
                                id="rolloverDate"
                                value={rolloverEnabledFrom}
                                onChange={v => setRolloverEnabledFrom(v ?? '')}
                                className="flex-1"
                            />
                            {rolloverEnabledFrom && (
                                <Button variant="ghost" size="sm" onClick={handleClearGate} disabled={updateSettingsMut.isPending}>
                                    Clear
                                </Button>
                            )}
                        </div>
                        <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
                            <CalendarDays className="h-3 w-3" />
                            Tip: set to <span className="font-mono">2026-01-01</span> to prevent premature rollovers.
                        </p>
                    </div>

                    <div className="border-t pt-4">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-sm font-medium">Run Year-End Rollover</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Carries forward unused leave balances from last year to this year, respecting the max carry-forward limits above.
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
                                                    ? <LockKeyhole className="h-3.5 w-3.5 mr-1.5" />
                                                    : <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                                                }
                                                Run Rollover
                                            </Button>
                                        </span>
                                    </TooltipTrigger>
                                    {isRolloverLocked && (
                                        <TooltipContent>
                                            Rollover is locked until {settingsData?.rolloverEnabledFrom}. Clear the gate date above to unlock.
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
                    <p className="text-[11px] text-muted-foreground">You have unsaved changes.</p>
                )}
                <div className="ml-auto">
                    <Button
                        onClick={handleSave}
                        loading={isSaving}
                        disabled={!dirty}
                        leftIcon={saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                        variant={saved ? 'success' : 'default'}
                    >
                        {saved ? 'Saved' : 'Save changes'}
                    </Button>
                </div>
            </div>

            <ConfirmDialog
                open={rolloverConfirmOpen}
                onOpenChange={setRolloverConfirmOpen}
                title="Run Year-End Rollover?"
                description={`This will carry forward unused leave balances from ${new Date().getFullYear() - 1} to ${new Date().getFullYear()}, capped by the max carry-forward limits defined above. This action cannot be undone.`}
                confirmLabel={rolloverMut.isPending ? 'Running…' : 'Run Rollover'}
                onConfirm={handleRollover}
                variant="warning"
            />
        </div>
    )
}
