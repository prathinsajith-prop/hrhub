import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarDays, Plus, Trash2, ChevronLeft, ChevronRight, Repeat2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { toast, ConfirmDialog } from '@/components/ui/overlays'
import {
    usePublicHolidays,
    useCreatePublicHoliday,
    useDeletePublicHoliday,
    useSeedUaeHolidays,
} from '@/hooks/useHr'
import { Card } from './_shared'

// ─── Holidays Tab ─────────────────────────────────────────────────────────────
const UAE_FLAG = '🇦🇪'

export function HolidaysTab() {
    const { t } = useTranslation()
    const thisYear = new Date().getFullYear()
    const [year, setYear] = useState(thisYear)
    const [showForm, setShowForm] = useState(false)
    const [form, setForm] = useState({ name: '', date: '', isRecurring: false, notes: '' })
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

    const { data: holidays, isLoading } = usePublicHolidays(year)
    const createHoliday = useCreatePublicHoliday()
    const deleteHoliday = useDeletePublicHoliday()
    const seedUae = useSeedUaeHolidays()

    const sorted = (holidays ?? []).toSorted((a, b) => a.date.localeCompare(b.date))

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.name || !form.date) return
        try {
            await createHoliday.mutateAsync({
                name: form.name,
                date: form.date,
                isRecurring: form.isRecurring,
                notes: form.notes || undefined,
            })
            toast.success(t('orgSettings.holidays.holidayAdded'), t('orgSettings.holidays.holidayAddedDesc', { name: form.name, year }))
            setForm({ name: '', date: '', isRecurring: false, notes: '' })
            setShowForm(false)
        } catch {
            toast.error(t('orgSettings.holidays.addFailed'), t('orgSettings.holidays.addFailedDesc'))
        }
    }

    const handleDelete = async (id: string) => {
        try {
            await deleteHoliday.mutateAsync(id)
            toast.success(t('orgSettings.holidays.holidayRemoved'))
            setDeleteTarget(null)
        } catch {
            toast.error(t('orgSettings.holidays.removeFailed'), t('orgSettings.holidays.removeFailedDesc'))
        }
    }

    const handleSeedUae = async () => {
        try {
            const result = await seedUae.mutateAsync(year)
            toast.success(t('orgSettings.holidays.seeded'), t('orgSettings.holidays.seededDesc', { count: result.seeded, year }))
        } catch {
            toast.error(t('orgSettings.holidays.seedFailed'), t('orgSettings.holidays.seedFailedDesc'))
        }
    }

    const monthName = (dateStr: string) =>
        new Date(dateStr + 'T00:00:00').toLocaleDateString('en-AE', { month: 'long' })

    const dayLabel = (dateStr: string) =>
        new Date(dateStr + 'T00:00:00').toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short' })

    // Group holidays by month
    const byMonth = sorted.reduce<Record<string, typeof sorted>>((acc, h) => {
        const key = monthName(h.date)
        if (!acc[key]) acc[key] = []
        acc[key].push(h)
        return acc
    }, {})

    return (
        <div className="space-y-5">
            {/* Year navigator */}
            <Card>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-1">
                        <Button
                            variant="outline"
                            size="icon-sm"
                            onClick={() => setYear(y => y - 1)}
                            aria-label={t('orgSettings.holidays.previousYear')}
                        >
                            <ChevronLeft className="size-4" />
                        </Button>
                        <span className="px-3 text-sm font-semibold tabular-nums">{year}</span>
                        <Button
                            variant="outline"
                            size="icon-sm"
                            onClick={() => setYear(y => y + 1)}
                            aria-label={t('orgSettings.holidays.nextYear')}
                        >
                            <ChevronRight className="size-4" />
                        </Button>
                        {year !== thisYear && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => setYear(thisYear)}
                            >
                                {t('orgSettings.holidays.todaysYear')}
                            </Button>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleSeedUae}
                            loading={seedUae.isPending}
                            leftIcon={<span className="text-sm">{UAE_FLAG}</span>}
                        >
                            {t('orgSettings.holidays.seedUaeHolidays')}
                        </Button>
                        <Button
                            size="sm"
                            leftIcon={<Plus className="size-3.5" />}
                            onClick={() => {
                                setShowForm(s => !s)
                                setForm(f => ({ ...f, date: `${year}-01-01` }))
                            }}
                        >
                            {t('orgSettings.holidays.addHoliday')}
                        </Button>
                    </div>
                </div>

                {/* Inline add form */}
                {showForm && (
                    <form onSubmit={handleAdd} className="mt-5 pt-5 border-t space-y-4">
                        <p className="text-sm font-semibold">{t('orgSettings.holidays.newHolidayFor', { year })}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="h_name">{t('orgSettings.holidays.holidayName')}</Label>
                                <Input
                                    id="h_name"
                                    value={form.name}
                                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                    placeholder={t('orgSettings.holidays.holidayNamePlaceholder')}
                                    required
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="h_date">{t('orgSettings.holidays.date')}</Label>
                                <DatePicker
                                    id="h_date"
                                    value={form.date}
                                    onChange={v => setForm(f => ({ ...f, date: v ?? '' }))}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="h_notes">{t('orgSettings.holidays.notesOptional')}</Label>
                                <Input
                                    id="h_notes"
                                    value={form.notes}
                                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                                    placeholder={t('orgSettings.holidays.notesPlaceholder')}
                                />
                            </div>
                            <div className="flex items-center gap-3 pt-5">
                                <Switch
                                    id="h_recurring"
                                    checked={form.isRecurring}
                                    onCheckedChange={v => setForm(f => ({ ...f, isRecurring: v }))}
                                />
                                <Label htmlFor="h_recurring" className="cursor-pointer">
                                    {t('orgSettings.holidays.recurringAnnually')}
                                </Label>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setShowForm(false)}
                            >
                                {t('common.cancel')}
                            </Button>
                            <Button type="submit" size="sm" loading={createHoliday.isPending}>
                                {t('orgSettings.holidays.addHoliday')}
                            </Button>
                        </div>
                    </form>
                )}
            </Card>

            {/* Holiday list */}
            {isLoading ? (
                <div className="space-y-3">
                    {[1, 2, 3].map(n => <Skeleton key={`skeleton-${n}`} className="h-14 w-full" />)}
                </div>
            ) : sorted.length === 0 ? (
                <Card>
                    <div className="text-center py-14 text-muted-foreground">
                        <CalendarDays className="size-10 mx-auto mb-3 opacity-25" />
                        <p className="text-sm font-medium">{t('orgSettings.holidays.noHolidays', { year })}</p>
                        <p className="text-xs mt-1">
                            {t('orgSettings.holidays.noHolidaysHint')}
                        </p>
                    </div>
                </Card>
            ) : (
                <div className="space-y-4">
                    {Object.entries(byMonth).map(([month, items]) => (
                        <Card key={month} className="p-0 overflow-hidden">
                            <div className="px-4 py-2.5 bg-muted/40 border-b">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    {month} · {items.length === 1
                                        ? t('orgSettings.holidays.monthCount', { count: items.length })
                                        : t('orgSettings.holidays.monthCount_plural', { count: items.length })}
                                </p>
                            </div>
                            <div className="divide-y">
                                {items.map(h => (
                                    <div
                                        key={h.id}
                                        className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/20 transition-colors"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="size-9 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center shrink-0">
                                                <CalendarDays className="size-4 text-rose-500" />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <p className="text-sm font-medium">{h.name}</p>
                                                    {h.isRecurring && (
                                                        <span className="inline-flex items-center gap-1 text-[10px] bg-blue-50 border border-blue-200 text-blue-700 px-1.5 py-0.5 rounded-full">
                                                            <Repeat2 className="size-2.5" />
                                                            {t('orgSettings.holidays.recurring')}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-muted-foreground">{dayLabel(h.date)}</p>
                                                {h.notes && (
                                                    <p className="text-xs text-muted-foreground/70 mt-0.5">{h.notes}</p>
                                                )}
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="size-7 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                            onClick={() => setDeleteTarget(h.id)}
                                            aria-label={t('orgSettings.holidays.deleteAria', { name: h.name })}
                                        >
                                            <Trash2 className="size-3.5" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* Summary footer */}
            {sorted.length > 0 && (
                <p className="text-xs text-muted-foreground text-right">
                    {sorted.length === 1
                        ? t('orgSettings.holidays.totalCount', { count: sorted.length, year })
                        : t('orgSettings.holidays.totalCount_plural', { count: sorted.length, year })}
                </p>
            )}

            {/* Delete confirmation */}
            <ConfirmDialog
                open={!!deleteTarget}
                onOpenChange={(v) => { if (!v) setDeleteTarget(null) }}
                title={t('orgSettings.holidays.deleteTitle')}
                description={t('orgSettings.holidays.deleteDesc')}
                confirmLabel={deleteHoliday.isPending ? t('orgSettings.holidays.removing') : t('orgSettings.holidays.remove')}
                onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
                variant="destructive"
            />
        </div>
    )
}
