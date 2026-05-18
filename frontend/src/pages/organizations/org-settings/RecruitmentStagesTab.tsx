import { useMemo, useState } from 'react'
import { GripVertical, Pencil, Plus, RotateCcw, Trash2, Workflow, Check, Eye, EyeOff, Flag, Goal } from 'lucide-react'
import {
    DndContext,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers'
import {
    SortableContext,
    arrayMove,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { Card, Input, Label } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogBody,
    DialogFooter,
    ConfirmDialog,
    toast,
} from '@/components/ui/overlays'
import { cn } from '@/lib/utils'
import {
    useRecruitmentStages,
    useCreateRecruitmentStage,
    useUpdateRecruitmentStage,
    useDeleteRecruitmentStage,
    useReorderRecruitmentStages,
    useResetRecruitmentStages,
} from '@/hooks/useRecruitment'
import { STAGE_PALETTE, STAGE_PALETTE_KEYS, resolveStageColor, type RecruitmentStage } from '@/lib/recruitmentStages'

/**
 * Organization Settings → Recruitment Stages.
 *
 * Lets admins rename stages, pick a colour from the shared palette, and
 * reorder the pipeline. Stage keys are system-controlled (they map to the
 * `candidate.stage` enum on the backend) and intentionally not editable.
 * Terminal stages (rejected) are still displayed here so the admin can re-
 * theme them; they're filtered out of the kanban by the renderer.
 */

interface SortableRowProps {
    stage: RecruitmentStage
    onEdit: () => void
    onDelete: () => void
    onSetFirst: () => void
    onSetFinal: () => void
    onToggleKanban: () => void
    isUpdating: boolean
}

function SortableRow({ stage, onEdit, onDelete, onSetFirst, onSetFinal, onToggleKanban, isUpdating }: SortableRowProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id })
    const color = resolveStageColor(stage.colorKey)

    return (
        <div
            ref={setNodeRef}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            className={cn(
                'group flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-card',
                isDragging && 'shadow-lg ring-2 ring-primary/30 z-10 relative',
                stage.isFirst && 'ring-1 ring-success/40',
                stage.isFinal && 'ring-1 ring-destructive/40',
            )}
        >
            <button
                type="button"
                aria-label="Reorder stage"
                className="touch-none p-1 -m-1 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
                {...attributes}
                {...listeners}
            >
                <GripVertical className="h-4 w-4" />
            </button>
            <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', color.dotClass)} aria-hidden="true" />
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate">{stage.label}</p>
                    <Badge variant="outline" className="font-mono h-4 px-1.5 text-[10px] text-muted-foreground">
                        {stage.stageKey}
                    </Badge>
                    {stage.isFirst && (
                        <Badge variant="outline" className="h-4 px-1.5 text-[10px] text-success border-success/30">First</Badge>
                    )}
                    {stage.isFinal && (
                        <Badge variant="outline" className="h-4 px-1.5 text-[10px] text-destructive border-destructive/30">Final</Badge>
                    )}
                    {!stage.showInKanban && (
                        <Badge variant="outline" className="h-4 px-1.5 text-[10px] text-muted-foreground">Hidden</Badge>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
                <Button
                    type="button"
                    variant={stage.isFirst ? 'secondary' : 'ghost'}
                    size="icon"
                    className={cn('h-7 w-7', stage.isFirst && 'text-success')}
                    onClick={onSetFirst}
                    disabled={isUpdating || stage.isFirst}
                    aria-label="Mark as first stage"
                    title="Mark as first stage"
                >
                    <Flag className="h-3.5 w-3.5" />
                </Button>
                <Button
                    type="button"
                    variant={stage.isFinal ? 'secondary' : 'ghost'}
                    size="icon"
                    className={cn('h-7 w-7', stage.isFinal && 'text-destructive')}
                    onClick={onSetFinal}
                    disabled={isUpdating || stage.isFinal}
                    aria-label="Mark as final stage"
                    title="Mark as final stage"
                >
                    <Goal className="h-3.5 w-3.5" />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn('h-7 w-7', !stage.showInKanban && 'text-muted-foreground/60')}
                    onClick={onToggleKanban}
                    disabled={isUpdating}
                    aria-label={stage.showInKanban ? 'Hide from kanban' : 'Show on kanban'}
                    title={stage.showInKanban ? 'Hide from kanban' : 'Show on kanban'}
                >
                    {stage.showInKanban ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit} aria-label="Edit stage">
                    <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete} aria-label="Delete stage">
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </div>
        </div>
    )
}

/**
 * Combined create / edit dialog. When `mode === 'create'` it shows an "Add
 * stage" header and creates a new row; when `mode === 'edit'` the stage's
 * current label and colour pre-fill the form. Internally uses the state-
 * during-render pattern (a `lastStageId` watch variable) to sync external
 * state into local form fields without an extra effect-driven render.
 */
