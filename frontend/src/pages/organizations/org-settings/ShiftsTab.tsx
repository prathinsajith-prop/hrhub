import { useState } from 'react'
import { Plus, Pencil, Trash2, Clock, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter, toast, ConfirmDialog } from '@/components/ui/overlays'
import { cn } from '@/lib/utils'
import { useShifts, useCreateShift, useUpdateShift, useDeleteShift } from '@/hooks/useShifts'
import { WEEK_DAYS } from '@/lib/options'
import type { Shift, WeekDay } from '@/types'
import { Section } from './_shared'
import { useTranslation } from 'react-i18next'

type FormState = {
    name: string
    startTime: string
    endTime: string
    weeklyOffDays: WeekDay[]
}

const emptyForm: FormState = { name: '', startTime: '09:00', endTime: '18:00', weeklyOffDays: [] }
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
            startTime: shift.startTime,
            endTime: shift.endTime,
            weeklyOffDays: shift.weeklyOffDays ?? [],
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

    function submit() {
        const name = form.name.trim()
        if (!name) { toast.warning(t('orgSettings.shifts.nameRequired'), t('orgSettings.shifts.nameRequiredDesc')); return }
        if (!TIME_REGEX.test(form.startTime) || !TIME_REGEX.test(form.endTime)) {
            toast.warning(t('orgSettings.shifts.invalidTime'), t('orgSettings.shifts.invalidTimeDesc'))
            return
        }
        const payload = { name, startTime: form.startTime, endTime: form.endTime, weeklyOffDays: form.weeklyOffDays }
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
                        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}</div>
                    ) : shifts.length === 0 ? (
                        <div className="text-center py-8 text-sm text-muted-foreground">
                            <Clock className="h-8 w-8 mx-auto mb-2 opacity-40" />
                            <p>{t('orgSettings.shifts.empty')}</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-border/50 rounded-lg border bg-background">
                            {shifts.map(s => (
                                <div key={s.id} className="flex items-center gap-3 px-3 py-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className={cn('font-medium text-sm', !s.isActive && 'line-through text-muted-foreground')}>{s.name}</span>
                                            {!s.isActive && <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-medium">{t('common.inactive')}</span>}
                                        </div>
                                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{s.startTime}–{s.endTime}</span>
                                            {s.weeklyOffDays.length > 0 && (
                                                <span className="inline-flex items-center gap-1">
                                                    <Calendar className="h-3 w-3" />
                                                    {s.weeklyOffDays.map(d => d[0].toUpperCase() + d.slice(1, 3)).join(', ')}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => openEdit(s)} title={t('common.edit')}>
                                        <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    {s.isActive && (
                                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setRemoveTarget(s)} title={t('common.delete')}>
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    <Button variant="ghost" size="sm" className="gap-1.5 text-primary font-medium mt-2" onClick={openCreate}>
                        <Plus className="h-3.5 w-3.5" /> {t('orgSettings.shifts.addShift')}
                    </Button>
                </Section>
            </div>

            <Dialog open={dialogOpen} onOpenChange={o => !o && closeDialog()}>
                <DialogContent size="md">
                    <DialogHeader>
                        <DialogTitle>{editing ? t('orgSettings.shifts.editTitle') : t('orgSettings.shifts.addTitle')}</DialogTitle>
                    </DialogHeader>
                    <DialogBody>
                        <div className="space-y-3">
                            <div className="space-y-1.5">
                                <Label>{t('orgSettings.shifts.fieldName')}</Label>
                                <Input
                                    value={form.name}
                                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                    placeholder={t('orgSettings.shifts.namePlaceholder')}
                                    autoFocus
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label>{t('orgSettings.shifts.fieldStart')}</Label>
                                    <Input type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>{t('orgSettings.shifts.fieldEnd')}</Label>
                                    <Input type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} />
                                </div>
                            </div>
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
