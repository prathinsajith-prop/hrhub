import { useState } from 'react'
import { Plus, Pencil, Trash2, Clock, Calendar, X, ChevronDown, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter, toast, ConfirmDialog } from '@/components/ui/overlays'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useShifts, useCreateShift, useUpdateShift, useDeleteShift } from '@/hooks/useShifts'
import { WEEK_DAYS } from '@/lib/options'
import type { Shift, ShiftCoreHoursWindow, WeekDay } from '@/types'
import { Section } from './_shared'
import { useTranslation } from 'react-i18next'

type FormState = {
    name: string
    color: string
    startTime: string
    endTime: string
    weeklyOffDays: WeekDay[]
    /** Top-level toggle: when off, margin minutes go back to null on submit. */
    enableMargin: boolean
    /** Stored as strings so we can show an empty input until HR types something. */
    marginBefore: string
    marginAfter: string
    enableCoreHours: boolean
    coreWindows: ShiftCoreHoursWindow[]
    restrictBreaks: boolean
}

/**
 * Curated shift colour palette — Tailwind's main hue families at 500-weight
 * for vibrant + 700-weight for muted, plus a couple of neutrals. Grouped by
 * row in the popover so HR scans by hue (warm / cool / neutral) instead of
 * hunting through a single long strip.
 *
 * Each row has 9 swatches → 4 rows × 9 = 36 picks. Wide enough for any
 * tenant's needs without being a generic colour wheel (which always looks
 * messy and lets HR pick muddy unreadable combinations).
 */
const SHIFT_COLOR_PALETTE: ReadonlyArray<{ label: string; colors: readonly string[] }> = [
    {
        label: 'Vibrant',
        colors: [
            '#ef4444', // red
            '#f97316', // orange
            '#f59e0b', // amber
            '#eab308', // yellow
            '#84cc16', // lime
            '#22c55e', // green
            '#10b981', // emerald
            '#14b8a6', // teal
            '#06b6d4', // cyan
        ],
    },
    {
        label: 'Cool',
        colors: [
            '#0ea5e9', // sky
            '#3b82f6', // blue
            '#6366f1', // indigo
            '#8b5cf6', // violet
            '#a855f7', // purple
            '#d946ef', // fuchsia
            '#ec4899', // pink
            '#f43f5e', // rose
            '#0284c7', // sky-600 (deeper)
        ],
    },
    {
        label: 'Muted',
        colors: [
            '#7f1d1d', // rose-900
            '#9a3412', // orange-900
            '#854d0e', // yellow-800
            '#3f6212', // lime-800
            '#14532d', // green-900
            '#134e4a', // teal-900
            '#0c4a6e', // sky-900
            '#312e81', // indigo-900
            '#581c87', // purple-900
        ],
    },
    {
        label: 'Neutral',
        colors: [
            '#0f172a', // slate-900
            '#1e293b', // slate-800
            '#475569', // slate-600
            '#64748b', // slate-500
            '#94a3b8', // slate-400
            '#9ca3af', // gray-400
            '#78716c', // stone-500
            '#6b7280', // gray-500
            '#000000', // pure black for high contrast
        ],
    },
]

/** Flat list — used for the legacy `SHIFT_COLOR_PRESETS[0]` default. */
const SHIFT_COLOR_PRESETS = SHIFT_COLOR_PALETTE.flatMap((g) => g.colors)

const emptyForm: FormState = {
    name: '',
    color: SHIFT_COLOR_PRESETS[0],
    startTime: '09:00',
    endTime: '18:00',
    weeklyOffDays: [],
    enableMargin: false,
    marginBefore: '15',
    marginAfter: '30',
    enableCoreHours: false,
    coreWindows: [{ from: '10:00', to: '12:00' }],
    restrictBreaks: false,
}
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/

