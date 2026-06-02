// ─── Offboarding Flow tab ────────────────────────────────────────────────────
// Mirrors Zoho People's Offboarding Settings — 5-step vertical stepper:
//   1. Preferences      (notice period + HR partners + approval)
//   2. Clearances       (clearance form catalog)
//   3. Exit Interview   (intro + questions + thank-you)
//   4. Documents        (letters to issue at exit)
//   5. Workflows        (trigger → email / notification config)
//
// Each step is a self-contained card; the left rail just toggles which one is
// visible. We deliberately don't lock progression — admins can jump between
// steps freely.

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Settings2,
    ListChecks,
    MessageSquare,
    FileText,
    Workflow,
    Plus,
    Pencil,
    Trash2,
    Check,
    GripVertical,
} from 'lucide-react'
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
import DOMPurify from 'dompurify'

import {
    Badge,
    Input,
    NumericInput,
    Label,
    Textarea,
    Switch,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Checkbox,
} from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
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
    useOffboardingSettings,
    useUpdateOffboardingSettings,
    useClearanceTemplates,
    useCreateClearance,
    useUpdateClearance,
    useDeleteClearance,
    useInterviewQuestions,
    useCreateInterviewQuestion,
    useUpdateInterviewQuestion,
    useDeleteInterviewQuestion,
    useReorderInterviewQuestions,
    useExitDocuments,
    useCreateExitDocument,
    useUpdateExitDocument,
    useDeleteExitDocument,
    useOffboardingWorkflows,
    useCreateWorkflow,
    useUpdateWorkflow,
    useDeleteWorkflow,
    type ClearanceTemplate,
    type InterviewQuestion,
    type ExitDocumentItem,
    type OffboardingWorkflow,
    type OwnerType,
    type QuestionType,
    type WorkflowTrigger,
    type WorkflowActionType,
    type Recipient,
} from '@/hooks/useOffboardingFlow'
import { useTenantUsers } from '@/hooks/useSettings'
import { UserSelect } from '@/components/shared/UserSelect'

// ─── Step navigation rail ───────────────────────────────────────────────────
//
// Vertical stepper with connector lines between numbered nodes (the visual
// Zoho uses). Each step also surfaces a live status — "Configured", item
// count, or "Empty" — so admins see at a glance what still needs attention.

type StepKey = 'preferences' | 'clearances' | 'interview' | 'documents' | 'workflows'

const STEPS: { key: StepKey; icon: React.ElementType; i18nKey: string }[] = [
    { key: 'preferences', icon: Settings2, i18nKey: 'preferences' },
    { key: 'clearances', icon: ListChecks, i18nKey: 'clearances' },
    { key: 'interview', icon: MessageSquare, i18nKey: 'interview' },
    { key: 'documents', icon: FileText, i18nKey: 'documents' },
    { key: 'workflows', icon: Workflow, i18nKey: 'workflows' },
]

export function OffboardingFlowTab() {
    const [step, setStep] = useState<StepKey>('preferences')

    // Pre-fetch all five resources up here so the stepper rail can show
    // accurate status badges without forcing each step component to mount
    // first. TanStack Query dedupes — opening a step costs no extra fetch.
    const settingsQ = useOffboardingSettings()
    const clearancesQ = useClearanceTemplates()
    const questionsQ = useInterviewQuestions()
    const documentsQ = useExitDocuments()
    const workflowsQ = useOffboardingWorkflows()

    const statuses: Record<StepKey, { count: number | null; label: 'configured' | 'count' | 'empty' }> = {
        preferences: settingsQ.data ? { count: null, label: 'configured' } : { count: null, label: 'empty' },
        clearances: { count: clearancesQ.data?.length ?? 0, label: (clearancesQ.data?.length ?? 0) > 0 ? 'count' : 'empty' },
        interview: { count: questionsQ.data?.length ?? 0, label: (questionsQ.data?.length ?? 0) > 0 ? 'count' : 'empty' },
        documents: { count: documentsQ.data?.length ?? 0, label: (documentsQ.data?.length ?? 0) > 0 ? 'count' : 'empty' },
        workflows: { count: workflowsQ.data?.length ?? 0, label: (workflowsQ.data?.length ?? 0) > 0 ? 'count' : 'empty' },
    }

    return (
        <div className="space-y-4">
            {/* Contextual hint — orients first-time admins about how the
                config they're about to edit will manifest at runtime. Shown
                once per session is more polite, but a permanent inline tip
                is cheap and never gets in the way. */}
            <div className="rounded-xl border bg-primary/5 border-primary/20 px-4 py-3 flex items-start gap-3">
                <div className="size-8 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Workflow className="size-4" />
                </div>
                <div className="flex-1 text-xs leading-relaxed">
                    <p className="font-medium text-foreground">How this flow runs</p>
                    <p className="text-muted-foreground mt-0.5">
                        When an exit request is initiated, the configured <strong>notice period</strong> is applied, <strong>clearance items</strong> are auto-created with their owners, and <strong>workflows</strong> fire (email + in-app notifications). Approval is blocked until every clearance reaches a terminal state, unless HR overrides.
                    </p>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-[260px_minmax(0,1fr)] 3xl:grid-cols-[300px_minmax(0,1fr)]">
                <StepperRail steps={STEPS} active={step} statuses={statuses} onChange={setStep} />
                <div className="min-w-0">
                    {step === 'preferences' && <PreferencesStep />}
                    {step === 'clearances' && <ClearancesStep />}
                    {step === 'interview' && <ExitInterviewStep />}
                    {step === 'documents' && <DocumentsStep />}
                    {step === 'workflows' && <WorkflowsStep />}
                </div>
            </div>
        </div>
    )
}

function StepperRail({
    steps,
    active,
    statuses,
    onChange,
}: {
    steps: typeof STEPS
    active: StepKey
    statuses: Record<StepKey, { count: number | null; label: 'configured' | 'count' | 'empty' }>
    onChange: (k: StepKey) => void
}) {
    const { t } = useTranslation()
    return (
        <aside className="lg:sticky lg:top-20 lg:self-start">
            {/* Mobile / tablet: horizontal pills with scroll-snap */}
            <ol className="flex lg:hidden gap-2 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
                {steps.map((s, idx) => {
                    const isActive = s.key === active
                    return (
                        <li key={s.key} className="snap-start shrink-0">
                            <button
                                type="button"
                                onClick={() => onChange(s.key)}
                                className={cn(
                                    'flex items-center gap-2 px-3 py-2 rounded-full text-sm border transition-colors',
                                    isActive ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:bg-muted',
                                )}
                            >
                                <span className={cn(
                                    'size-5 rounded-full flex items-center justify-center text-[10px] font-bold',
                                    isActive ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground',
                                )}>{idx + 1}</span>
                                <s.icon className="size-3.5" />
                                <span className="font-medium whitespace-nowrap">
                                    {t(`orgSettings.offboardingFlow.${s.i18nKey}.label`)}
                                </span>
                            </button>
                        </li>
                    )
                })}
            </ol>

            {/* Desktop: vertical stepper with connector lines */}
            <ol className="hidden lg:block rounded-xl border bg-card shadow-sm p-3">
                {steps.map((s, idx) => {
                    const isActive = s.key === active
                    const isLast = idx === steps.length - 1
                    const status = statuses[s.key]
                    const statusText =
                        status.label === 'configured' ? t('orgSettings.offboardingFlow.statusConfigured', { defaultValue: 'Configured' }) :
                        status.label === 'count' ? t('orgSettings.offboardingFlow.statusCount', { defaultValue: '{{count}} configured', count: status.count ?? 0 }) :
                        t('orgSettings.offboardingFlow.statusEmpty', { defaultValue: 'Not configured' })
                    return (
                        <li key={s.key} className="relative">
                            <button
                                type="button"
                                onClick={() => onChange(s.key)}
                                className={cn(
                                    'group flex items-start gap-3 w-full px-2.5 py-2.5 rounded-lg text-start transition-colors',
                                    isActive ? 'bg-muted' : 'hover:bg-muted/60',
                                )}
                            >
                                {/* Number node + connector */}
                                <div className="relative flex flex-col items-center self-stretch">
                                    <span className={cn(
                                        'size-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 transition-all',
                                        isActive
                                            ? 'bg-primary text-primary-foreground ring-4 ring-primary/15'
                                            : status.label === 'empty'
                                                ? 'bg-background border-2 border-muted-foreground/30 text-muted-foreground'
                                                : 'bg-primary/10 text-primary border border-primary/30',
                                    )}>
                                        {idx + 1}
                                    </span>
                                    {!isLast && (
                                        <span className={cn(
                                            'flex-1 w-px my-1 min-h-[18px]',
                                            isActive || status.label !== 'empty' ? 'bg-primary/30' : 'bg-border',
                                        )} />
                                    )}
                                </div>
                                {/* Label + status */}
                                <div className="flex-1 min-w-0 pt-0.5">
                                    <div className="flex items-center gap-2">
                                        <s.icon className={cn(
                                            'size-3.5 shrink-0',
                                            isActive ? 'text-primary' : 'text-muted-foreground',
                                        )} />
                                        <span className={cn(
                                            'text-sm font-medium leading-tight',
                                            isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground',
                                        )}>
                                            {t(`orgSettings.offboardingFlow.${s.i18nKey}.label`)}
                                        </span>
                                    </div>
                                    <p className={cn(
                                        'text-[11px] mt-0.5 leading-tight',
                                        status.label === 'empty' ? 'text-muted-foreground/70' : 'text-emerald-600 dark:text-emerald-400',
                                    )}>
                                        {statusText}
                                    </p>
                                </div>
                            </button>
                        </li>
                    )
                })}
            </ol>
        </aside>
    )
}

