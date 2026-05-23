// ─── Exit Clearance Panel ────────────────────────────────────────────────────
// Renders inside the Exit Detail dialog: shows the per-exit clearance items
// auto-instantiated from the offboarding-flow templates, plus any ad-hoc
// items HR added later. HR managers can flip status on every row and create
// new ad-hoc items; non-HR owners can update only their rows (server-enforced).
//
// Empty-state behavior matters here: when an exit has zero clearance items
// (the tenant hasn't configured any templates), this panel used to render
// nothing at all — making it invisible whether the stage was "done" or
// "skipped because empty". The new design shows an explicit empty card with
// a "Configure templates" link + an "Add item" CTA so HR has a clear path
// forward.

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ListChecks, Check, Clock as ClockIcon, Plus, Settings2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter, toast } from '@/components/ui/overlays'
import { useExitClearances, useUpdateClearanceItem, useAddClearanceItem } from '@/hooks/useOffboardingFlow'
import { usePermissions } from '@/hooks/usePermissions'
import { ROUTES } from '@/lib/routes'
import { formatDate } from '@/lib/utils'

interface Props {
    exitId: string
    /** Optional id to scroll-anchor against from the stages timeline. */
    sectionId?: string
}

export function ExitClearancePanel({ exitId, sectionId }: Props) {
    const { t } = useTranslation()
    const { can } = usePermissions()
    const isHr = can('manage_exit')
    const { data, isLoading } = useExitClearances(exitId)
    const upd = useUpdateClearanceItem(exitId)
    const [addOpen, setAddOpen] = useState(false)

    if (isLoading) return <Skeleton className="h-32 w-full" />

    const items = data ?? []
    const completed = items.filter(i => i.status === 'completed' || i.status === 'waived').length
    const total = items.length
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0

    return (
        <div id={sectionId} className="rounded-lg border bg-card overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/30 border-b">
                <ListChecks className="size-3.5 text-muted-foreground" />
                <span className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
                    {t('exit.clearancePanel.title', { defaultValue: 'Clearance Checklist' })}
                </span>
                <span className="ms-auto text-xs text-muted-foreground tabular-nums">
                    {completed} / {total}
                </span>
                {isHr && total > 0 && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAddOpen(true)}>
                        <Plus className="size-3 me-1" />
                        {t('exit.clearancePanel.addItem', { defaultValue: 'Add item' })}
                    </Button>
                )}
            </div>

            {/* Progress / empty state */}
            {total > 0 ? (
                <>
                    <div className="px-4 py-2.5 border-b">
                        <Progress value={progress} className="h-1.5" />
                    </div>
                    <ul className="divide-y">
                        {items.map(item => {
                            const done = item.status === 'completed' || item.status === 'waived'
                            return (
                                <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                                    <div className={`size-7 rounded-full flex items-center justify-center shrink-0 ${done ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
                                        {done ? <Check className="size-3.5" /> : <ClockIcon className="size-3.5" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className={`text-sm ${done ? 'line-through text-muted-foreground' : 'font-medium'}`}>
                                            {item.name}
                                        </div>
                                        {item.dueDate && (
                                            <div className="text-[11px] text-muted-foreground">
                                                {t('exit.clearancePanel.due', { defaultValue: 'Due' })} {formatDate(item.dueDate)}
                                            </div>
                                        )}
                                    </div>
                                    <Badge
                                        variant={done ? 'success' : item.status === 'in_progress' ? 'warning' : 'secondary'}
                                        className="text-[10px] capitalize shrink-0"
                                    >
                                        {item.status.replace('_', ' ')}
                                    </Badge>
                                    {!done && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                                upd.mutate({ itemId: item.id, status: 'completed' }, {
                                                    onSuccess: () => toast.success(t('exit.clearancePanel.markedDone', { defaultValue: 'Marked complete' })),
                                                    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
                                                })
                                            }}
                                            disabled={upd.isPending}
                                        >
                                            <Check className="size-3 me-1" />
                                            {t('exit.clearancePanel.markDone', { defaultValue: 'Done' })}
                                        </Button>
                                    )}
                                </li>
                            )
                        })}
                    </ul>
                </>
            ) : (
                <div className="px-6 py-6 text-center">
                    <div className="size-9 rounded-full bg-muted text-muted-foreground flex items-center justify-center mx-auto mb-2">
                        <ListChecks className="size-4" />
                    </div>
                    <p className="text-sm font-medium">
                        {t('exit.clearancePanel.emptyTitle', { defaultValue: 'No clearance items yet' })}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                        {t('exit.clearancePanel.emptyBody', {
                            defaultValue: 'Configure clearance templates once under Org Settings → Offboarding Flow and every new exit will auto-create them. You can also add ad-hoc items for this exit.',
                        })}
                    </p>
                    <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
                        {isHr && (
                            <Button size="sm" variant="outline" asChild>
                                <Link to={ROUTES.organizationSettings} state={{ tab: 'offboarding-flow' }}>
                                    <Settings2 className="size-3.5 me-1" />
                                    {t('exit.clearancePanel.configureTemplates', { defaultValue: 'Configure templates' })}
                                </Link>
                            </Button>
                        )}
                        {isHr && (
                            <Button size="sm" onClick={() => setAddOpen(true)}>
                                <Plus className="size-3.5 me-1" />
                                {t('exit.clearancePanel.addAdHoc', { defaultValue: 'Add ad-hoc item' })}
                            </Button>
                        )}
                    </div>
                </div>
            )}

            <AddItemDialog exitId={exitId} open={addOpen} onOpenChange={setAddOpen} />
        </div>
    )
}

function AddItemDialog({ exitId, open, onOpenChange }: { exitId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
    const { t } = useTranslation()
    const add = useAddClearanceItem(exitId)
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [dueDate, setDueDate] = useState('')

    // State-during-render reset on open
    const [wasOpen, setWasOpen] = useState(false)
    if (open !== wasOpen) {
        setWasOpen(open)
        if (open) { setName(''); setDescription(''); setDueDate('') }
    }

    async function submit(e: { preventDefault(): void }) {
        e.preventDefault()
        if (!name.trim()) {
            toast.error(t('exit.clearancePanel.nameRequired', { defaultValue: 'Please name the clearance item.' }))
            return
        }
        try {
            await add.mutateAsync({
                name: name.trim(),
                description: description.trim() || null,
                dueDate: dueDate || null,
            })
            toast.success(t('exit.clearancePanel.added', { defaultValue: 'Clearance item added.' }))
            onOpenChange(false)
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed')
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('exit.clearancePanel.addTitle', { defaultValue: 'Add clearance item' })}</DialogTitle>
                </DialogHeader>
                <form onSubmit={submit}>
                    <DialogBody className="space-y-3">
                        <div className="space-y-1">
                            <Label className="text-xs">
                                {t('exit.clearancePanel.fieldName', { defaultValue: 'Name' })} <span className="text-rose-500">*</span>
                            </Label>
                            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Return laptop, Hand-over knowledge base" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">{t('exit.clearancePanel.fieldDescription', { defaultValue: 'Description (optional)' })}</Label>
                            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Any context for whoever is completing this…" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">{t('exit.clearancePanel.fieldDueDate', { defaultValue: 'Due date (optional)' })}</Label>
                            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                        </div>
                    </DialogBody>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            {t('common.cancel')}
                        </Button>
                        <Button type="submit" disabled={add.isPending}>
                            {add.isPending ? '…' : t('common.create', { defaultValue: 'Create' })}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