export function ShiftsTab() {
    const { t } = useTranslation()
    const { data: items = [], isLoading } = useShifts({ includeInactive: true })
    const shifts = Array.isArray(items) ? items as Shift[] : []
    const create = useCreateShift()
    const update = useUpdateShift()
    const remove = useDeleteShift()

    const [editing, setEditing] = useState<Shift | null>(null)
    const [creating, setCreating] = useState(false)
    const [form, setForm] = useState<FormState>(emptyForm)
    const [removeTarget, setRemoveTarget] = useState<Shift | null>(null)

    const dialogOpen = creating || editing !== null

    function openCreate() {
        setForm(emptyForm)
        setEditing(null)
        setCreating(true)
    }

    function openEdit(shift: Shift) {
        setForm({
            name: shift.name,
            color: shift.color ?? SHIFT_COLOR_PRESETS[0],
            startTime: shift.startTime,
            endTime: shift.endTime,
            weeklyOffDays: shift.weeklyOffDays ?? [],
            enableMargin: shift.shiftMarginBeforeMinutes != null,
            marginBefore: shift.shiftMarginBeforeMinutes != null ? String(shift.shiftMarginBeforeMinutes) : '15',
            marginAfter: shift.shiftMarginAfterMinutes != null ? String(shift.shiftMarginAfterMinutes) : '30',
            enableCoreHours: (shift.coreWorkingHours?.length ?? 0) > 0,
            coreWindows: shift.coreWorkingHours?.length ? shift.coreWorkingHours : [{ from: '10:00', to: '12:00' }],
            restrictBreaks: shift.restrictBreaksDuringCoreHours,
        })
        setEditing(shift)
        setCreating(false)
    }

    function closeDialog() {
        setCreating(false)
        setEditing(null)
        setForm(emptyForm)
    }

    function toggleDay(day: WeekDay) {
        setForm(f => ({
            ...f,
            weeklyOffDays: f.weeklyOffDays.includes(day)
                ? f.weeklyOffDays.filter(d => d !== day)
                : [...f.weeklyOffDays, day],
        }))
    }

    function updateWindow(index: number, patch: Partial<ShiftCoreHoursWindow>) {
        setForm(f => ({
            ...f,
            coreWindows: f.coreWindows.map((w, i) => i === index ? { ...w, ...patch } : w),
        }))
    }

    function addWindow() {
        setForm(f => ({ ...f, coreWindows: [...f.coreWindows, { from: '14:00', to: '16:00' }] }))
    }

    function removeWindow(index: number) {
        setForm(f => ({ ...f, coreWindows: f.coreWindows.filter((_, i) => i !== index) }))
    }

    function submit() {
        const name = form.name.trim()
        if (!name) {
            toast.warning(t('orgSettings.shifts.nameRequired'), t('orgSettings.shifts.nameRequiredDesc'))
            return
        }
        if (!TIME_REGEX.test(form.startTime) || !TIME_REGEX.test(form.endTime)) {
            toast.warning(t('orgSettings.shifts.invalidTime'), t('orgSettings.shifts.invalidTimeDesc'))
            return
        }
        // Margin: both required when the toggle is on.
        let shiftMarginBeforeMinutes: number | null = null
        let shiftMarginAfterMinutes: number | null = null
        if (form.enableMargin) {
            const b = Number(form.marginBefore)
            const a = Number(form.marginAfter)
            if (!Number.isFinite(b) || b < 0 || !Number.isFinite(a) || a < 0) {
                toast.warning('Invalid margin', 'Shift margin minutes must be 0 or higher.')
                return
            }
            shiftMarginBeforeMinutes = Math.floor(b)
            shiftMarginAfterMinutes = Math.floor(a)
        }
        // Core hours: validate each window and ensure from < to.
        let coreWorkingHours: ShiftCoreHoursWindow[] = []
        if (form.enableCoreHours) {
            for (const w of form.coreWindows) {
                if (!TIME_REGEX.test(w.from) || !TIME_REGEX.test(w.to)) {
                    toast.warning('Invalid core hours', `Use HH:MM in every core-hours window (got "${w.from} - ${w.to}").`)
                    return
                }
                if (w.from >= w.to) {
                    toast.warning('Invalid core hours', `Window "${w.from} - ${w.to}" — "From" must be earlier than "To".`)
                    return
                }
            }
            coreWorkingHours = form.coreWindows
        }
        const payload = {
            name,
            color: form.color || null,
            startTime: form.startTime,
            endTime: form.endTime,
            weeklyOffDays: form.weeklyOffDays,
            shiftMarginBeforeMinutes,
            shiftMarginAfterMinutes,
            coreWorkingHours,
            restrictBreaksDuringCoreHours: form.enableCoreHours && form.restrictBreaks,
        }
        if (editing) {
            update.mutate({ id: editing.id, data: payload }, {
                onSuccess: () => { toast.success(t('orgSettings.shifts.updated')); closeDialog() },
            })
        } else {
            create.mutate(payload, {
                onSuccess: () => { toast.success(t('orgSettings.shifts.added')); closeDialog() },
            })
        }
    }

    function handleDelete() {
        if (!removeTarget) return
        remove.mutate(removeTarget.id, {
            onSuccess: () => {
                toast.success(t('orgSettings.shifts.deactivated', { name: removeTarget.name }))
                setRemoveTarget(null)
            },
            onError: () => { setRemoveTarget(null) },
        })
    }

    return (
        <>
            <div className="space-y-6">
                <div>
                    <h3 className="text-base font-semibold">{t('orgSettings.shifts.title')}</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">{t('orgSettings.shifts.desc')}</p>
                </div>

                <Section icon={Clock} title={t('orgSettings.shifts.listTitle')} description={t('orgSettings.shifts.listDesc')}>
                    {isLoading ? (
                        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={`div-${i}`} className="h-14 rounded-lg" />)}</div>
                    ) : shifts.length === 0 ? (
                        <div className="text-center py-8 text-sm text-muted-foreground">
                            <Clock className="size-8 mx-auto mb-2 opacity-40" />
                            <p>{t('orgSettings.shifts.empty')}</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {shifts.map(s => {
                                // Each row carries the shift's identity colour
                                // in TWO places so it can't be missed:
                                //   1. A 4px left accent stripe — gives the row
                                //      its own visual weight in the list.
                                //   2. A larger swatch chip next to the name —
                                //      reads as a label, not decoration.
                                const swatchColor = s.color ?? '#cbd5e1'
                                return (
                                    <div
                                        key={s.id}
                                        className={cn(
                                            'flex items-center gap-3 rounded-lg border bg-background py-2.5 pe-2 ps-3 overflow-hidden relative',
                                            !s.isActive && 'opacity-60',
                                        )}
                                    >
                                        {/* Left accent stripe — fills the row's
                                            full height regardless of content. */}
                                        <span
                                            aria-hidden
                                            className="absolute left-0 top-0 bottom-0 w-1"
                                            style={{ backgroundColor: swatchColor }}
                                        />
                                        {/* Larger swatch — 10×10 with a soft
                                            tinted background ring so the colour
                                            reads on both light + dark themes. */}
                                        <span
                                            aria-hidden
                                            className="size-9 rounded-md border border-border/40 shrink-0 shadow-sm"
                                            style={{ backgroundColor: swatchColor }}
                                        />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className={cn('font-medium text-sm', !s.isActive && 'line-through text-muted-foreground')}>{s.name}</span>
                                                {!s.isActive && <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-medium">{t('common.inactive')}</span>}
                                                {s.coreWorkingHours.length > 0 && <span className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-medium dark:bg-indigo-950/40 dark:text-indigo-300">Core hrs</span>}
                                                {s.shiftMarginBeforeMinutes != null && <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-medium dark:bg-amber-950/40 dark:text-amber-300">Margin ±</span>}
                                            </div>
                                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                                <span className="inline-flex items-center gap-1"><Clock className="size-3" />{s.startTime}–{s.endTime}</span>
                                                {s.weeklyOffDays.length > 0 && (
                                                    <span className="inline-flex items-center gap-1">
                                                        <Calendar className="size-3" />
                                                        {s.weeklyOffDays.map(d => d[0].toUpperCase() + d.slice(1, 3)).join(', ')}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <Button size="sm" variant="ghost" className="size-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => openEdit(s)} title={t('common.edit')}>
                                            <Pencil className="size-3.5" />
                                        </Button>
                                        {s.isActive && (
                                            <Button size="sm" variant="ghost" className="size-7 p-0 text-destructive hover:text-destructive" onClick={() => setRemoveTarget(s)} title={t('common.delete')}>
                                                <Trash2 className="size-3.5" />
                                            </Button>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    <Button variant="ghost" size="sm" className="gap-1.5 text-primary font-medium mt-2" onClick={openCreate}>
                        <Plus className="size-3.5" /> {t('orgSettings.shifts.addShift')}
                    </Button>
                </Section>
            </div>

            <Dialog open={dialogOpen} onOpenChange={o => !o && closeDialog()}>
                <DialogContent size="lg">
                    <DialogHeader>
                        <DialogTitle>{editing ? t('orgSettings.shifts.editTitle') : t('orgSettings.shifts.addTitle')}</DialogTitle>
                    </DialogHeader>
                    <DialogBody>
                        <div className="space-y-5">
                            {/* Shift name + color — color picker lives in a
                                popover so the form stays compact and the
                                palette can be wide without crowding the row. */}
                            <div className="grid grid-cols-[1fr_auto] gap-3">
                                <div className="space-y-1.5">
                                    <Label>
                                        {t('orgSettings.shifts.fieldName')} <span className="text-rose-500">*</span>
                                    </Label>
                                    <Input
                                        value={form.name}
                                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                        placeholder={t('orgSettings.shifts.namePlaceholder')}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>{t('orgSettings.shifts.fieldColor', { defaultValue: 'Color' })}</Label>
                                    <ShiftColorPicker
                                        value={form.color}
                                        onChange={(c) => setForm((f) => ({ ...f, color: c }))}
                                    />
                                </div>
                            </div>

                            {/* From / To */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label>
                                        {t('orgSettings.shifts.fieldStart')} <span className="text-rose-500">*</span>
                                    </Label>
                                    <Input type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>
                                        {t('orgSettings.shifts.fieldEnd')} <span className="text-rose-500">*</span>
                                    </Label>
                                    <Input type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} />
                                </div>
                            </div>

                            {/* Weekly off days */}
                            <div className="space-y-1.5">
                                <Label>{t('orgSettings.shifts.fieldWeeklyOff')}</Label>
                                <div className="flex flex-wrap gap-1.5">
                                    {WEEK_DAYS.map(day => {
                                        const selected = form.weeklyOffDays.includes(day.value)
                                        return (
                                            <button
                                                type="button"
                                                key={day.value}
                                                onClick={() => toggleDay(day.value)}
                                                className={cn(
                                                    'px-3 py-1.5 rounded-md text-xs border transition-colors',
                                                    selected
                                                        ? 'bg-primary text-primary-foreground border-primary'
                                                        : 'bg-background border-input hover:bg-accent',
                                                )}
                                            >
                                                {day.label}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Shift margin */}
                            <div className="space-y-2">
                                <label htmlFor="shift-enable-margin" className="flex items-start gap-2 cursor-pointer">
                                    <Checkbox
                                        id="shift-enable-margin"
                                        checked={form.enableMargin}
                                        onCheckedChange={(v) => setForm(f => ({ ...f, enableMargin: v === true }))}
                                        className="mt-0.5"
                                    />
                                    <span>
                                        <span className="text-sm font-medium">Shift Margin</span>
                                        <span className="block text-xs text-muted-foreground">
                                            Define boundaries within which payable hours will be calculated.
                                        </span>
                                    </span>
                                </label>
                                {form.enableMargin && (
                                    <div className="space-y-2 rounded-lg bg-muted/40 p-3 ms-7">
                                        <div className="flex items-center gap-2 text-sm">
                                            <Input
                                                type="number"
                                                min={0}
                                                max={720}
                                                placeholder="Minutes"
                                                value={form.marginBefore}
                                                onChange={e => setForm(f => ({ ...f, marginBefore: e.target.value }))}
                                                className="w-24"
                                            />
                                            <span className="text-muted-foreground">minutes before the shift starts</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm">
                                            <Input
                                                type="number"
                                                min={0}
                                                max={720}
                                                placeholder="Minutes"
                                                value={form.marginAfter}
                                                onChange={e => setForm(f => ({ ...f, marginAfter: e.target.value }))}
                                                className="w-24"
                                            />
                                            <span className="text-muted-foreground">minutes after the shift ends</span>
                                        </div>
                                        {TIME_REGEX.test(form.startTime) && TIME_REGEX.test(form.endTime) && Number.isFinite(Number(form.marginBefore)) && Number.isFinite(Number(form.marginAfter)) && (
                                            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 dark:bg-amber-950/30 dark:border-amber-900/40 dark:text-amber-300">
                                                Check-in / check-out entries only within{' '}
                                                {offsetTime(form.startTime, -Number(form.marginBefore))} – {offsetTime(form.endTime, Number(form.marginAfter))}{' '}
                                                will be considered as payable hours.
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Core working hours */}
                            <div className="space-y-2">
                                <label htmlFor="shift-enable-core-hours" className="flex items-start gap-2 cursor-pointer">
                                    <Checkbox
                                        id="shift-enable-core-hours"
                                        checked={form.enableCoreHours}
                                        onCheckedChange={(v) => setForm(f => ({ ...f, enableCoreHours: v === true }))}
                                        className="mt-0.5"
                                    />
                                    <span>
                                        <span className="text-sm font-medium">Core Working Hours</span>
                                        <span className="block text-xs text-muted-foreground">
                                            Define the time frames during which employees in this shift are required to be present for work.
                                        </span>
                                    </span>
                                </label>
                                {form.enableCoreHours && (
                                    <div className="space-y-3 rounded-lg bg-muted/40 p-3 ms-7">
                                        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                                            <span>From</span>
                                            <span>To</span>
                                            <span></span>
                                        </div>
                                        {form.coreWindows.map((w, i) => (
                                            <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                                                <Input type="time" value={w.from} onChange={e => updateWindow(i, { from: e.target.value })} />
                                                <Input type="time" value={w.to} onChange={e => updateWindow(i, { to: e.target.value })} />
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="size-8 p-0 text-muted-foreground hover:text-rose-600"
                                                    onClick={() => removeWindow(i)}
                                                    disabled={form.coreWindows.length === 1}
                                                    title={form.coreWindows.length === 1 ? 'At least one window is required' : 'Remove window'}
                                                >
                                                    <X className="size-3.5" />
                                                </Button>
                                            </div>
                                        ))}
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="text-primary"
                                            onClick={addWindow}
                                            disabled={form.coreWindows.length >= 8}
                                        >
                                            <Plus className="size-3.5" /> Add
                                        </Button>
                                        <label htmlFor="shift-restrict-breaks" className="flex items-start gap-2 cursor-pointer pt-1">
                                            <Checkbox
                                                id="shift-restrict-breaks"
                                                checked={form.restrictBreaks}
                                                onCheckedChange={(v) => setForm(f => ({ ...f, restrictBreaks: v === true }))}
                                                className="mt-0.5"
                                            />
                                            <span>
                                                <span className="text-sm font-medium">Restrict breaks during core working hours</span>
                                                <span className="block text-xs text-muted-foreground">
                                                    Automatic and manual breaks for this shift are not allowed during core working hours.
                                                </span>
                                            </span>
                                        </label>
                                    </div>
                                )}
                            </div>
                        </div>
                    </DialogBody>
                    <DialogFooter>
                        <Button variant="outline" onClick={closeDialog}>{t('common.cancel')}</Button>
                        <Button onClick={submit} loading={create.isPending || update.isPending}>
                            {editing ? t('common.save') : t('common.add')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={!!removeTarget}
                onOpenChange={o => !o && setRemoveTarget(null)}
                title={t('orgSettings.shifts.deleteConfirmTitle', { name: removeTarget?.name })}
                description={t('orgSettings.shifts.deleteConfirmDesc')}
                confirmLabel={t('common.deactivate')}
                variant="destructive"
                onConfirm={handleDelete}
            />
        </>
    )
}

/** Add (or subtract, with negative input) a minute offset to an HH:MM string,
 *  clamping at the day boundaries. Used to render the "payable hours" preview. */
function offsetTime(hhmm: string, minutes: number): string {
    const [h, m] = hhmm.split(':').map(Number)
    if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm
    let total = h * 60 + m + minutes
    if (total < 0) total = 0
    if (total > 24 * 60 - 1) total = 24 * 60 - 1
    const oh = Math.floor(total / 60)
    const om = total % 60
    return `${String(oh).padStart(2, '0')}:${String(om).padStart(2, '0')}`
}

// ─── Shift colour picker (popover) ──────────────────────────────────────────

const HEX_RE = /^#([0-9a-f]{6})$/i

/**
 * Compact colour selector for the shift dialog. Renders a trigger button
 * that shows the current swatch + hex value; clicking opens a popover with
 * a 4-row grouped palette (vibrant / cool / muted / neutral) plus a custom
 * hex input at the bottom for the rare case HR wants to colour-match a
 * brand value.
 *
 * Keeps the form row compact (the trigger is one rect) while exposing 36
 * curated picks + arbitrary hex — strictly better than the inline 7-swatch
 * strip it replaces.
 */
function ShiftColorPicker({
    value,
    onChange,
}: {
    value: string
    onChange: (next: string) => void
}) {
    const [open, setOpen] = useState(false)
    // Track the custom-hex input separately so it accepts intermediate
    // typing states (e.g. "#1a") without disturbing `value` until valid.
    const [customHex, setCustomHex] = useState(value)
    // Keep customHex synced when an outside change (palette pick / parent
    // reset) updates value. State-during-render avoids a useEffect.
    const [lastValue, setLastValue] = useState(value)
    if (lastValue !== value) {
        setLastValue(value)
        setCustomHex(value)
    }

    // True when the current value is one of the curated swatches — drives
    // the "Custom" pill that activates only on free-form hex.
    const isPreset = SHIFT_COLOR_PRESETS.includes(value.toLowerCase())

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label="Pick shift colour"
                    className={cn(
                        'inline-flex h-10 w-[10rem] items-center gap-2 rounded-md border bg-background px-2 text-sm',
                        'hover:bg-muted/40 transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    )}
                >
                    <span
                        className="size-6 shrink-0 rounded-md border border-border/40 shadow-sm"
                        style={{ backgroundColor: value }}
                    />
                    <span className="flex-1 text-left font-mono text-xs uppercase tabular-nums">
                        {value}
                    </span>
                    <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[20rem] p-3" sideOffset={6}>
                <div className="space-y-3">
                    {SHIFT_COLOR_PALETTE.map((group) => (
                        <div key={group.label}>
                            <div className="mb-1.5 flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                    {group.label}
                                </span>
                            </div>
                            <div className="grid grid-cols-9 gap-1.5">
                                {group.colors.map((c) => {
                                    const selected = value.toLowerCase() === c.toLowerCase()
                                    return (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() => {
                                                onChange(c)
                                                setOpen(false)
                                            }}
                                            aria-label={`Pick ${c}`}
                                            className={cn(
                                                'group relative size-7 rounded-md transition-all',
                                                'ring-offset-background hover:scale-110',
                                                selected && 'ring-2 ring-ring ring-offset-1',
                                            )}
                                            style={{ backgroundColor: c }}
                                        >
                                            {selected && (
                                                <Check className="absolute inset-0 m-auto size-3.5 text-white drop-shadow-sm" />
                                            )}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    ))}

                    {/* Custom hex — for the edge case where the curated set
                        doesn't have an exact brand match. */}
                    <div className="border-t pt-3">
                        <div className="mb-1.5 flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                Custom hex
                            </span>
                            {!isPreset && (
                                <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                                    ● in use
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <span
                                className="size-7 shrink-0 rounded-md border"
                                style={{ backgroundColor: HEX_RE.test(customHex) ? customHex : value }}
                            />
                            <Input
                                value={customHex}
                                onChange={(e) => {
                                    const next = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`
                                    setCustomHex(next)
                                    if (HEX_RE.test(next)) onChange(next.toLowerCase())
                                }}
                                placeholder="Hex colour (#RRGGBB)"
                                maxLength={7}
                                className="h-8 font-mono text-xs uppercase"
                            />
                        </div>
                        {!HEX_RE.test(customHex) && customHex !== '' && (
                            <p className="mt-1 text-[10px] text-rose-600 dark:text-rose-400">
                                Enter a 6-digit hex like #0ea5e9
                            </p>
                        )}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    )
}