/**
 * Standard top header for each step body — replaces the redundant Card wrapper
 * that was being used everywhere. Cleaner layout, more room for actual content.
 */
function StepHeader({
    icon: Icon,
    title,
    description,
    action,
}: {
    icon: React.ElementType
    title: string
    description: string
    action?: React.ReactNode
}) {
    return (
        <div className="flex items-start justify-between gap-4 pb-4 border-b mb-5">
            <div className="flex items-start gap-3 min-w-0">
                <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Icon className="size-5" />
                </div>
                <div className="min-w-0">
                    <h2 className="text-base font-semibold leading-tight">{title}</h2>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
                </div>
            </div>
            {action && <div className="shrink-0">{action}</div>}
        </div>
    )
}

// ─── Step 1: Preferences ────────────────────────────────────────────────────

function PreferencesStep() {
    const { t } = useTranslation()
    const { data, isLoading } = useOffboardingSettings()
    const update = useUpdateOffboardingSettings()

    if (isLoading || !data) return <Skeleton className="h-64 w-full" />

    const toggleNotice = (next: boolean) => {
        update.mutate({ noticePeriodEnabled: next }, {
            onSuccess: () => toast.success(t('orgSettings.offboardingFlow.preferences.saved')),
        })
    }

    const setHrPartners = (ids: string[]) => {
        update.mutate({ hrPartnerUserIds: ids })
    }

    return (
        <div className="rounded-xl border bg-card shadow-sm p-5 sm:p-6">
            <StepHeader
                icon={Settings2}
                title={t('orgSettings.offboardingFlow.preferences.title')}
                description={t('orgSettings.offboardingFlow.preferences.description')}
            />

            <div className="space-y-5">
                {/* Notice period */}
                <div className="rounded-lg border bg-muted/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <Switch
                                checked={data.noticePeriodEnabled}
                                onCheckedChange={toggleNotice}
                                id="notice-period-toggle"
                            />
                            <Label htmlFor="notice-period-toggle" className="cursor-pointer font-medium">
                                {t('orgSettings.offboardingFlow.preferences.enableNotice')}
                            </Label>
                        </div>
                        {data.noticePeriodEnabled && (
                            <div className="flex items-center gap-2">
                                <NumericInput
                                    className="w-20 h-9"
                                    value={data.noticePeriodValue}
                                    decimal={false}
                                    onChange={(e) => {
                                        const n = parseInt(e.target.value || '0', 10)
                                        if (!Number.isNaN(n) && n >= 0 && n !== data.noticePeriodValue) {
                                            update.mutate({ noticePeriodValue: n })
                                        }
                                    }}
                                />
                                <Select
                                    value={data.noticePeriodUnit}
                                    onValueChange={(v: 'days' | 'months') => update.mutate({ noticePeriodUnit: v })}
                                >
                                    <SelectTrigger className="w-28 h-9">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="days">{t('orgSettings.offboardingFlow.preferences.days')}</SelectItem>
                                        <SelectItem value="months">{t('orgSettings.offboardingFlow.preferences.months')}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>
                    {data.noticePeriodEnabled && (
                        <p className="text-[11px] text-muted-foreground mt-2 ps-11">
                            {t('orgSettings.offboardingFlow.preferences.standardNotice')}
                        </p>
                    )}
                </div>

                {/* Two-column row: HR partner + Approval, on wide screens */}
                <div className="grid md:grid-cols-2 gap-4">
                    {/* HR partner — typeahead multi-picker (shared UserSelect) */}
                    <div className="rounded-lg border bg-muted/20 p-4">
                        <Label className="font-medium text-sm">{t('orgSettings.offboardingFlow.preferences.hrPartner')}</Label>
                        <p className="text-[11px] text-muted-foreground mt-0.5 mb-3">
                            {t('orgSettings.offboardingFlow.preferences.hrPartnerHint')}
                        </p>
                        <UserSelect
                            multiple
                            value={data.hrPartnerUserIds}
                            onValueChange={setHrPartners}
                            placeholder={t('orgSettings.offboardingFlow.preferences.addHrPartner')}
                        />
                    </div>

                    {/* Approval */}
                    <div className="rounded-lg border bg-muted/20 p-4">
                        <Label className="font-medium text-sm">{t('orgSettings.offboardingFlow.preferences.approval')}</Label>
                        <p className="text-[11px] text-muted-foreground mt-0.5 mb-3">
                            {t('orgSettings.offboardingFlow.preferences.approvalHint')}
                        </p>
                        <div className="space-y-2.5">
                            <div className="flex items-center gap-2">
                                <NumericInput
                                    className="w-16 h-9"
                                    value={data.approvalReportingLevels}
                                    decimal={false}
                                    onChange={(e) => {
                                        const n = parseInt(e.target.value || '0', 10)
                                        if (!Number.isNaN(n) && n >= 0 && n !== data.approvalReportingLevels) {
                                            update.mutate({ approvalReportingLevels: n })
                                        }
                                    }}
                                />
                                <span className="text-sm text-muted-foreground">
                                    {t('orgSettings.offboardingFlow.preferences.levelsOfReporting')}
                                </span>
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer text-sm">
                                <Checkbox
                                    checked={data.approvalRequireHrPartner}
                                    onCheckedChange={(v) => update.mutate({ approvalRequireHrPartner: !!v })}
                                />
                                <span>{t('orgSettings.offboardingFlow.preferences.requireHrApproval', { defaultValue: 'Require HR partner approval' })}</span>
                            </label>
                            <div className="flex items-center gap-1.5 text-[11px] pt-1 border-t mt-1">
                                <span className="text-muted-foreground">{t('orgSettings.offboardingFlow.preferences.outcome', { defaultValue: 'Outcome:' })}</span>
                                <span className="text-emerald-600 font-medium">{t('common.approved')}</span>
                                <span className="text-muted-foreground">/</span>
                                <span className="text-rose-600 font-medium">{t('common.rejected')}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ─── Step 2: Clearances ─────────────────────────────────────────────────────

function ClearancesStep() {
    const { t } = useTranslation()
    const { data, isLoading } = useClearanceTemplates()
    const usersQ = useTenantUsers()
    const del = useDeleteClearance()
    const [open, setOpen] = useState(false)
    const [editing, setEditing] = useState<ClearanceTemplate | null>(null)
    const [confirmId, setConfirmId] = useState<string | null>(null)

    return (
        <div className="rounded-xl border bg-card shadow-sm p-5 sm:p-6">
            <StepHeader
                icon={ListChecks}
                title={t('orgSettings.offboardingFlow.clearances.title')}
                description={t('orgSettings.offboardingFlow.clearances.description')}
                action={
                    <Button onClick={() => { setEditing(null); setOpen(true) }} size="sm">
                        <Plus className="size-4 me-1" />
                        {t('orgSettings.offboardingFlow.clearances.add')}
                    </Button>
                }
            />

            {isLoading ? (
                <Skeleton className="h-32 w-full" />
            ) : !data || data.length === 0 ? (
                <EmptyState text={t('orgSettings.offboardingFlow.clearances.empty')} />
            ) : (
                <div className="overflow-hidden rounded-lg border">
                    <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-sm">
                        <thead className="bg-muted/30">
                            <tr>
                                <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">{t('orgSettings.offboardingFlow.clearances.colName')}</th>
                                <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">{t('orgSettings.offboardingFlow.clearances.colOwner')}</th>
                                <th className="px-4 py-2.5 text-start font-medium text-muted-foreground hidden sm:table-cell">{t('orgSettings.offboardingFlow.clearances.colDueDate')}</th>
                                <th className="px-4 py-2.5 w-20"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map(c => (
                                <tr key={c.id} className="group border-t hover:bg-muted/20 cursor-pointer" onClick={() => { setEditing(c); setOpen(true) }}>
                                    <td className="px-4 py-3 font-medium">{c.name}</td>
                                    <td className="px-4 py-3 text-muted-foreground">
                                        {ownerLabel(c, usersQ.data ?? [], t)}
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground text-xs hidden sm:table-cell">
                                        {offsetLabel(c.endOffsetDays, t)}
                                    </td>
                                    <td className="px-4 py-3 text-end whitespace-nowrap">
                                        <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setEditing(c); setOpen(true) }} aria-label="Edit">
                                                <Pencil className="size-3.5" />
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setConfirmId(c.id) }} aria-label="Delete">
                                                <Trash2 className="size-3.5 text-rose-500" />
                                            </Button>
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    </div>
                </div>
            )}
            <ClearanceDialog open={open} onOpenChange={setOpen} editing={editing} />
            <ConfirmDialog
                open={!!confirmId}
                onOpenChange={(o) => !o && setConfirmId(null)}
                title={t('orgSettings.offboardingFlow.clearances.deleteTitle')}
                description={t('orgSettings.offboardingFlow.clearances.deleteDesc')}
                variant="destructive"
                onConfirm={async () => {
                    if (!confirmId) return
                    await del.mutateAsync(confirmId)
                    toast.success(t('orgSettings.offboardingFlow.clearances.deleted'))
                    setConfirmId(null)
                }}
            />
        </div>
    )
}

function ClearanceDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (o: boolean) => void; editing: ClearanceTemplate | null }) {
    const { t } = useTranslation()
    const create = useCreateClearance()
    const update = useUpdateClearance()
    // Used to warn admins when they pick "HR partner" as owner but haven't
    // actually nominated any HR partner users in Preferences. Without that
    // list, the clearance instance lands with ownerUserId=NULL at runtime
    // and only HR can act on it.
    const settingsQ = useOffboardingSettings()
    const hrPartnerCount = settingsQ.data?.hrPartnerUserIds.length ?? 0
    const isEdit = !!editing

    const [name, setName] = useState('')
    const [ownerType, setOwnerType] = useState<OwnerType>('hr_partner')
    const [ownerUserId, setOwnerUserId] = useState<string | null>(null)
    const [startOffsetDays, setStartOffsetDays] = useState<number>(30)
    const [endOffsetDays, setEndOffsetDays] = useState<number>(0)

    // State-during-render sync (avoid useEffect→setState double render)
    const targetId = open ? (editing?.id ?? '__new__') : null
    const [last, setLast] = useState<string | null>(null)
    if (targetId !== last) {
        setLast(targetId)
        if (open) {
            setName(editing?.name ?? '')
            setOwnerType((editing?.ownerType as OwnerType) ?? 'hr_partner')
            setOwnerUserId(editing?.ownerUserId ?? null)
            setStartOffsetDays(editing?.startOffsetDays ?? 30)
            setEndOffsetDays(editing?.endOffsetDays ?? 0)
        }
    }

    async function submit(e: { preventDefault(): void }) {
        e.preventDefault()
        if (!name.trim()) { toast.error(t('orgSettings.offboardingFlow.clearances.nameRequired')); return }
        const body = {
            name: name.trim(),
            description: null,
            ownerType,
            ownerUserId: ownerType === 'specific_user' ? ownerUserId : null,
            startOffsetDays: Math.max(0, startOffsetDays | 0),
            endOffsetDays: Math.max(0, endOffsetDays | 0),
            position: editing?.position ?? 0,
            isActive: true,
        }
        try {
            if (isEdit && editing) {
                await update.mutateAsync({ id: editing.id, ...body })
                toast.success(t('orgSettings.offboardingFlow.clearances.updated'))
            } else {
                await create.mutateAsync(body)
                toast.success(t('orgSettings.offboardingFlow.clearances.created'))
            }
            onOpenChange(false)
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to save')
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>{isEdit ? t('orgSettings.offboardingFlow.clearances.editTitle') : t('orgSettings.offboardingFlow.clearances.addTitle')}</DialogTitle>
                </DialogHeader>
                <form onSubmit={submit}>
                    <DialogBody className="space-y-4">
                        <div>
                            <Label className="text-sm font-medium">
                                {t('orgSettings.offboardingFlow.clearances.fieldName')} <span className="text-rose-500">*</span>
                            </Label>
                            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('orgSettings.offboardingFlow.clearances.fieldNamePh')} />
                        </div>
                        <div>
                            <Label className="text-sm font-medium">
                                {t('orgSettings.offboardingFlow.clearances.fieldOwner')} <span className="text-rose-500">*</span>
                            </Label>
                            <Select value={ownerType} onValueChange={(v: OwnerType) => setOwnerType(v)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="hr_partner">{t('orgSettings.offboardingFlow.clearances.ownerHrPartner')}</SelectItem>
                                    <SelectItem value="reporting_manager">{t('orgSettings.offboardingFlow.clearances.ownerReportingManager')}</SelectItem>
                                    <SelectItem value="specific_user">{t('orgSettings.offboardingFlow.clearances.ownerSpecificUser')}</SelectItem>
                                </SelectContent>
                            </Select>
                            {/* Owner-resolution warnings — surface the cases
                                where instantiateClearancesForExit() would
                                land the clearance with ownerUserId=NULL. */}
                            {ownerType === 'hr_partner' && hrPartnerCount === 0 && (
                                <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1.5 flex items-start gap-1.5">
                                    <span className="size-3.5 rounded-full bg-amber-200 dark:bg-amber-950 text-amber-800 dark:text-amber-200 flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5">!</span>
                                    {t('orgSettings.offboardingFlow.clearances.noHrPartnerWarning', { defaultValue: 'No HR partner is configured under Preferences. New exit requests will create this clearance with no assigned owner — only HR can complete it.' })}
                                </p>
                            )}
                            {ownerType === 'reporting_manager' && (
                                <p className="text-[11px] text-muted-foreground mt-1.5 flex items-start gap-1.5">
                                    <span className="size-3.5 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5">i</span>
                                    {t('orgSettings.offboardingFlow.clearances.reportingManagerNote', { defaultValue: "Resolves at runtime to the exiting employee's reporting manager. Employees with no reporting manager will get an unowned clearance — HR can reassign." })}
                                </p>
                            )}
                        </div>
                        {ownerType === 'specific_user' && (
                            <div>
                                <Label className="text-sm font-medium">{t('orgSettings.offboardingFlow.clearances.pickUser')}</Label>
                                <UserSelect
                                    value={ownerUserId ?? ''}
                                    onValueChange={(v) => setOwnerUserId(v || null)}
                                    placeholder={t('orgSettings.offboardingFlow.clearances.pickUserPh')}
                                    clearable
                                />
                            </div>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <Label className="text-sm font-medium">
                                    {t('orgSettings.offboardingFlow.clearances.startDate')} <span className="text-rose-500">*</span>
                                </Label>
                                <div className="flex items-center gap-2">
                                    <NumericInput value={startOffsetDays} decimal={false} onChange={(e) => setStartOffsetDays(parseInt(e.target.value || '0', 10) || 0)} />
                                    <span className="text-xs text-muted-foreground whitespace-nowrap">{t('orgSettings.offboardingFlow.clearances.daysBefore')}</span>
                                </div>
                            </div>
                            <div>
                                <Label className="text-sm font-medium">
                                    {t('orgSettings.offboardingFlow.clearances.endDate')} <span className="text-rose-500">*</span>
                                </Label>
                                <div className="flex items-center gap-2">
                                    <NumericInput value={endOffsetDays} decimal={false} onChange={(e) => setEndOffsetDays(parseInt(e.target.value || '0', 10) || 0)} />
                                    <span className="text-xs text-muted-foreground whitespace-nowrap">{t('orgSettings.offboardingFlow.clearances.daysBefore')}</span>
                                </div>
                            </div>
                        </div>
                    </DialogBody>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
                        <Button type="submit" disabled={create.isPending || update.isPending}>
                            {isEdit ? t('common.save') : t('common.create')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

// ─── Step 3: Exit Interview ─────────────────────────────────────────────────

function ExitInterviewStep() {
    const { t } = useTranslation()
    const { data: settings, isLoading } = useOffboardingSettings()
    const { data: questions, isLoading: qLoading } = useInterviewQuestions()
    const update = useUpdateOffboardingSettings()
    const del = useDeleteInterviewQuestion()
    const reorder = useReorderInterviewQuestions()
    const [open, setOpen] = useState(false)
    const [editing, setEditing] = useState<InterviewQuestion | null>(null)
    const [confirmId, setConfirmId] = useState<string | null>(null)

    // dnd-kit setup — pointer with a short activation distance so a single
    // click on the row body still bubbles to the edit button.
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    )

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event
        if (!over || active.id === over.id || !questions) return
        const oldIndex = questions.findIndex(q => q.id === active.id)
        const newIndex = questions.findIndex(q => q.id === over.id)
        if (oldIndex < 0 || newIndex < 0) return
        const reordered = arrayMove(questions, oldIndex, newIndex)
        reorder.mutate(reordered.map(q => q.id))
    }
    const [intro, setIntro] = useState<string>('')
    const [thanks, setThanks] = useState<string>('')

    // Sync local edit buffers to remote state when the row loads or changes
    const remoteIntro = settings?.interviewIntroMessage ?? ''
    const remoteThanks = settings?.interviewThankYouMessage ?? ''
    const [lastIntro, setLastIntro] = useState<string | null>(null)
    const [lastThanks, setLastThanks] = useState<string | null>(null)
    if (remoteIntro !== lastIntro) { setLastIntro(remoteIntro); setIntro(remoteIntro) }
    if (remoteThanks !== lastThanks) { setLastThanks(remoteThanks); setThanks(remoteThanks) }

    if (isLoading || !settings) return <Skeleton className="h-64 w-full" />

    const saveIntro = () => { if (intro !== remoteIntro) update.mutate({ interviewIntroMessage: intro || null }) }
    const saveThanks = () => { if (thanks !== remoteThanks) update.mutate({ interviewThankYouMessage: thanks || null }) }

    return (
        <div className="rounded-xl border bg-card shadow-sm p-5 sm:p-6">
            <StepHeader
                icon={MessageSquare}
                title={t('orgSettings.offboardingFlow.interview.title')}
                description={t('orgSettings.offboardingFlow.interview.description')}
            />

            <div className="space-y-5">
                {/* Intro */}
                <div>
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('orgSettings.offboardingFlow.interview.intro')}
                    </Label>
                    <Textarea
                        rows={3}
                        value={intro}
                        onChange={(e) => setIntro(e.target.value)}
                        onBlur={saveIntro}
                        placeholder={t('orgSettings.offboardingFlow.interview.introPh')}
                        className="mt-1.5 resize-none"
                    />
                </div>

                {/* Questions */}
                <div className="rounded-lg border bg-muted/10">
                    <div className="flex items-center justify-between gap-2 px-4 py-3 border-b">
                        <div className="flex items-center gap-2">
                            <Label className="text-sm font-semibold">
                                {t('orgSettings.offboardingFlow.interview.questions')}
                            </Label>
                            <Badge variant="secondary" className="text-[10px]">
                                {questions?.length ?? 0}
                            </Badge>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => { setEditing(null); setOpen(true) }}>
                            <Plus className="size-3.5 me-1" />
                            {t('orgSettings.offboardingFlow.interview.addQuestion')}
                        </Button>
                    </div>
                    <div className="p-3">
                        {qLoading ? (
                            <Skeleton className="h-32 w-full" />
                        ) : !questions || questions.length === 0 ? (
                            <EmptyState text={t('orgSettings.offboardingFlow.interview.emptyQuestions')} />
                        ) : (
                            <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                modifiers={[restrictToVerticalAxis, restrictToParentElement]}
                                onDragEnd={handleDragEnd}
                            >
                                <SortableContext items={questions.map(q => q.id)} strategy={verticalListSortingStrategy}>
                                    <ol className="space-y-1.5">
                                        {questions.map((q, i) => (
                                            <SortableQuestionRow
                                                key={q.id}
                                                question={q}
                                                index={i}
                                                onEdit={() => { setEditing(q); setOpen(true) }}
                                                onDelete={() => setConfirmId(q.id)}
                                            />
                                        ))}
                                    </ol>
                                </SortableContext>
                            </DndContext>
                        )}
                    </div>
                </div>

                {/* Thanks */}
                <div>
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('orgSettings.offboardingFlow.interview.thanks')}
                    </Label>
                    <Textarea
                        rows={2}
                        value={thanks}
                        onChange={(e) => setThanks(e.target.value)}
                        onBlur={saveThanks}
                        placeholder={t('orgSettings.offboardingFlow.interview.thanksPh')}
                        className="mt-1.5 resize-none"
                    />
                </div>
            </div>

            <QuestionDialog open={open} onOpenChange={setOpen} editing={editing} />
            <ConfirmDialog
                open={!!confirmId}
                onOpenChange={(o) => !o && setConfirmId(null)}
                title={t('orgSettings.offboardingFlow.interview.deleteTitle')}
                description={t('orgSettings.offboardingFlow.interview.deleteDesc')}
                variant="destructive"
                onConfirm={async () => {
                    if (!confirmId) return
                    await del.mutateAsync(confirmId)
                    toast.success(t('orgSettings.offboardingFlow.interview.questionDeleted'))
                    setConfirmId(null)
                }}
            />
        </div>
    )
}

/**
 * Single draggable row in the question list. Drag handle is the leftmost
 * grip icon; the rest of the row stays clickable for edit/delete. Uses
 * dnd-kit's `useSortable` to keep the lift / drop transitions smooth.
 */
function SortableQuestionRow({
    question,
    index,
    onEdit,
    onDelete,
}: {
    question: InterviewQuestion
    index: number
    onEdit: () => void
    onDelete: () => void
}) {
    const { t } = useTranslation()
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: question.id })

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
    }

    return (
        <li
            ref={setNodeRef}
            style={style}
            className={cn(
                'group flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5',
                isDragging && 'opacity-60 shadow-lg ring-2 ring-primary/30',
            )}
        >
            <button
                type="button"
                className="size-6 -mx-1 rounded text-muted-foreground hover:bg-muted cursor-grab active:cursor-grabbing flex items-center justify-center touch-none"
                aria-label={t('common.reorder', { defaultValue: 'Drag to reorder' })}
                {...attributes}
                {...listeners}
            >
                <GripVertical className="size-4" />
            </button>
            <span className="size-6 rounded-md bg-muted text-xs font-semibold flex items-center justify-center shrink-0">{index + 1}</span>
            <Badge variant="outline" className="text-[10px] uppercase shrink-0">
                {questionTypeLabel(question.questionType, t)}
            </Badge>
            {question.required && (
                <Badge
                    variant="secondary"
                    className="text-[10px] shrink-0 bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200/60 dark:border-rose-900/40"
                    title={t('orgSettings.offboardingFlow.interview.requiredHint', {
                        defaultValue: 'Blocks exit approval until answered',
                    })}
                >
                    <span className="size-1 rounded-full bg-rose-500 me-1" />
                    {t('orgSettings.offboardingFlow.interview.required', { defaultValue: 'Required' })}
                </Badge>
            )}
            <span className="text-sm flex-1 min-w-0 truncate">{question.questionText}</span>
            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" onClick={onEdit} aria-label="Edit">
                    <Pencil className="size-3.5" />
                </Button>
                <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Delete">
                    <Trash2 className="size-3.5 text-rose-500" />
                </Button>
            </div>
        </li>
    )
}

function QuestionDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (o: boolean) => void; editing: InterviewQuestion | null }) {
    const { t } = useTranslation()
    const create = useCreateInterviewQuestion()
    const update = useUpdateInterviewQuestion()
    const isEdit = !!editing

    const [text, setText] = useState('')
    const [type, setType] = useState<QuestionType>('long_text')
    const [required, setRequired] = useState(false)
    const [optionsText, setOptionsText] = useState('')

    const targetId = open ? (editing?.id ?? '__new__') : null
    const [last, setLast] = useState<string | null>(null)
    if (targetId !== last) {
        setLast(targetId)
        if (open) {
            setText(editing?.questionText ?? '')
            setType((editing?.questionType as QuestionType) ?? 'long_text')
            setRequired(editing?.required ?? false)
            setOptionsText((editing?.options ?? []).join('\n'))
        }
    }

    const needsOptions = type === 'single_choice' || type === 'multi_choice'

    async function submit(e: { preventDefault(): void }) {
        e.preventDefault()
        if (!text.trim()) { toast.error(t('orgSettings.offboardingFlow.interview.textRequired')); return }
        const opts = needsOptions
            ? optionsText.split('\n').flatMap(s => {
                const trimmed = s.trim()
                return trimmed ? [trimmed] : []
            })
            : null
        if (needsOptions && (!opts || opts.length < 2)) {
            toast.error(t('orgSettings.offboardingFlow.interview.needTwoOptions')); return
        }
        const body = {
            questionText: text.trim(),
            questionType: type,
            options: opts,
            required,
            position: editing?.position ?? 0,
            isActive: true,
        }
        try {
            if (isEdit && editing) await update.mutateAsync({ id: editing.id, ...body })
            else await create.mutateAsync(body)
            toast.success(t('common.saved'))
            onOpenChange(false)
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed')
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{isEdit ? t('orgSettings.offboardingFlow.interview.editQuestion') : t('orgSettings.offboardingFlow.interview.addQuestion')}</DialogTitle>
                </DialogHeader>
                <form onSubmit={submit}>
                    <DialogBody className="space-y-4">
                        <div>
                            <Label>{t('orgSettings.offboardingFlow.interview.questionText')} <span className="text-rose-500">*</span></Label>
                            <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <Label>{t('orgSettings.offboardingFlow.interview.questionType')}</Label>
                                <Select value={type} onValueChange={(v: QuestionType) => setType(v)}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="short_text">{questionTypeLabel('short_text', t)}</SelectItem>
                                        <SelectItem value="long_text">{questionTypeLabel('long_text', t)}</SelectItem>
                                        <SelectItem value="rating">{questionTypeLabel('rating', t)}</SelectItem>
                                        <SelectItem value="yes_no">{questionTypeLabel('yes_no', t)}</SelectItem>
                                        <SelectItem value="single_choice">{questionTypeLabel('single_choice', t)}</SelectItem>
                                        <SelectItem value="multi_choice">{questionTypeLabel('multi_choice', t)}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className={cn(
                            'flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                            required ? 'bg-rose-50/50 border-rose-200 dark:bg-rose-950/20 dark:border-rose-900/40' : 'bg-muted/20',
                        )}>
                            <div className="min-w-0">
                                <Label htmlFor="required-toggle" className="cursor-pointer text-sm font-medium">
                                    {t('orgSettings.offboardingFlow.interview.required', { defaultValue: 'Mandatory question' })}
                                </Label>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                    {t('orgSettings.offboardingFlow.interview.requiredHint', {
                                        defaultValue: 'Blocks exit approval until the employee answers this question.',
                                    })}
                                </p>
                            </div>
                            <Switch
                                id="required-toggle"
                                checked={required}
                                onCheckedChange={setRequired}
                            />
                        </div>
                        {needsOptions && (
                            <div>
                                <Label>{t('orgSettings.offboardingFlow.interview.options')}</Label>
                                <Textarea rows={4} value={optionsText} onChange={(e) => setOptionsText(e.target.value)} placeholder={t('orgSettings.offboardingFlow.interview.optionsPh')} />
                            </div>
                        )}
                    </DialogBody>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
                        <Button type="submit" disabled={create.isPending || update.isPending}>{isEdit ? t('common.save') : t('common.create')}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

// ─── Step 4: Documents ──────────────────────────────────────────────────────
//
// Card list mirroring Zoho's clean Documents step: each row is one issuable
// letter (Experience / Relieving by default). Click the row to open a
// full-width dialog with the template body on the left and a live preview on
// the right — variables ({{employeeName}}, {{lastWorkingDay}}, …) are
// substituted against a fixed sample employee so admins see exactly what the
// rendered letter looks like.

function DocumentsStep() {
    const { t } = useTranslation()
    const { data, isLoading } = useExitDocuments()
    const del = useDeleteExitDocument()
    const [editing, setEditing] = useState<ExitDocumentItem | null | 'new'>(null)
    const [confirmId, setConfirmId] = useState<string | null>(null)

    return (
        <div className="rounded-xl border bg-card shadow-sm p-5 sm:p-6">
            <StepHeader
                icon={FileText}
                title={t('orgSettings.offboardingFlow.documents.title')}
                description={t('orgSettings.offboardingFlow.documents.description')}
                action={
                    <Button size="sm" onClick={() => setEditing('new')}>
                        <Plus className="size-4 me-1" />
                        {t('orgSettings.offboardingFlow.documents.add')}
                    </Button>
                }
            />
            {isLoading ? (
                <Skeleton className="h-32 w-full" />
            ) : !data || data.length === 0 ? (
                <EmptyState text={t('orgSettings.offboardingFlow.documents.empty')} />
            ) : (
                <ul className="flex flex-col gap-2">
                    {data.map(d => (
                        // Use a semantic <li> for list membership and a real
                        // <button> for the click target — keyboard, screen-
                        // reader, and "open in new tab" semantics all work
                        // properly without role/tabIndex hacks. The Delete
                        // button is a sibling so it can `stopPropagation` and
                        // not accidentally fire the card's click.
                        <li key={d.id} className="group relative">
                            <button
                                type="button"
                                onClick={() => setEditing(d)}
                                className="flex w-full items-start gap-3 rounded-lg border bg-card p-4 text-start hover:border-primary/40 hover:shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                            >
                                <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                    <FileText className="size-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium truncate">{d.name}</span>
                                        {d.required && (
                                            <Badge variant="secondary" className="text-[10px] shrink-0">
                                                <Check className="size-2.5 me-0.5" />
                                                {t('orgSettings.offboardingFlow.documents.required')}
                                            </Badge>
                                        )}
                                    </div>
                                    {d.bodyTemplate && (
                                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                            {d.bodyTemplate.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)}
                                        </p>
                                    )}
                                </div>
                                {/* Spacer so the delete button has its absolute
                                    slot without overlapping the content. */}
                                <span className="size-9 shrink-0" aria-hidden="true" />
                            </button>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setConfirmId(d.id)}
                                aria-label="Delete"
                                className="absolute end-3 top-3 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                            >
                                <Trash2 className="size-3.5 text-rose-500" />
                            </Button>
                        </li>
                    ))}
                </ul>
            )}
            <DocumentEditorDialog
                open={editing !== null}
                onOpenChange={(o) => !o && setEditing(null)}
                editing={editing === 'new' ? null : editing}
            />
            <ConfirmDialog
                open={!!confirmId}
                onOpenChange={(o) => !o && setConfirmId(null)}
                title={t('orgSettings.offboardingFlow.documents.deleteTitle')}
                description={t('orgSettings.offboardingFlow.documents.deleteDesc')}
                variant="destructive"
                onConfirm={async () => {
                    if (!confirmId) return
                    await del.mutateAsync(confirmId)
                    toast.success(t('orgSettings.offboardingFlow.documents.deleted'))
                    setConfirmId(null)
                }}
            />
        </div>
    )
}

/**
 * Sample values used to render a live preview of the letter. Kept locally —
 * each variable maps to a placeholder the workflow engine will substitute at
 * actual send time.
 */
const SAMPLE_VARS: Record<string, string> = {
    employeeName: 'Sarah Ahmed',
    employeeNo: 'EMP-1042',
    designation: 'Senior Marketing Manager',
    joinDate: '15 Mar 2021',
    exitDate: '01 Jun 2026',
    lastWorkingDay: '30 Jun 2026',
    companyName: 'Your Company',
    today: new Date().toLocaleDateString('en-GB'),
}

function renderTemplate(html: string): string {
    const substituted = html.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => SAMPLE_VARS[key] ?? `{{${key}}}`)
    // Sanitise — even though the admin wrote it themselves, DOMPurify is cheap
    // and keeps the preview hardened against accidentally pasted scripts.
    return DOMPurify.sanitize(substituted)
}

