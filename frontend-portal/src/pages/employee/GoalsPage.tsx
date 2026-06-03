import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Target, Pencil, Trash2, CheckCircle2, Loader2, CalendarDays } from 'lucide-react'
import { toast } from 'sonner'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
} from '@/components/ui/select'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { cn, formatDate } from '@/lib/utils'
import {
    useGoals,
    useCreateGoal,
    useUpdateGoal,
    useDeleteGoal,
    type Goal,
} from '@/hooks/useGoals'

/**
 * Personal goals — SMART / OKR-style items the employee sets for
 * themselves (distinct from HR-driven performance reviews). Full CRUD
 * against the portal `/goals` API: create, edit, slide progress 0-100
 * (100% auto-completes), and soft-delete behind a confirm dialog.
 */

const CATEGORY_OPTIONS = ['professional', 'personal', 'okr', 'learning'] as const

const STATUS_TONE: Record<Goal['status'], string> = {
    active: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900/60',
    completed: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60',
    archived: 'bg-muted text-muted-foreground ring-1 ring-border',
}

export function EmployeeGoalsPage() {
    const { t } = useTranslation()
    const { data: goals, isLoading } = useGoals()
    const createGoal = useCreateGoal()
    const updateGoal = useUpdateGoal()
    const deleteGoal = useDeleteGoal()

    const [editing, setEditing] = useState<Goal | null>(null)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [deleteTarget, setDeleteTarget] = useState<Goal | null>(null)

    const list = goals ?? []

    function openCreate() {
        setEditing(null)
        setDialogOpen(true)
    }
    function openEdit(g: Goal) {
        setEditing(g)
        setDialogOpen(true)
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={t('goals.title')}
                subtitle={t('goals.subtitle')}
                action={
                    <Button onClick={openCreate}>
                        <Plus className="size-4" />
                        {t('goals.createGoal')}
                    </Button>
                }
            />

            {isLoading ? (
                <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-28 w-full rounded-xl" />
                    ))}
                </div>
            ) : list.length === 0 ? (
                <EmptyState
                    icon={<Target className="size-8" />}
                    title={t('goals.emptyTitle')}
                    description={t('goals.emptyDesc')}
                    action={
                        <Button variant="outline" onClick={openCreate}>
                            <Plus className="size-4" />
                            {t('goals.createFirst')}
                        </Button>
                    }
                />
            ) : (
                <div className="space-y-3">
                    {list.map((g) => (
                        <GoalCard
                            key={g.id}
                            goal={g}
                            onEdit={() => openEdit(g)}
                            onDelete={() => setDeleteTarget(g)}
                            onProgress={(progress) =>
                                updateGoal.mutate(
                                    { id: g.id, progress },
                                    { onError: (e) => toast.error((e as Error)?.message ?? t('goals.updateFailed', { defaultValue: 'Could not update goal' })) },
                                )
                            }
                            savingProgress={updateGoal.isPending}
                        />
                    ))}
                </div>
            )}

            <GoalDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                goal={editing}
                saving={createGoal.isPending || updateGoal.isPending}
                onSubmit={(values) => {
                    const onError = (e: unknown) =>
                        toast.error((e as Error)?.message ?? t('goals.saveFailed', { defaultValue: 'Could not save goal' }))
                    if (editing) {
                        updateGoal.mutate({ id: editing.id, ...values }, {
                            onSuccess: () => { toast.success(t('goals.updated', { defaultValue: 'Goal updated' })); setDialogOpen(false) },
                            onError,
                        })
                    } else {
                        createGoal.mutate(values, {
                            onSuccess: () => { toast.success(t('goals.created', { defaultValue: 'Goal created' })); setDialogOpen(false) },
                            onError,
                        })
                    }
                }}
            />

            <ConfirmDialog
                open={!!deleteTarget}
                onOpenChange={(v) => { if (!v) setDeleteTarget(null) }}
                title={t('goals.deleteTitle', { defaultValue: 'Delete this goal?' })}
                description={deleteTarget ? t('goals.deleteDesc', { defaultValue: `"${deleteTarget.title}" will be removed from your goals.` }) : ''}
                confirmLabel={t('common.delete', { defaultValue: 'Delete' })}
                cancelLabel={t('common.cancel', { defaultValue: 'Cancel' })}
                loading={deleteGoal.isPending}
                onConfirm={() => {
                    if (!deleteTarget) return
                    deleteGoal.mutate(deleteTarget.id, {
                        onSuccess: () => { toast.success(t('goals.deleted', { defaultValue: 'Goal deleted' })); setDeleteTarget(null) },
                        onError: (e) => toast.error((e as Error)?.message ?? t('goals.deleteFailed', { defaultValue: 'Could not delete goal' })),
                    })
                }}
            />
        </div>
    )
}

