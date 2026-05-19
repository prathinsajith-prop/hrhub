import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GripVertical, Plus, Pencil, Trash2, RotateCcw, ListOrdered, FileText } from 'lucide-react'
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

import { Card, Badge, Input, NumericInput, Label } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter, ConfirmDialog, toast } from '@/components/ui/overlays'
import { FormField } from '@/components/shared/FormField'
import { cn } from '@/lib/utils'
import {
    useOnboardingTemplateSteps,
    useCreateOnboardingTemplateStep,
    useUpdateOnboardingTemplateStep,
    useDeleteOnboardingTemplateStep,
    useReorderOnboardingTemplateSteps,
    useResetOnboardingTemplate,
    useTemplateStepRequiredDocs,
    useAddTemplateStepRequiredDoc,
    useDeleteTemplateStepRequiredDoc,
    type OnboardingTemplateStep,
} from '@/hooks/useOnboarding'
import { RequiredDocsManager } from '@/components/shared/RequiredDocsManager'

interface StepFormState {
    title: string
    owner: string
    slaDays: string
}

const EMPTY_FORM: StepFormState = { title: '', owner: '', slaDays: '' }

function StepDialog({
    open,
    onOpenChange,
    step,
}: {
    open: boolean
    onOpenChange: (o: boolean) => void
    step: OnboardingTemplateStep | null
}) {
    const { t } = useTranslation()
    const create = useCreateOnboardingTemplateStep()
    const update = useUpdateOnboardingTemplateStep()
    const isEdit = !!step
    const pending = create.isPending || update.isPending

    const [form, setForm] = useState<StepFormState>(EMPTY_FORM)
    const [errors, setErrors] = useState<Partial<StepFormState>>({})
    // State-during-render sync (replaces a useEffect→setState) - when the
    // dialog opens for a different step, reset the form once.
    const targetId = open ? (step?.id ?? '__new__') : null
    const [lastTargetId, setLastTargetId] = useState<string | null>(null)
    if (targetId !== lastTargetId) {
        setLastTargetId(targetId)
        if (open) {
            setErrors({})
            setForm(step
                ? { title: step.title, owner: step.owner ?? '', slaDays: step.slaDays != null ? String(step.slaDays) : '' }
                : EMPTY_FORM)
        }
    }

    async function handleSubmit(e: { preventDefault(): void }) {
        e.preventDefault()
        const title = form.title.trim()
        if (!title) { setErrors({ title: t('orgSettings.onboardingTemplate.errorRequired') }); return }
        const owner = form.owner.trim() || undefined
        const slaDays = form.slaDays.trim() ? Number(form.slaDays) : undefined
        if (slaDays != null && (!Number.isFinite(slaDays) || slaDays < 0)) {
            setErrors({ slaDays: t('orgSettings.onboardingTemplate.errorNonNegative') }); return
        }

        try {
            if (isEdit && step) {
                await update.mutateAsync({
                    stepId: step.id,
                    title,
                    owner: owner ?? null,
                    slaDays: slaDays ?? null,
                })
                toast.success(t('orgSettings.onboardingTemplate.updated'))
            } else {
                await create.mutateAsync({ title, owner, slaDays })
                toast.success(t('orgSettings.onboardingTemplate.added'))
            }
            onOpenChange(false)
        } catch {
            // toast already handled in hook
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle>{isEdit ? t('orgSettings.onboardingTemplate.editStep') : t('orgSettings.onboardingTemplate.newStep')}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <DialogBody className="space-y-4">
                        <FormField label={t('orgSettings.onboardingTemplate.titleLabel')} required error={errors.title}>
                            <Input
                                value={form.title}
                                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                                placeholder={t('orgSettings.onboardingTemplate.titlePlaceholder')}
                            />
                        </FormField>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>{t('orgSettings.onboardingTemplate.owner')}</Label>
                                <Input
                                    value={form.owner}
                                    onChange={e => setForm(f => ({ ...f, owner: e.target.value }))}
                                    placeholder={t('orgSettings.onboardingTemplate.ownerPlaceholder')}
                                    maxLength={100}
                                />
                            </div>
                            <FormField label={t('orgSettings.onboardingTemplate.slaDays')} error={errors.slaDays}>
                                <NumericInput
                                    value={form.slaDays}
                                    onChange={e => setForm(f => ({ ...f, slaDays: e.target.value }))}
                                    maxDecimals={0}
                                    placeholder={t('orgSettings.onboardingTemplate.slaPlaceholder')}
                                />
                            </FormField>
                        </div>
                    </DialogBody>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
                        <Button type="submit" disabled={pending}>
                            {pending ? t('orgSettings.onboardingTemplate.saving') : isEdit ? t('orgSettings.onboardingTemplate.saveChanges') : t('orgSettings.onboardingTemplate.addStep')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

interface SortableRowProps {
    step: OnboardingTemplateStep
    index: number
    onEdit: () => void
    onDelete: () => void
    onRequiredDocs: () => void
}

function SortableRow({ step, index, onEdit, onDelete, onRequiredDocs }: SortableRowProps) {
    const { t } = useTranslation()
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id })

    return (
        <div
            ref={setNodeRef}
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
            }}
            className={cn(
                'group flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-card',
                isDragging && 'shadow-lg ring-2 ring-primary/30 z-10 relative',
            )}
        >
            <button
                type="button"
                aria-label={t('orgSettings.onboardingTemplate.dragLabel')}
                className="touch-none p-1 -m-1 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
                {...attributes}
                {...listeners}
            >
                <GripVertical className="size-4" />
            </button>
            <span className="font-mono text-xs text-muted-foreground w-6 text-center">{index + 1}</span>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{step.title}</p>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                    {step.owner && <Badge variant="secondary" className="font-normal h-4 px-1.5 text-[10px]">{step.owner}</Badge>}
                    {step.slaDays != null && <span>{t('orgSettings.onboardingTemplate.slaPrefix', { days: step.slaDays })}</span>}
                </div>
            </div>
            <button
                type="button"
                onClick={onRequiredDocs}
                className={cn(
                    'flex items-center gap-1.5 px-2 h-6 rounded-full border text-[10px] font-medium transition-colors shrink-0',
                    step.requiredDocsCount > 0
                        ? 'bg-primary/5 border-primary/20 text-primary hover:bg-primary/10'
                        : 'bg-muted/40 border-border text-muted-foreground hover:bg-muted',
                )}
                aria-label={t('orgSettings.onboardingTemplate.requiredDocsLabel')}
                title={t('orgSettings.onboardingTemplate.requiredDocsLabel')}
            >
                <FileText className="size-3" />
                {step.requiredDocsCount} {step.requiredDocsCount === 1 ? 'doc' : 'docs'}
            </button>
            <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <Button type="button" variant="ghost" size="icon" className="size-7" onClick={onEdit} aria-label={t('orgSettings.onboardingTemplate.editLabel')}>
                    <Pencil className="size-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive" onClick={onDelete} aria-label={t('orgSettings.onboardingTemplate.deleteLabel')}>
                    <Trash2 className="size-3.5" />
                </Button>
            </div>
        </div>
    )
}