function DocumentEditorDialog({
    open,
    onOpenChange,
    editing,
}: {
    open: boolean
    onOpenChange: (o: boolean) => void
    editing: ExitDocumentItem | null
}) {
    const { t } = useTranslation()
    const create = useCreateExitDocument()
    const update = useUpdateExitDocument()

    const [name, setName] = useState('')
    const [bodyTemplate, setBodyTemplate] = useState('')
    const [required, setRequired] = useState(false)
    const [mode, setMode] = useState<'edit' | 'preview'>('preview')

    // State-during-render reset on open — keeps the dialog cheap and avoids
    // a useEffect→setState double render.
    const targetId = open ? (editing?.id ?? '__new__') : null
    const [last, setLast] = useState<string | null>(null)
    if (targetId !== last) {
        setLast(targetId)
        if (open) {
            setName(editing?.name ?? '')
            setBodyTemplate(editing?.bodyTemplate ?? '')
            setRequired(editing?.required ?? false)
            // Default to preview for existing letters, edit for new ones
            setMode(editing ? 'preview' : 'edit')
        }
    }

    async function submit() {
        if (!name.trim()) {
            toast.error(t('orgSettings.offboardingFlow.documents.nameRequired'))
            return
        }
        const body = {
            name: name.trim(),
            bodyTemplate: bodyTemplate || null,
            documentTemplateId: null,
            autoGenerate: false,
            required,
            position: editing?.position ?? 0,
            isActive: true,
        }
        try {
            if (editing) await update.mutateAsync({ id: editing.id, ...body })
            else await create.mutateAsync(body)
            toast.success(t('common.saved'))
            onOpenChange(false)
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed')
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl 3xl:max-w-6xl">
                <DialogHeader>
                    <div className="flex items-center justify-between gap-3 pe-8">
                        <DialogTitle className="flex items-center gap-2 min-w-0">
                            <FileText className="size-4 text-muted-foreground shrink-0" />
                            {editing ? (
                                <span className="flex items-baseline gap-2 min-w-0">
                                    <span className="text-muted-foreground text-sm font-normal shrink-0">
                                        {t('orgSettings.offboardingFlow.documents.editTitle')}:
                                    </span>
                                    <span className="truncate">{editing.name}</span>
                                </span>
                            ) : (
                                t('orgSettings.offboardingFlow.documents.addTitle')
                            )}
                        </DialogTitle>
                        <div className="flex items-center gap-1 rounded-md border bg-muted/30 p-0.5">
                            <button
                                type="button"
                                onClick={() => setMode('preview')}
                                className={cn(
                                    'px-3 py-1 text-xs font-medium rounded transition-colors',
                                    mode === 'preview' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {t('orgSettings.offboardingFlow.documents.preview', { defaultValue: 'Preview' })}
                            </button>
                            <button
                                type="button"
                                onClick={() => setMode('edit')}
                                className={cn(
                                    'px-3 py-1 text-xs font-medium rounded transition-colors',
                                    mode === 'edit' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {t('common.edit')}
                            </button>
                        </div>
                    </div>
                </DialogHeader>
                <DialogBody className="space-y-4">
                    {mode === 'edit' ? (
                        <>
                            <div>
                                <Label className="text-xs">
                                    {t('orgSettings.offboardingFlow.documents.fieldName')} <span className="text-rose-500">*</span>
                                </Label>
                                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('orgSettings.offboardingFlow.documents.fieldNamePh')} />
                            </div>
                            <div>
                                <Label className="text-xs">
                                    {t('orgSettings.offboardingFlow.documents.bodyTemplate', { defaultValue: 'Letter body' })}
                                </Label>
                                <RichTextEditor
                                    value={bodyTemplate}
                                    onChange={setBodyTemplate}
                                    placeholder={t('orgSettings.offboardingFlow.documents.bodyPlaceholder', { defaultValue: 'Write the letter body. Use the variables below to insert dynamic fields.' })}
                                    minHeight={300}
                                />
                                <p className="text-[11px] text-muted-foreground mt-1.5">
                                    {t('orgSettings.offboardingFlow.documents.vars', { defaultValue: 'Click a variable to insert at the end:' })}{' '}
                                    {Object.keys(SAMPLE_VARS).map(k => (
                                        <button
                                            key={k}
                                            type="button"
                                            className="font-mono mx-0.5 px-1.5 py-0.5 rounded border bg-muted/40 hover:bg-muted text-[10px] cursor-pointer"
                                            onClick={() => setBodyTemplate(prev => {
                                                // Append the {{var}} token at the end of the HTML. Tiptap
                                                // normalises loose text into a paragraph on re-sync, so the
                                                // editor stays well-formed regardless of where the existing
                                                // content ends.
                                                const token = `{{${k}}}`
                                                if (!prev) return `<p>${token}</p>`
                                                return prev.replace(/(<\/p>)\s*$/, ` ${token}$1`) === prev
                                                    ? `${prev}<p>${token}</p>`
                                                    : prev.replace(/(<\/p>)\s*$/, ` ${token}$1`)
                                            })}
                                        >
                                            {`{{${k}}}`}
                                        </button>
                                    ))}
                                </p>
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <Checkbox checked={required} onCheckedChange={(v) => setRequired(!!v)} />
                                <span className="text-sm">{t('orgSettings.offboardingFlow.documents.required')}</span>
                            </label>
                        </>
                    ) : (
                        /* Preview mode — mimics a piece of paper */
                        <div className="rounded-lg border bg-white dark:bg-zinc-50 text-black p-10 shadow-sm min-h-[400px] max-h-[60vh] overflow-y-auto">
                            {bodyTemplate ? (
                                <div
                                    className="prose prose-sm max-w-none [&_p]:mb-3"
                                    dangerouslySetInnerHTML={{ __html: renderTemplate(bodyTemplate) }}
                                />
                            ) : (
                                <div className="text-center text-muted-foreground py-12">
                                    <FileText className="size-8 mx-auto mb-2 opacity-50" />
                                    <p className="text-sm">{t('orgSettings.offboardingFlow.documents.previewEmpty', { defaultValue: 'No letter body yet. Switch to Edit to add content.' })}</p>
                                </div>
                            )}
                        </div>
                    )}
                </DialogBody>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
                    <Button type="button" onClick={submit} disabled={create.isPending || update.isPending}>
                        {editing ? t('common.save') : t('common.create')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ─── Step 5: Workflows ──────────────────────────────────────────────────────

function WorkflowsStep() {
    const { t } = useTranslation()
    const { data, isLoading } = useOffboardingWorkflows()
    const del = useDeleteWorkflow()
    const upd = useUpdateWorkflow()
    const [open, setOpen] = useState(false)
    const [editing, setEditing] = useState<OffboardingWorkflow | null>(null)
    const [confirmId, setConfirmId] = useState<string | null>(null)

    return (
        <div className="rounded-xl border bg-card shadow-sm p-5 sm:p-6">
            <StepHeader
                icon={Workflow}
                title={t('orgSettings.offboardingFlow.workflows.title')}
                description={t('orgSettings.offboardingFlow.workflows.description')}
                action={
                    <Button size="sm" onClick={() => { setEditing(null); setOpen(true) }}>
                        <Plus className="size-4 me-1" />
                        {t('orgSettings.offboardingFlow.workflows.add')}
                    </Button>
                }
            />
            {isLoading ? (
                <Skeleton className="h-32 w-full" />
            ) : !data || data.length === 0 ? (
                <EmptyState text={t('orgSettings.offboardingFlow.workflows.empty')} />
            ) : (
                <ul className="space-y-2">
                    {data.map(w => (
                        <li key={w.id} className="group flex items-center gap-3 rounded-lg border bg-card px-4 py-3 hover:border-primary/40 transition-colors">
                            <div className={cn(
                                'size-9 rounded-lg flex items-center justify-center shrink-0',
                                w.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                            )}>
                                {(() => {
                                    const primary = (w.actions && w.actions.length > 0 ? w.actions[0] : w.actionType) as WorkflowActionType | undefined
                                    if (primary === 'email_alert') return <FileText className="size-4" />
                                    if (primary === 'notification') return <MessageSquare className="size-4" />
                                    return <Workflow className="size-4" />
                                })()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 text-sm font-medium">
                                    <span className="truncate">{w.name}</span>
                                    {!w.enabled && <Badge variant="secondary" className="text-[10px]">{t('common.disabled')}</Badge>}
                                </div>
                                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                                    <span>{triggerLabel(w.trigger, t)}</span>
                                    <span className="text-muted-foreground/50">→</span>
                                    <span>{(w.actions && w.actions.length > 0 ? w.actions : (w.actionType ? [w.actionType] : [])).map(a => actionLabel(a, t)).join(' + ')}</span>
                                </div>
                            </div>
                            <Switch
                                checked={w.enabled}
                                onCheckedChange={(v) => upd.mutate({ id: w.id, enabled: v })}
                            />
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button variant="ghost" size="icon" onClick={() => { setEditing(w); setOpen(true) }} aria-label="Edit">
                                    <Pencil className="size-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => setConfirmId(w.id)} aria-label="Delete">
                                    <Trash2 className="size-3.5 text-rose-500" />
                                </Button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
            <WorkflowDialog open={open} onOpenChange={setOpen} editing={editing} />
            <ConfirmDialog
                open={!!confirmId}
                onOpenChange={(o) => !o && setConfirmId(null)}
                title={t('orgSettings.offboardingFlow.workflows.deleteTitle')}
                description={t('orgSettings.offboardingFlow.workflows.deleteDesc')}
                variant="destructive"
                onConfirm={async () => {
                    if (!confirmId) return
                    await del.mutateAsync(confirmId)
                    toast.success(t('orgSettings.offboardingFlow.workflows.deleted'))
                    setConfirmId(null)
                }}
            />
        </div>
    )
}

function WorkflowDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (o: boolean) => void; editing: OffboardingWorkflow | null }) {
    const { t } = useTranslation()
    const create = useCreateWorkflow()
    const update = useUpdateWorkflow()

    const [name, setName] = useState('')
    const [trigger, setTrigger] = useState<WorkflowTrigger>('on_request_added')
    // `actions` is now multi-select — HR can fan out to email AND in-app
    // notification on the same trigger. Custom function was retired (no
    // sandboxed runtime), so the only two options are email + notification.
    const [actions, setActions] = useState<WorkflowActionType[]>(['email_alert'])
    const [recipients, setRecipients] = useState<Recipient[]>(['employee', 'hr_partner'])
    const [subject, setSubject] = useState('')
    const [body, setBody] = useState('')
    const [customEmails, setCustomEmails] = useState('')

    const targetId = open ? (editing?.id ?? '__new__') : null
    const [last, setLast] = useState<string | null>(null)
    if (targetId !== last) {
        setLast(targetId)
        if (open) {
            setName(editing?.name ?? '')
            setTrigger((editing?.trigger as WorkflowTrigger) ?? 'on_request_added')
            // Read `actions` array; fall back to legacy `actionType` for rows
            // saved before migration 0071. Filter out any retired values.
            const loaded = (editing?.actions && editing.actions.length > 0)
                ? editing.actions
                : (editing?.actionType ? [editing.actionType] : ['email_alert'])
            const filtered = loaded.filter((a): a is WorkflowActionType =>
                a === 'email_alert' || a === 'notification'
            )
            setActions(filtered.length > 0 ? filtered : ['email_alert'])
            setRecipients((editing?.config.recipients as Recipient[]) ?? ['employee', 'hr_partner'])
            setSubject(editing?.config.subject ?? '')
            setBody(editing?.config.body ?? editing?.config.message ?? '')
            setCustomEmails((editing?.config.customEmails ?? []).join(', '))
        }
    }

    const toggleRecipient = (r: Recipient) => {
        setRecipients(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])
    }

    const toggleAction = (a: WorkflowActionType) => {
        setActions(prev => {
            if (prev.includes(a)) {
                // Don't allow zero actions — keep the last one selected.
                if (prev.length === 1) return prev
                return prev.filter(x => x !== a)
            }
            return [...prev, a]
        })
    }

    async function submit(e: { preventDefault(): void }) {
        e.preventDefault()
        if (!name.trim()) { toast.error(t('orgSettings.offboardingFlow.workflows.nameRequired')); return }
        const config: OffboardingWorkflow['config'] = {
            recipients,
            customEmails: recipients.includes('custom')
                ? customEmails.split(',').flatMap(s => {
                    const trimmed = s.trim()
                    return trimmed ? [trimmed] : []
                })
                : [],
        }
        // Shared body across actions: email reads { subject, body }; in-app
        // notification reads { message } — populating both is harmless and
        // keeps the form simple.
        if (actions.includes('email_alert')) {
            config.subject = subject.trim() || undefined
            config.body = body.trim() || undefined
        }
        if (actions.includes('notification')) {
            config.message = body.trim() || undefined
        }
        const payload = {
            name: name.trim(),
            trigger,
            actions,
            config,
            enabled: true,
            position: editing?.position ?? 0,
        }
        try {
            if (editing) await update.mutateAsync({ id: editing.id, ...payload })
            else await create.mutateAsync(payload)
            toast.success(t('common.saved'))
            onOpenChange(false)
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed')
        }
    }

    const sendsEmail = actions.includes('email_alert')

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 min-w-0 pe-8">
                        {editing ? (
                            <span className="flex items-baseline gap-2 min-w-0">
                                <span className="text-muted-foreground text-sm font-normal shrink-0">
                                    {t('orgSettings.offboardingFlow.workflows.editTitle')}:
                                </span>
                                <span className="truncate">{editing.name}</span>
                            </span>
                        ) : (
                            t('orgSettings.offboardingFlow.workflows.addTitle')
                        )}
                    </DialogTitle>
                </DialogHeader>
                <form onSubmit={submit}>
                    <DialogBody className="space-y-4">
                        <div>
                            <Label>{t('orgSettings.offboardingFlow.workflows.fieldName')} <span className="text-rose-500">*</span></Label>
                            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('orgSettings.offboardingFlow.workflows.fieldNamePh')} />
                        </div>
                        <div>
                            <Label>{t('orgSettings.offboardingFlow.workflows.trigger')}</Label>
                            <Select value={trigger} onValueChange={(v: WorkflowTrigger) => setTrigger(v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="on_request_added">{triggerLabel('on_request_added', t)}</SelectItem>
                                    <SelectItem value="on_approved">{triggerLabel('on_approved', t)}</SelectItem>
                                    <SelectItem value="on_rejected">{triggerLabel('on_rejected', t)}</SelectItem>
                                    <SelectItem value="on_clearance_complete">{triggerLabel('on_clearance_complete', t)}</SelectItem>
                                    <SelectItem value="on_settlement_paid">{triggerLabel('on_settlement_paid', t)}</SelectItem>
                                    <SelectItem value="on_relieving_date">{triggerLabel('on_relieving_date', t)}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>{t('orgSettings.offboardingFlow.workflows.action')}</Label>
                            <div className="flex flex-wrap gap-3 rounded-lg border bg-muted/30 p-2.5">
                                {(['email_alert', 'notification'] as WorkflowActionType[]).map(a => (
                                    <label key={a} className="flex items-center gap-1.5 cursor-pointer text-sm">
                                        <Checkbox checked={actions.includes(a)} onCheckedChange={() => toggleAction(a)} />
                                        <span>{actionLabel(a, t)}</span>
                                    </label>
                                ))}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-1">
                                {t('orgSettings.offboardingFlow.workflows.actionsHint', { defaultValue: 'Pick one or both — both fire on the same trigger.' })}
                            </p>
                        </div>
                        <div>
                            <Label>{t('orgSettings.offboardingFlow.workflows.recipients')}</Label>
                            <div className="flex flex-wrap gap-3 rounded-lg border bg-muted/30 p-2.5">
                                {(['employee', 'reporting_manager', 'hr_partner', 'custom'] as Recipient[]).map(r => (
                                    <label key={r} className="flex items-center gap-1.5 cursor-pointer text-sm">
                                        <Checkbox checked={recipients.includes(r)} onCheckedChange={() => toggleRecipient(r)} />
                                        <span>{recipientLabel(r, t)}</span>
                                    </label>
                                ))}
                            </div>
                            {recipients.includes('custom') && (
                                <Input
                                    className="mt-2"
                                    value={customEmails}
                                    onChange={(e) => setCustomEmails(e.target.value)}
                                    placeholder={t('orgSettings.offboardingFlow.workflows.customEmailsPh')}
                                />
                            )}
                        </div>
                        {sendsEmail && (
                            <div>
                                <Label>{t('orgSettings.offboardingFlow.workflows.subject')}</Label>
                                <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="{{employeeName}} has initiated offboarding" />
                            </div>
                        )}
                        <div>
                            <Label>
                                {sendsEmail
                                    ? t('orgSettings.offboardingFlow.workflows.emailBody')
                                    : t('orgSettings.offboardingFlow.workflows.message')}
                            </Label>
                            <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
                            <p className="text-[10px] text-muted-foreground mt-1">
                                {t('orgSettings.offboardingFlow.workflows.variableHint')}
                            </p>
                        </div>
                    </DialogBody>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
                        <Button type="submit" disabled={create.isPending || update.isPending}>{editing ? t('common.save') : t('common.create')}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function EmptyState({ text }: { text: string }) {
    return (
        <div className="rounded-lg border-2 border-dashed bg-muted/20 px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">{text}</p>
        </div>
    )
}

function ownerLabel(c: ClearanceTemplate, users: Array<{ id: string; name: string }>, t: (k: string) => string): string {
    if (c.ownerType === 'hr_partner') return t('orgSettings.offboardingFlow.clearances.ownerHrPartner')
    if (c.ownerType === 'reporting_manager') return t('orgSettings.offboardingFlow.clearances.ownerReportingManager')
    const u = users.find(x => x.id === c.ownerUserId)
    return u?.name ?? t('orgSettings.offboardingFlow.clearances.ownerSpecificUser')
}

function offsetLabel(days: number, t: (k: string, opts?: { count: number }) => string): string {
    if (days === 0) return t('orgSettings.offboardingFlow.clearances.onLastDay')
    return t('orgSettings.offboardingFlow.clearances.daysBeforeRelief', { count: days })
}

function questionTypeLabel(type: QuestionType | string, t: (k: string) => string): string {
    const map: Record<string, string> = {
        short_text: t('orgSettings.offboardingFlow.interview.typeShortText'),
        long_text: t('orgSettings.offboardingFlow.interview.typeLongText'),
        rating: t('orgSettings.offboardingFlow.interview.typeRating'),
        single_choice: t('orgSettings.offboardingFlow.interview.typeSingleChoice'),
        multi_choice: t('orgSettings.offboardingFlow.interview.typeMultiChoice'),
        yes_no: t('orgSettings.offboardingFlow.interview.typeYesNo'),
    }
    return map[type] ?? type
}

function triggerLabel(tr: WorkflowTrigger | string, t: (k: string) => string): string {
    const map: Record<string, string> = {
        on_request_added: t('orgSettings.offboardingFlow.workflows.triggerOnRequestAdded'),
        on_approved: t('orgSettings.offboardingFlow.workflows.triggerOnApproved'),
        on_rejected: t('orgSettings.offboardingFlow.workflows.triggerOnRejected'),
        on_clearance_complete: t('orgSettings.offboardingFlow.workflows.triggerOnClearanceComplete'),
        on_settlement_paid: t('orgSettings.offboardingFlow.workflows.triggerOnSettlementPaid'),
        on_relieving_date: t('orgSettings.offboardingFlow.workflows.triggerOnRelievingDate'),
    }
    return map[tr] ?? tr
}

function actionLabel(a: WorkflowActionType | string, t: (k: string) => string): string {
    const map: Record<string, string> = {
        email_alert: t('orgSettings.offboardingFlow.workflows.actionEmail'),
        notification: t('orgSettings.offboardingFlow.workflows.actionNotification'),
        custom_function: t('orgSettings.offboardingFlow.workflows.actionFunction'),
    }
    return map[a] ?? a
}

function recipientLabel(r: Recipient, t: (k: string) => string): string {
    const map: Record<Recipient, string> = {
        employee: t('orgSettings.offboardingFlow.workflows.recipientEmployee'),
        reporting_manager: t('orgSettings.offboardingFlow.workflows.recipientManager'),
        hr_partner: t('orgSettings.offboardingFlow.workflows.recipientHrPartner'),
        custom: t('orgSettings.offboardingFlow.workflows.recipientCustom'),
    }
    return map[r]
}