function StageDialog({
    mode,
    stage,
    onClose,
}: {
    mode: 'create' | 'edit' | null
    stage: RecruitmentStage | null
    onClose: () => void
}) {
    const create = useCreateRecruitmentStage()
    const update = useUpdateRecruitmentStage()
    const isEdit = mode === 'edit'

    const [label, setLabel] = useState('')
    const [colorKey, setColorKey] = useState('slate')
    // Watch variable for state-during-render sync. Compared against the
    // current target id; on change we reset local form state in render.
    const targetId = isEdit ? (stage?.id ?? null) : (mode === 'create' ? '__new__' : null)
    const [lastTargetId, setLastTargetId] = useState<string | null>(null)
    if (targetId !== lastTargetId) {
        setLastTargetId(targetId)
        if (isEdit && stage) {
            setLabel(stage.label)
            setColorKey(stage.colorKey)
        } else if (mode === 'create') {
            setLabel('')
            setColorKey('slate')
        }
    }

    if (!mode) return null

    const trimmed = label.trim()
    const dirty = isEdit
        ? (stage ? trimmed !== stage.label || colorKey !== stage.colorKey : false)
        : trimmed.length > 0
    const pending = create.isPending || update.isPending
    const canSave = trimmed.length > 0 && dirty && !pending

    async function handleSave() {
        try {
            if (isEdit && stage) {
                await update.mutateAsync({ stageId: stage.id, label: trimmed, colorKey })
                toast.success('Stage updated', `${trimmed} saved.`)
            } else if (mode === 'create') {
                await create.mutateAsync({ label: trimmed, colorKey })
                toast.success('Stage added', `${trimmed} added to the pipeline.`)
            }
            onClose()
        } catch {
            // toast handled by hook
        }
    }

    const previewColor = STAGE_PALETTE[colorKey] ?? STAGE_PALETTE.slate
    const previewLabel = trimmed || (isEdit ? stage?.label ?? 'Stage' : 'New stage')

    return (
        <Dialog open={mode != null} onOpenChange={(o) => { if (!o) onClose() }}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>{isEdit ? 'Edit stage' : 'Add stage'}</DialogTitle>
                    {isEdit && stage ? (
                        <p className="text-xs text-muted-foreground font-mono">{stage.stageKey}</p>
                    ) : (
                        <p className="text-xs text-muted-foreground">A stable key is generated from the label.</p>
                    )}
                </DialogHeader>

                <DialogBody className="space-y-5">
                    <div className="space-y-1.5">
                        <Label>Label</Label>
                        <Input
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            maxLength={100}
                            autoFocus
                            placeholder="e.g. Reference check"
                            onKeyDown={(e) => { if (e.key === 'Enter' && canSave) { e.preventDefault(); handleSave() } }}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                            <Label>Colour</Label>
                            <span
                                className={cn(
                                    'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border max-w-[55%]',
                                    previewColor.badgeClass,
                                )}
                            >
                                <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', previewColor.dotClass)} />
                                <span className="truncate">{previewLabel}</span>
                            </span>
                        </div>
                        <div className="grid grid-cols-10 gap-2 max-h-32 overflow-y-auto pr-1">
                            {STAGE_PALETTE_KEYS.map(key => {
                                const c = STAGE_PALETTE[key]
                                const selected = key === colorKey
                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => setColorKey(key)}
                                        aria-label={c.label}
                                        aria-pressed={selected}
                                        title={c.label}
                                        className={cn(
                                            'h-8 w-8 rounded-full flex items-center justify-center transition-all',
                                            c.swatchClass,
                                            selected
                                                ? 'ring-2 ring-offset-2 ring-offset-background ring-foreground'
                                                : 'opacity-80 hover:opacity-100 hover:scale-110',
                                        )}
                                    >
                                        {selected && <Check className="h-4 w-4 text-white" />}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                </DialogBody>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
                    <Button type="button" onClick={handleSave} disabled={!canSave} loading={pending}>
                        {isEdit ? 'Save changes' : 'Add stage'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

const EMPTY: RecruitmentStage[] = []

export function RecruitmentStagesTab() {
    const { data, isLoading } = useRecruitmentStages()
    const serverStages = data ?? EMPTY
    const reorder = useReorderRecruitmentStages()
    const remove = useDeleteRecruitmentStage()
    const reset = useResetRecruitmentStages()

    // Local mirror so drag is instant; the server list reconciles on success.
    // Synced from the server using the state-during-render pattern (avoids the
    // extra render that a useEffect-driven setState would cost). We track the
    // last-synced reference so the sync only fires when the server data
    // actually changes, not on every render.
    const [lastSynced, setLastSynced] = useState<RecruitmentStage[]>(EMPTY)
    const [localStages, setLocalStages] = useState<RecruitmentStage[]>(EMPTY)
    if (serverStages !== lastSynced) {
        setLastSynced(serverStages)
        setLocalStages(serverStages)
    }

    const stageIds = useMemo(() => localStages.map(s => s.id), [localStages])

    const [dialogMode, setDialogMode] = useState<'create' | 'edit' | null>(null)
    const [editingStage, setEditingStage] = useState<RecruitmentStage | null>(null)
    const [pendingDelete, setPendingDelete] = useState<RecruitmentStage | null>(null)
    const [resetConfirmOpen, setResetConfirmOpen] = useState(false)

    // Inline-action mutation for the per-row first/final/kanban toggles. Distinct
    // from the StageDialog's update mutation so its pending state doesn't disable
    // the dialog's Save button mid-edit.
    const flagMutation = useUpdateRecruitmentStage()

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    )

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event
        if (!over || active.id === over.id) return
        const oldIndex = localStages.findIndex(s => s.id === active.id)
        const newIndex = localStages.findIndex(s => s.id === over.id)
        if (oldIndex < 0 || newIndex < 0) return
        const next = arrayMove(localStages, oldIndex, newIndex)
        setLocalStages(next)
        reorder.mutate(next.map(s => s.id))
    }

    function openCreate() {
        setEditingStage(null)
        setDialogMode('create')
    }
    function openEdit(stage: RecruitmentStage) {
        setEditingStage(stage)
        setDialogMode('edit')
    }
    function closeDialog() {
        setDialogMode(null)
        setEditingStage(null)
    }
    async function confirmDelete() {
        if (!pendingDelete) return
        try {
            await remove.mutateAsync(pendingDelete.id)
            toast.success('Stage deleted', `${pendingDelete.label} removed from the pipeline.`)
            setPendingDelete(null)
        } catch (err: unknown) {
            // Surface the 409 candidate-count message verbatim — it's actionable.
            const msg = (err as { message?: string })?.message ?? 'Could not delete the stage.'
            toast.error('Delete blocked', msg)
        }
    }
    async function confirmReset() {
        try {
            await reset.mutateAsync()
            toast.success('Stages reset', 'Pipeline restored to system defaults.')
        } catch {
            // toast handled by hook
        } finally {
            setResetConfirmOpen(false)
        }
    }

    return (
        <div className="space-y-4">
            <Card className="p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                    <div className="flex items-start gap-3 min-w-0">
                        <div className="rounded-lg bg-primary/10 p-2 shrink-0">
                            <Workflow className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-base font-semibold">Recruitment stages</h2>
                            <p className="text-xs text-muted-foreground mt-0.5 max-w-prose">
                                Rename and recolour the stages that appear on the recruitment kanban board.
                                Drag to reorder. Stage keys are system-controlled and cannot be added or removed.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
                            onClick={() => setResetConfirmOpen(true)}
                            disabled={reset.isPending || isLoading}
                        >
                            Reset
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            leftIcon={<Plus className="h-3.5 w-3.5" />}
                            onClick={openCreate}
                        >
                            Add stage
                        </Button>
                    </div>
                </div>

                {isLoading ? (
                    <div className="space-y-2">
                        {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}
                    </div>
                ) : localStages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                        <Workflow className="h-10 w-10 text-muted-foreground/40 mb-3" />
                        <p className="text-sm font-medium">No stages yet</p>
                        <p className="text-xs text-muted-foreground mt-1">Add a stage to get started, or reset to system defaults.</p>
                        <Button type="button" size="sm" className="mt-3" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={openCreate}>
                            Add your first stage
                        </Button>
                    </div>
                ) : (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
                    >
                        <SortableContext items={stageIds} strategy={verticalListSortingStrategy}>
                            <div className="space-y-2">
                                {localStages.map(stage => (
                                    <SortableRow
                                        key={stage.id}
                                        stage={stage}
                                        onEdit={() => openEdit(stage)}
                                        onDelete={() => setPendingDelete(stage)}
                                        onSetFirst={() => flagMutation.mutate({ stageId: stage.id, isFirst: true })}
                                        onSetFinal={() => flagMutation.mutate({ stageId: stage.id, isFinal: true })}
                                        onToggleKanban={() => flagMutation.mutate({ stageId: stage.id, showInKanban: !stage.showInKanban })}
                                        isUpdating={flagMutation.isPending}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                )}
            </Card>

            <StageDialog mode={dialogMode} stage={editingStage} onClose={closeDialog} />

            <ConfirmDialog
                open={!!pendingDelete}
                onOpenChange={(o) => !o && setPendingDelete(null)}
                title={pendingDelete ? `Delete "${pendingDelete.label}"?` : ''}
                description="This removes the stage from the pipeline. If any candidates are still on this stage, you'll need to move them to another stage first."
                confirmLabel="Delete stage"
                variant="destructive"
                onConfirm={confirmDelete}
            />

            <ConfirmDialog
                open={resetConfirmOpen}
                onOpenChange={setResetConfirmOpen}
                title="Reset recruitment stages?"
                description="This restores all stages to their system defaults — labels, colours, and order. Your custom names will be lost."
                confirmLabel="Reset"
                variant="warning"
                onConfirm={confirmReset}
            />
        </div>
    )
}