function TemplateRequiredDocsDialog({ step, onClose }: { step: OnboardingTemplateStep | null; onClose: () => void }) {
    const open = !!step
    const { data: requiredDocs = [], isLoading } = useTemplateStepRequiredDocs(open ? step!.id : null)
    const addDoc = useAddTemplateStepRequiredDoc()
    const deleteDoc = useDeleteTemplateStepRequiredDoc()
    if (!step) return null

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Required documents - {step.title}</DialogTitle>
                </DialogHeader>
                <DialogBody className="space-y-4">
                    <p className="text-xs text-muted-foreground">
                        Configure the documents copied into every new employee's checklist for this step.
                        Existing checklists are unaffected; edits apply to future onboardings only.
                    </p>
                    <RequiredDocsManager
                        requiredDocs={requiredDocs}
                        isLoading={isLoading}
                        isAdding={addDoc.isPending}
                        isDeleting={deleteDoc.isPending}
                        onAdd={(input) => addDoc.mutateAsync({ templateStepId: step.id, ...input }).then(() => undefined)}
                        onDelete={(id) => deleteDoc.mutateAsync(id).then(() => undefined)}
                    />
                </DialogBody>
                <DialogFooter>
                    <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

const EMPTY_STEPS: OnboardingTemplateStep[] = []

export function OnboardingTemplateTab() {
    const { t } = useTranslation()
    const { data, isLoading } = useOnboardingTemplateSteps()
    // Stable empty-array fallback so the state-during-render sync below only
    // fires when the server reference actually changes.
    const serverSteps = data ?? EMPTY_STEPS
    const reorder = useReorderOnboardingTemplateSteps()
    const remove = useDeleteOnboardingTemplateStep()
    const reset = useResetOnboardingTemplate()

    // Local mirror so drag is instant; the server list reconciles on success.
    // State-during-render sync (replaces a useEffect→setState) - only fires
    // when the server reference actually changes, not on every render.
    const [lastSynced, setLastSynced] = useState<OnboardingTemplateStep[]>(EMPTY_STEPS)
    const [localSteps, setLocalSteps] = useState<OnboardingTemplateStep[]>(EMPTY_STEPS)
    if (serverSteps !== lastSynced) {
        setLastSynced(serverSteps)
        setLocalSteps(serverSteps)
    }

    const stepIds = useMemo(() => localSteps.map(s => s.id), [localSteps])

    const [dialogOpen, setDialogOpen] = useState(false)
    const [editingStep, setEditingStep] = useState<OnboardingTemplateStep | null>(null)
    const [pendingDelete, setPendingDelete] = useState<OnboardingTemplateStep | null>(null)
    const [docsStep, setDocsStep] = useState<OnboardingTemplateStep | null>(null)
    const [resetConfirmOpen, setResetConfirmOpen] = useState(false)

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    )

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event
        if (!over || active.id === over.id) return
        const oldIndex = localSteps.findIndex(s => s.id === active.id)
        const newIndex = localSteps.findIndex(s => s.id === over.id)
        if (oldIndex < 0 || newIndex < 0) return
        const next = arrayMove(localSteps, oldIndex, newIndex)
        setLocalSteps(next)
        reorder.mutate(next.map(s => s.id))
    }

    function openCreate() {
        setEditingStep(null)
        setDialogOpen(true)
    }
    function openEdit(step: OnboardingTemplateStep) {
        setEditingStep(step)
        setDialogOpen(true)
    }
    async function confirmDelete() {
        if (!pendingDelete) return
        try {
            await remove.mutateAsync(pendingDelete.id)
            toast.success(t('orgSettings.onboardingTemplate.deleted'))
        } catch {
            // hook toast handled
        } finally {
            setPendingDelete(null)
        }
    }
    async function confirmReset() {
        try {
            await reset.mutateAsync()
            toast.success(t('orgSettings.onboardingTemplate.resetSuccess'))
        } catch {
            // hook toast handled
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
                            <ListOrdered className="size-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-base font-semibold">{t('orgSettings.onboardingTemplate.title')}</h2>
                            <p className="text-xs text-muted-foreground mt-0.5 max-w-prose">
                                {t('orgSettings.onboardingTemplate.description')}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            leftIcon={<RotateCcw className="size-3.5" />}
                            onClick={() => setResetConfirmOpen(true)}
                            disabled={reset.isPending || isLoading}
                        >
                            {t('orgSettings.onboardingTemplate.reset')}
                        </Button>
                        <Button type="button" size="sm" leftIcon={<Plus className="size-3.5" />} onClick={openCreate}>
                            {t('orgSettings.onboardingTemplate.addStep')}
                        </Button>
                    </div>
                </div>

                {isLoading ? (
                    <div className="space-y-2">
                        {[0, 1, 2, 3].map(i => <Skeleton key={`skeleton-${i}`} className="h-12 rounded-lg" />)}
                    </div>
                ) : localSteps.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                        <ListOrdered className="size-10 text-muted-foreground/40 mb-3" />
                        <p className="text-sm font-medium">{t('orgSettings.onboardingTemplate.noSteps')}</p>
                        <p className="text-xs text-muted-foreground mt-1">{t('orgSettings.onboardingTemplate.noStepsHint')}</p>
                        <Button type="button" size="sm" className="mt-3" onClick={openCreate}>{t('orgSettings.onboardingTemplate.addFirstStep')}</Button>
                    </div>
                ) : (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
                    >
                        <SortableContext items={stepIds} strategy={verticalListSortingStrategy}>
                            <div className="space-y-2">
                                {localSteps.map((step, i) => (
                                    <SortableRow
                                        key={step.id}
                                        step={step}
                                        index={i}
                                        onEdit={() => openEdit(step)}
                                        onDelete={() => setPendingDelete(step)}
                                        onRequiredDocs={() => setDocsStep(step)}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                )}
            </Card>

            <StepDialog open={dialogOpen} onOpenChange={setDialogOpen} step={editingStep} />

            <TemplateRequiredDocsDialog step={docsStep} onClose={() => setDocsStep(null)} />

            <ConfirmDialog
                open={!!pendingDelete}
                onOpenChange={(o) => !o && setPendingDelete(null)}
                title={t('orgSettings.onboardingTemplate.deleteTitle')}
                description={pendingDelete ? t('orgSettings.onboardingTemplate.deleteDesc', { title: pendingDelete.title }) : ''}
                confirmLabel={t('common.delete')}
                variant="destructive"
                onConfirm={confirmDelete}
            />

            <ConfirmDialog
                open={resetConfirmOpen}
                onOpenChange={setResetConfirmOpen}
                title={t('orgSettings.onboardingTemplate.resetTitle')}
                description={t('orgSettings.onboardingTemplate.resetDesc')}
                confirmLabel={t('orgSettings.onboardingTemplate.reset')}
                variant="warning"
                onConfirm={confirmReset}
            />
        </div>
    )
}