function GoalCard({
    goal,
    onEdit,
    onDelete,
    onProgress,
    savingProgress,
}: {
    goal: Goal
    onEdit: () => void
    onDelete: () => void
    onProgress: (progress: number) => void
    savingProgress: boolean
}) {
    const { t } = useTranslation()
    const isDone = goal.status === 'completed'

    return (
        <Card className="border-border/70 transition-colors hover:border-primary/30">
            <CardContent className="space-y-3 p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h3 className={cn('font-medium', isDone && 'text-muted-foreground line-through')}>{goal.title}</h3>
                            <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide', STATUS_TONE[goal.status])}>
                                {t(`goals.status.${goal.status}`, { defaultValue: goal.status })}
                            </span>
                        </div>
                        {goal.description ? (
                            <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{goal.description}</p>
                        ) : null}
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>{t(`goals.category.${goal.category}`, { defaultValue: goal.category })}</span>
                            {goal.targetDate ? (
                                <span className="inline-flex items-center gap-1">
                                    <CalendarDays className="size-3" />
                                    {t('goals.dueBy', { defaultValue: 'Due' })} {formatDate(goal.targetDate)}
                                </span>
                            ) : null}
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        <Button size="icon" variant="ghost" className="size-8" aria-label={t('common.edit', { defaultValue: 'Edit' }) as string} title={t('common.edit', { defaultValue: 'Edit' }) as string} onClick={onEdit}>
                            <Pencil className="size-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="size-8 text-destructive hover:text-destructive" aria-label={t('common.delete', { defaultValue: 'Delete' }) as string} title={t('common.delete', { defaultValue: 'Delete' }) as string} onClick={onDelete}>
                            <Trash2 className="size-3.5" />
                        </Button>
                    </div>
                </div>

                {/* Progress: bar + a native range slider. 100% auto-completes
                    server-side; the bar turns emerald once done. */}
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-medium">
                        <span className="text-muted-foreground">{t('goals.progress', { defaultValue: 'Progress' })}</span>
                        <span className="tabular-nums inline-flex items-center gap-1">
                            {savingProgress ? <Loader2 className="size-3 animate-spin" /> : isDone ? <CheckCircle2 className="size-3 text-emerald-600" /> : null}
                            {goal.progress}%
                        </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                            className={cn('h-full rounded-full transition-all', isDone ? 'bg-emerald-500' : 'bg-primary')}
                            style={{ width: `${goal.progress}%` }}
                        />
                    </div>
                    <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={goal.progress}
                        onChange={(e) => onProgress(Number(e.target.value))}
                        aria-label={t('goals.progress', { defaultValue: 'Progress' }) as string}
                        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    />
                </div>
            </CardContent>
        </Card>
    )
}

interface GoalFormValues {
    title: string
    description: string | null
    category: string
    targetDate: string | null
    progress: number
}

function GoalDialog({
    open,
    onOpenChange,
    goal,
    saving,
    onSubmit,
}: {
    open: boolean
    onOpenChange: (v: boolean) => void
    goal: Goal | null
    saving: boolean
    onSubmit: (values: GoalFormValues) => void
}) {
    const { t } = useTranslation()

    // Reset the draft whenever the target (or open) changes — state-during-
    // render keyed on a sentinel, no effect needed.
    const sentinel = `${open}:${goal?.id ?? 'new'}`
    const [synced, setSynced] = useState('')
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [category, setCategory] = useState<string>('professional')
    const [targetDate, setTargetDate] = useState('')
    const [progress, setProgress] = useState(0)
    if (sentinel !== synced) {
        setSynced(sentinel)
        setTitle(goal?.title ?? '')
        setDescription(goal?.description ?? '')
        setCategory(goal?.category ?? 'professional')
        setTargetDate(goal?.targetDate ?? '')
        setProgress(goal?.progress ?? 0)
    }

    const canSave = title.trim().length > 0 && !saving

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        {goal ? t('goals.editGoal', { defaultValue: 'Edit goal' }) : t('goals.createGoal')}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-1">
                    <div className="space-y-1.5">
                        <Label htmlFor="goal-title">{t('goals.fieldTitle', { defaultValue: 'Title' })}</Label>
                        <Input
                            id="goal-title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            maxLength={200}
                            placeholder={t('goals.titlePlaceholder', { defaultValue: 'e.g. Complete advanced Excel training' }) as string}
                            autoFocus
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="goal-desc">{t('goals.fieldDescription', { defaultValue: 'Description' })}</Label>
                        <Textarea
                            id="goal-desc"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={3}
                            maxLength={2000}
                            placeholder={t('goals.descPlaceholder', { defaultValue: 'What does success look like?' }) as string}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="goal-category">{t('goals.fieldCategory', { defaultValue: 'Category' })}</Label>
                            <Select value={category} onValueChange={setCategory}>
                                <SelectTrigger id="goal-category">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {CATEGORY_OPTIONS.map((c) => (
                                        <SelectItem key={c} value={c}>{t(`goals.category.${c}`, { defaultValue: c })}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="goal-target">{t('goals.fieldTargetDate', { defaultValue: 'Target date' })}</Label>
                            <Input
                                id="goal-target"
                                type="date"
                                value={targetDate}
                                onChange={(e) => setTargetDate(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="goal-progress">
                            {t('goals.progress', { defaultValue: 'Progress' })} · <span className="tabular-nums">{progress}%</span>
                        </Label>
                        <input
                            id="goal-progress"
                            type="range"
                            min={0}
                            max={100}
                            step={5}
                            value={progress}
                            onChange={(e) => setProgress(Number(e.target.value))}
                            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                        {t('common.cancel', { defaultValue: 'Cancel' })}
                    </Button>
                    <Button
                        disabled={!canSave}
                        loading={saving}
                        onClick={() =>
                            onSubmit({
                                title: title.trim(),
                                description: description.trim() || null,
                                category,
                                targetDate: targetDate || null,
                                progress,
                            })
                        }
                    >
                        {goal ? t('common.save', { defaultValue: 'Save' }) : t('goals.createGoal')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
