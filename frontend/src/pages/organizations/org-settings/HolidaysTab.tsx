import React, { useState } from 'react'
import { CalendarDays, Plus, Trash2, ChevronLeft, ChevronRight, Repeat2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
    const thisYear = new Date().getFullYear()
    const [year, setYear] = useState(thisYear)
    const [showForm, setShowForm] = useState(false)
    const [form, setForm] = useState({ name: '', date: '', isRecurring: false, notes: '' })
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

    const { data: holidays, isLoading } = usePublicHolidays(year)
    const createHoliday = useCreatePublicHoliday()
    const deleteHoliday = useDeletePublicHoliday()
    const seedUae = useSeedUaeHolidays()

    const sorted = [...(holidays ?? [])].sort((a, b) => a.date.localeCompare(b.date))

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
            toast.success('Holiday added', `${form.name} added to ${year}.`)
            setForm({ name: '', date: '', isRecurring: false, notes: '' })
            setShowForm(false)
        } catch {
            toast.error('Failed', 'Could not add holiday.')
        }
    }

    const handleDelete = async (id: string) => {
        try {
            await deleteHoliday.mutateAsync(id)
            toast.success('Holiday removed')
            setDeleteTarget(null)
        } catch {
            toast.error('Failed', 'Could not remove holiday.')
        }
    }

    const handleSeedUae = async () => {
        try {
            const result = await seedUae.mutateAsync(year)
            toast.success('UAE holidays seeded', `${result.seeded} holidays added for ${year}.`)
        } catch {
            toast.error('Failed', 'Could not seed UAE holidays.')
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
                            aria-label="Previous year"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="px-3 text-sm font-semibold tabular-nums">{year}</span>
                        <Button
                            variant="outline"
                            size="icon-sm"
                            onClick={() => setYear(y => y + 1)}
                            aria-label="Next year"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                        {year !== thisYear && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => setYear(thisYear)}
                            >
                                Today's Year
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
                            Seed UAE Holidays
                        </Button>
                        <Button
                            size="sm"
                            leftIcon={<Plus className="h-3.5 w-3.5" />}
                            onClick={() => {
                                setShowForm(s => !s)
                                setForm(f => ({ ...f, date: `${year}-01-01` }))
                            }}
                        >
                            Add Holiday
                        </Button>
                    </div>
                </div>

                {/* Inline add form */}
                {showForm && (
                    <form onSubmit={handleAdd} className="mt-5 pt-5 border-t space-y-4">
                        <p className="text-sm font-semibold">New holiday for {year}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="h_name">Holiday Name *</Label>
                                <Input
                                    id="h_name"
                                    value={form.name}
                                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                    placeholder="e.g. National Day"
                                    required
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="h_date">Date *</Label>
                                <Input
                                    id="h_date"
                                    type="date"
                                    value={form.date}
                                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                                    required
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="h_notes">Notes (optional)</Label>
                                <Input
                                    id="h_notes"
                                    value={form.notes}
                                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                                    placeholder="Additional details"
                                />
                            </div>
                            <div className="flex items-center gap-3 pt-5">
                                <Switch
                                    id="h_recurring"
                                    checked={form.isRecurring}
                                    onCheckedChange={v => setForm(f => ({ ...f, isRecurring: v }))}
                                />
                                <Label htmlFor="h_recurring" className="cursor-pointer">
                                    Recurring annually
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
                                Cancel
                            </Button>
                            <Button type="submit" size="sm" loading={createHoliday.isPending}>
                                Add Holiday
                            </Button>
                        </div>
                    </form>
                )}
            </Card>

            {/* Holiday list */}
            {isLoading ? (
                <div className="space-y-3">
                    {[1, 2, 3].map(n => <Skeleton key={n} className="h-14 w-full" />)}
                </div>
            ) : sorted.length === 0 ? (
                <Card>
                    <div className="text-center py-14 text-muted-foreground">
                        <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-25" />
                        <p className="text-sm font-medium">No holidays configured for {year}</p>
                        <p className="text-xs mt-1">
                            Add holidays manually or click{' '}
                            <button
                                type="button"
                                className="underline underline-offset-2 hover:text-foreground"
                                onClick={handleSeedUae}
                            >
                                Seed UAE Holidays
                            </button>{' '}
                            to pre-fill UAE national holidays.
                        </p>
                    </div>
                </Card>
            ) : (
                <div className="space-y-4">
                    {Object.entries(byMonth).map(([month, items]) => (
                        <Card key={month} className="p-0 overflow-hidden">
                            <div className="px-4 py-2.5 bg-muted/40 border-b">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    {month} · {items.length} holiday{items.length > 1 ? 's' : ''}
                                </p>
                            </div>
                            <div className="divide-y">
                                {items.map(h => (
                                    <div
                                        key={h.id}
                                        className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/20 transition-colors"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="h-9 w-9 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center shrink-0">
                                                <CalendarDays className="h-4 w-4 text-rose-500" />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <p className="text-sm font-medium">{h.name}</p>
                                                    {h.isRecurring && (
                                                        <span className="inline-flex items-center gap-1 text-[10px] bg-blue-50 border border-blue-200 text-blue-700 px-1.5 py-0.5 rounded-full">
                                                            <Repeat2 className="h-2.5 w-2.5" />
                                                            Recurring
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
                                            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                            onClick={() => setDeleteTarget(h.id)}
                                            aria-label={`Delete ${h.name}`}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
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
                    {sorted.length} public holiday{sorted.length > 1 ? 's' : ''} · {year}
                </p>
            )}

            {/* Delete confirmation */}
            <ConfirmDialog
                open={!!deleteTarget}
                onOpenChange={(v) => { if (!v) setDeleteTarget(null) }}
                title="Remove this holiday?"
                description="This will remove it from the organization calendar. Employees already on leave for this day are not affected."
                confirmLabel={deleteHoliday.isPending ? 'Removing…' : 'Remove'}
                onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
                variant="destructive"
            />
        </div>
    )
}
