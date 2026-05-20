/**
 * Salary Components configuration tab.
 *
 * Tenant-wide catalog of earning / deduction / benefit / correction templates,
 * laid out as four sub-tabs (matching the Zoho Payroll reference). Adding a
 * component opens a kind-specific form via the unified `<Add Component>` menu
 * — fields swap based on what's being created.
 */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Banknote, Briefcase, CheckCircle2, Circle, Coins,
    Crown, FileMinus, FileText, HeartPulse, Pencil, Plus, RefreshCcw,
    Sparkles, Trash2, X,
} from 'lucide-react'

import { Section } from './_shared'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { NumericInput } from '@/components/ui/numeric-input'
import { ConfirmDialog, toast } from '@/components/ui/overlays'
import {
    DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import {
    useSalaryComponents, useCreateSalaryComponent, useUpdateSalaryComponent, useDeleteSalaryComponent,
    type CreateSalaryComponentBody,
} from '@/hooks/useSalaryComponents'
import {
    BENEFIT_CATEGORIES, CORRECTION_CATEGORIES, DEDUCTION_CATEGORIES, EARNING_CATEGORIES,
    SOCIAL_SECURITY_SCHEMES,
    type SalaryComponent, type SalaryComponentKind, type SocialSecurityScheme,
} from '@/types'
import { cn, formatCurrency } from '@/lib/utils'

// Each kind gets its own dropdown of categories. Display order matters here
// — the most common picks (Basic, Custom Allowance) sit at the top.
const KIND_CATEGORIES: Record<SalaryComponentKind, readonly string[]> = {
    earning: EARNING_CATEGORIES,
    deduction: DEDUCTION_CATEGORIES,
    benefit: BENEFIT_CATEGORIES,
    correction: CORRECTION_CATEGORIES,
}

const KIND_ICONS: Record<SalaryComponentKind, typeof Banknote> = {
    earning: Banknote,
    deduction: FileMinus,
    benefit: HeartPulse,
    correction: RefreshCcw,
}

export function SalaryComponentsTab() {
    const { t } = useTranslation()
    const [tab, setTab] = useState<SalaryComponentKind>('earning')
    // Dialog state — opens for either "new" (componentToEdit = null) or "edit"
    // (componentToEdit = the row). Pre-selecting `dialogKind` lets the Add menu
    // launch straight into a particular form variant.
    const [dialogKind, setDialogKind] = useState<SalaryComponentKind | null>(null)
    const [componentToEdit, setComponentToEdit] = useState<SalaryComponent | null>(null)
    const [toDelete, setToDelete] = useState<SalaryComponent | null>(null)

    const earnings = useSalaryComponents('earning')
    const deductions = useSalaryComponents('deduction')
    const benefits = useSalaryComponents('benefit')
    const corrections = useSalaryComponents('correction')

    const del = useDeleteSalaryComponent()
    const update = useUpdateSalaryComponent()

    const kindLabel = (k: SalaryComponentKind) => t(`orgSettings.salaryComponentsTab.kinds.${k}`)

    const handleToggleActive = (c: SalaryComponent) => {
        update.mutate(
            { id: c.id, patch: { isActive: !c.isActive } },
            {
                onSuccess: () => {
                    const key = !c.isActive ? 'activated' : 'deactivated'
                    toast.success(t(`orgSettings.salaryComponentsTab.toast.${key}`, { name: c.name }))
                },
            },
        )
    }

    const handleDelete = () => {
        if (!toDelete) return
        del.mutate(toDelete.id, {
            onSuccess: () => {
                toast.success(t('orgSettings.salaryComponentsTab.toast.deleted', { name: toDelete.name }))
                setToDelete(null)
            },
            onError: () => setToDelete(null),
        })
    }

    return (
        <Section
            icon={Coins}
            title={t('orgSettings.salaryComponentsTab.title')}
            description={t('orgSettings.salaryComponentsTab.description')}
            action={
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button size="sm" leftIcon={<Plus className="size-3.5" />}>
                            {t('orgSettings.salaryComponentsTab.addComponent')}
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" sideOffset={6} className="w-44">
                        {(['earning', 'correction', 'benefit', 'deduction'] as SalaryComponentKind[]).map((k) => {
                            const Icon = KIND_ICONS[k]
                            return (
                                <DropdownMenuItem
                                    key={k}
                                    onClick={() => {
                                        setComponentToEdit(null)
                                        setDialogKind(k)
                                    }}
                                    className="gap-2 text-sm"
                                >
                                    <Icon className="size-3.5" />
                                    {kindLabel(k)}
                                </DropdownMenuItem>
                            )
                        })}
                    </DropdownMenuContent>
                </DropdownMenu>
            }
        >
            <Tabs value={tab} onValueChange={(v) => setTab(v as SalaryComponentKind)}>
                <TabsList className="bg-muted/60">
                    <TabsTrigger value="earning" className="gap-1.5 text-sm">
                        <Banknote className="h-3.5 w-3.5" /> {t('orgSettings.salaryComponentsTab.tabs.earnings')}
                    </TabsTrigger>
                    <TabsTrigger value="deduction" className="gap-1.5 text-sm">
                        <FileMinus className="h-3.5 w-3.5" /> {t('orgSettings.salaryComponentsTab.tabs.deductions')}
                    </TabsTrigger>
                    <TabsTrigger value="benefit" className="gap-1.5 text-sm">
                        <HeartPulse className="h-3.5 w-3.5" /> {t('orgSettings.salaryComponentsTab.tabs.benefits')}
                    </TabsTrigger>
                    <TabsTrigger value="correction" className="gap-1.5 text-sm">
                        <RefreshCcw className="h-3.5 w-3.5" /> {t('orgSettings.salaryComponentsTab.tabs.corrections')}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="earning" className="mt-4">
                    <ComponentList
                        kind="earning"
                        items={earnings.data ?? []}
                        loading={earnings.isLoading}
                        onEdit={(c) => { setDialogKind(c.kind); setComponentToEdit(c) }}
                        onDelete={(c) => setToDelete(c)}
                        onToggle={handleToggleActive}
                    />
                </TabsContent>
                <TabsContent value="deduction" className="mt-4">
                    <ComponentList
                        kind="deduction"
                        items={deductions.data ?? []}
                        loading={deductions.isLoading}
                        onEdit={(c) => { setDialogKind(c.kind); setComponentToEdit(c) }}
                        onDelete={(c) => setToDelete(c)}
                        onToggle={handleToggleActive}
                    />
                </TabsContent>
                <TabsContent value="benefit" className="mt-4">
                    <ComponentList
                        kind="benefit"
                        items={benefits.data ?? []}
                        loading={benefits.isLoading}
                        onEdit={(c) => { setDialogKind(c.kind); setComponentToEdit(c) }}
                        onDelete={(c) => setToDelete(c)}
                        onToggle={handleToggleActive}
                    />
                </TabsContent>
                <TabsContent value="correction" className="mt-4">
                    <ComponentList
                        kind="correction"
                        items={corrections.data ?? []}
                        loading={corrections.isLoading}
                        onEdit={(c) => { setDialogKind(c.kind); setComponentToEdit(c) }}
                        onDelete={(c) => setToDelete(c)}
                        onToggle={handleToggleActive}
                    />
                </TabsContent>
            </Tabs>

            {dialogKind && (
                <ComponentDialog
                    kind={dialogKind}
                    existing={componentToEdit}
                    onClose={() => { setDialogKind(null); setComponentToEdit(null) }}
                />
            )}

            <ConfirmDialog
                open={!!toDelete}
                onOpenChange={(o) => { if (!del.isPending && !o) setToDelete(null) }}
                title={toDelete ? t('orgSettings.salaryComponentsTab.confirm.deleteTitle', { name: toDelete.name }) : ''}
                description={t('orgSettings.salaryComponentsTab.confirm.deleteDesc')}
                confirmLabel={del.isPending
                    ? t('orgSettings.salaryComponentsTab.confirm.deleting')
                    : t('orgSettings.salaryComponentsTab.confirm.delete')}
                cancelLabel={t('orgSettings.salaryComponentsTab.confirm.cancel')}
                onConfirm={handleDelete}
                variant="destructive"
            />
        </Section>
    )
}

// ─── List ─────────────────────────────────────────────────────────────────

function ComponentList({
    kind, items, loading, onEdit, onDelete, onToggle,
}: {
    kind: SalaryComponentKind
    items: SalaryComponent[]
    loading: boolean
    onEdit: (c: SalaryComponent) => void
    onDelete: (c: SalaryComponent) => void
    onToggle: (c: SalaryComponent) => void
}) {
    const { t } = useTranslation()
    const categoryLabel = (c: string) => t(`orgSettings.salaryComponentsTab.categories.${c}`, { defaultValue: c })

    if (loading) {
        return (
            <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
        )
    }
    if (items.length === 0) {
        const emptyKey = {
            earning: 'noEarnings', deduction: 'noDeductions',
            benefit: 'noBenefits', correction: 'noCorrections',
        }[kind]
        return (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
                <Sparkles className="size-6 text-muted-foreground/40" />
                <p className="text-sm font-medium">{t(`orgSettings.salaryComponentsTab.empty.${emptyKey}`)}</p>
                <p className="text-xs text-muted-foreground">
                    {t('orgSettings.salaryComponentsTab.empty.hint', {
                        kind: t(`orgSettings.salaryComponentsTab.kinds.${kind}`).toLowerCase(),
                    })}
                </p>
            </div>
        )
    }

    const categoryHeader = kind === 'earning'
        ? t('orgSettings.salaryComponentsTab.table.category')
        : kind === 'benefit'
            ? t('orgSettings.salaryComponentsTab.table.benefitType')
            : kind === 'correction'
                ? t('orgSettings.salaryComponentsTab.table.correctionType')
                : t('orgSettings.salaryComponentsTab.table.deductionType')

    const detailHeader = kind === 'earning'
        ? t('orgSettings.salaryComponentsTab.table.payTypeAmount')
        : t('orgSettings.salaryComponentsTab.table.frequency')

    return (
        <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                        <th className="px-4 py-2.5 text-left font-medium">{t('orgSettings.salaryComponentsTab.table.name')}</th>
                        <th className="px-4 py-2.5 text-left font-medium">{categoryHeader}</th>
                        <th className="px-4 py-2.5 text-left font-medium">{detailHeader}</th>
                        <th className="px-4 py-2.5 text-left font-medium">{t('orgSettings.salaryComponentsTab.table.status')}</th>
                        <th className="px-4 py-2.5 text-right font-medium">{t('orgSettings.salaryComponentsTab.table.actions')}</th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {items.map((c) => (
                        <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3">
                                <div className="font-medium">{c.name}</div>
                                {c.nameInPayslip !== c.name && (
                                    <div className="text-[11px] text-muted-foreground">
                                        {t('orgSettings.salaryComponentsTab.table.payslipPrefix', { name: c.nameInPayslip })}
                                    </div>
                                )}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                                {categoryLabel(c.category)}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                                {kind === 'earning' ? (
                                    <span className="inline-flex items-center gap-1.5">
                                        <Badge variant="outline" className="text-[10px] uppercase">
                                            {c.payType ?? '—'}
                                        </Badge>
                                        {c.amount != null && (
                                            <span className="tabular-nums">
                                                {c.calculationType === 'percentage_of_basic'
                                                    ? t('orgSettings.salaryComponentsTab.table.percentOfBasic', { value: Number(c.amount) })
                                                    : formatCurrency(Number(c.amount))}
                                            </span>
                                        )}
                                    </span>
                                ) : (
                                    <Badge variant="outline" className="text-[10px] uppercase">
                                        {c.frequency === 'one_time'
                                            ? t('orgSettings.salaryComponentsTab.table.oneTime')
                                            : c.frequency === 'recurring'
                                                ? t('orgSettings.salaryComponentsTab.table.recurring')
                                                : '—'}
                                    </Badge>
                                )}
                            </td>
                            <td className="px-4 py-3">
                                <button
                                    type="button"
                                    onClick={() => onToggle(c)}
                                    className={cn(
                                        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors',
                                        c.isActive
                                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300'
                                            : 'bg-muted text-muted-foreground hover:bg-muted/70',
                                    )}
                                    title={t('orgSettings.salaryComponentsTab.table.toggleHint')}
                                >
                                    {c.isActive ? <CheckCircle2 className="size-3" /> : <Circle className="size-3" />}
                                    {c.isActive
                                        ? t('orgSettings.salaryComponentsTab.table.active')
                                        : t('orgSettings.salaryComponentsTab.table.inactive')}
                                </button>
                            </td>
                            <td className="px-4 py-3 text-right">
                                <div className="inline-flex items-center gap-1">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-7"
                                        onClick={() => onEdit(c)}
                                        title={t('orgSettings.salaryComponentsTab.table.edit')}
                                    >
                                        <Pencil className="size-3.5" />
                                    </Button>
                                    {!c.isSystem ? (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="size-7 text-muted-foreground hover:text-rose-600"
                                            onClick={() => onDelete(c)}
                                            title={t('orgSettings.salaryComponentsTab.table.delete')}
                                        >
                                            <Trash2 className="size-3.5" />
                                        </Button>
                                    ) : (
                                        <span title={t('orgSettings.salaryComponentsTab.table.systemComponent')}>
                                            <Crown className="size-3.5 text-amber-500" />
                                        </span>
                                    )}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

// ─── Create / Edit dialog ─────────────────────────────────────────────────

function ComponentDialog({
    kind, existing, onClose,
}: {
    kind: SalaryComponentKind
    existing: SalaryComponent | null
    onClose: () => void
}) {
    const { t } = useTranslation()
    const create = useCreateSalaryComponent()
    const update = useUpdateSalaryComponent()
    const isEditing = !!existing
    const isPending = create.isPending || update.isPending

    // Default the social-security scheme list per the Zoho reference — the
    // most common GCC schemes ticked by default for new earnings.
    const defaultSchemes: SocialSecurityScheme[] = ['GPSSA', 'ADPF', 'SIO', 'SPF', 'PIFSS']

    const [category, setCategory] = useState<string>(
        existing?.category ?? (kind === 'earning' ? 'custom_allowance' : KIND_CATEGORIES[kind][0]),
    )
    const [name, setName] = useState(existing?.name ?? '')
    const [nameInPayslip, setNameInPayslip] = useState(existing?.nameInPayslip ?? '')
    const [nameInPayslipAr, setNameInPayslipAr] = useState(existing?.nameInPayslipAr ?? '')
    const [payType, setPayType] = useState<'fixed' | 'variable'>(existing?.payType ?? 'fixed')
    const [calculationType, setCalculationType] = useState<'flat' | 'percentage_of_basic'>(
        existing?.calculationType ?? 'flat',
    )
    const [amount, setAmount] = useState<string>(existing?.amount ?? '')
    const [proRata, setProRata] = useState(existing?.proRata ?? true)
    const [frequency, setFrequency] = useState<'one_time' | 'recurring'>(
        existing?.frequency ?? 'one_time',
    )
    // Default new components to active so they're discoverable in payroll
    // immediately. Matches the seeded defaults; HR can still deactivate.
    const [isActive, setIsActive] = useState(existing?.isActive ?? true)
    const [schemes, setSchemes] = useState<SocialSecurityScheme[]>(
        existing?.applicableSocialSecurity ?? defaultSchemes,
    )

    // Auto-sync the payslip name when the user types the display name — only
    // before they've touched the payslip field themselves. Tracking via a
    // "synced" flag keeps the UX feeling smart without trapping the user.
    const [payslipDirty, setPayslipDirty] = useState(!!existing)
    const setNameSmart = (v: string) => {
        setName(v)
        if (!payslipDirty) setNameInPayslip(v)
    }

    const categories = KIND_CATEGORIES[kind]
    const kindLabel = t(`orgSettings.salaryComponentsTab.kinds.${kind}`)
    const dialogTitle = isEditing
        ? t('orgSettings.salaryComponentsTab.dialog.titleEdit', { kind: kindLabel })
        : t('orgSettings.salaryComponentsTab.dialog.titleNew', { kind: kindLabel })

    const categoryLabel = (c: string) => t(`orgSettings.salaryComponentsTab.categories.${c}`, { defaultValue: c })

    const toggleScheme = (s: SocialSecurityScheme) =>
        setSchemes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))

    const handleSave = () => {
        const body: CreateSalaryComponentBody = {
            kind,
            category,
            name: name.trim(),
            nameInPayslip: nameInPayslip.trim() || name.trim(),
            nameInPayslipAr: nameInPayslipAr.trim() || null,
            payType: kind === 'earning' ? payType : null,
            calculationType: kind === 'earning' ? calculationType : null,
            amount: amount && Number.isFinite(Number(amount)) ? Number(amount) : null,
            proRata,
            applicableSocialSecurity: kind === 'earning' ? schemes : [],
            frequency: (kind === 'deduction' || kind === 'benefit') ? frequency : null,
            isActive,
        }
        const opts = {
            onSuccess: () => {
                toast.success(t(isEditing
                    ? 'orgSettings.salaryComponentsTab.toast.updated'
                    : 'orgSettings.salaryComponentsTab.toast.added'))
                onClose()
            },
        }
        if (isEditing) {
            // Drop `kind` from the PATCH body — the server schema omits it
            // and it's an immutable field on the row anyway.
            const { kind: _omit, ...patch } = body
            update.mutate({ id: existing.id, patch }, opts)
        } else {
            create.mutate(body, opts)
        }
    }

    const canSubmit = useMemo(() => {
        if (!name.trim()) return false
        if (kind === 'earning' && !calculationType) return false
        return true
    }, [name, kind, calculationType])

    // Earnings need both the field column AND the social-security column side
    // by side; bump width up to ~5xl on lg+ so neither column gets squeezed.
    // Other kinds only have the field column so 2xl is plenty.
    const dialogWidth = kind === 'earning' ? 'sm:max-w-5xl' : 'sm:max-w-2xl'

    const categoryFieldLabel = kind === 'earning'
        ? t('orgSettings.salaryComponentsTab.dialog.earningType')
        : kind === 'correction'
            ? t('orgSettings.salaryComponentsTab.dialog.correctionType')
            : t('orgSettings.salaryComponentsTab.dialog.category')

    return (
        <Dialog open onOpenChange={(o) => { if (!o && !isPending) onClose() }}>
            <DialogContent className={cn('w-[95vw] max-h-[90vh] overflow-y-auto', dialogWidth)}>
                <DialogHeader>
                    <DialogTitle>{dialogTitle}</DialogTitle>
                    <DialogDescription>
                        {kind === 'earning' && t('orgSettings.salaryComponentsTab.dialog.descEarning')}
                        {kind === 'deduction' && t('orgSettings.salaryComponentsTab.dialog.descDeduction')}
                        {kind === 'benefit' && t('orgSettings.salaryComponentsTab.dialog.descBenefit')}
                        {kind === 'correction' && t('orgSettings.salaryComponentsTab.dialog.descCorrection')}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 sm:grid-cols-2">
                    {/* Left column — core fields */}
                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <Label>
                                {categoryFieldLabel}
                                <span className="text-destructive"> *</span>
                            </Label>
                            <Select value={category} onValueChange={setCategory} disabled={isEditing}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {categories.map((c) => (
                                        <SelectItem key={c} value={c}>{categoryLabel(c)}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label>{t('orgSettings.salaryComponentsTab.dialog.name')} <span className="text-destructive">*</span></Label>
                            <Input
                                value={name}
                                onChange={(e) => setNameSmart(e.target.value)}
                                placeholder={t('orgSettings.salaryComponentsTab.dialog.namePlaceholder', {
                                    example: categoryLabel(category),
                                })}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label>{t('orgSettings.salaryComponentsTab.dialog.nameInPayslip')} <span className="text-destructive">*</span></Label>
                            <Input
                                value={nameInPayslip}
                                onChange={(e) => { setNameInPayslip(e.target.value); setPayslipDirty(true) }}
                                placeholder={t('orgSettings.salaryComponentsTab.dialog.nameInPayslipPlaceholder')}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label>{t('orgSettings.salaryComponentsTab.dialog.nameInPayslipAr')}</Label>
                            <Input
                                value={nameInPayslipAr ?? ''}
                                onChange={(e) => setNameInPayslipAr(e.target.value)}
                                placeholder={t('orgSettings.salaryComponentsTab.dialog.nameInPayslipArPlaceholder')}
                                dir="rtl"
                            />
                        </div>

                        {/* Earning-only inputs */}
                        {kind === 'earning' && (
                            <>
                                <fieldset className="space-y-1.5">
                                    <Label>{t('orgSettings.salaryComponentsTab.dialog.payType')} <span className="text-destructive">*</span></Label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <RadioCard
                                            label={t('orgSettings.salaryComponentsTab.dialog.payTypeFixed')}
                                            help={t('orgSettings.salaryComponentsTab.dialog.payTypeFixedHelp')}
                                            selected={payType === 'fixed'}
                                            onClick={() => setPayType('fixed')}
                                        />
                                        <RadioCard
                                            label={t('orgSettings.salaryComponentsTab.dialog.payTypeVariable')}
                                            help={t('orgSettings.salaryComponentsTab.dialog.payTypeVariableHelp')}
                                            selected={payType === 'variable'}
                                            onClick={() => setPayType('variable')}
                                        />
                                    </div>
                                </fieldset>

                                <fieldset className="space-y-1.5">
                                    <Label>{t('orgSettings.salaryComponentsTab.dialog.calculation')} <span className="text-destructive">*</span></Label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <RadioCard
                                            label={t('orgSettings.salaryComponentsTab.dialog.calcFlat')}
                                            help={t('orgSettings.salaryComponentsTab.dialog.calcFlatHelp')}
                                            selected={calculationType === 'flat'}
                                            onClick={() => setCalculationType('flat')}
                                        />
                                        <RadioCard
                                            label={t('orgSettings.salaryComponentsTab.dialog.calcPercentage')}
                                            help={t('orgSettings.salaryComponentsTab.dialog.calcPercentageHelp')}
                                            selected={calculationType === 'percentage_of_basic'}
                                            onClick={() => setCalculationType('percentage_of_basic')}
                                        />
                                    </div>
                                </fieldset>

                                <div className="space-y-1.5">
                                    <Label>
                                        {calculationType === 'percentage_of_basic'
                                            ? t('orgSettings.salaryComponentsTab.dialog.percentage')
                                            : t('orgSettings.salaryComponentsTab.dialog.amountAed')}
                                    </Label>
                                    <NumericInput
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        placeholder={calculationType === 'percentage_of_basic'
                                            ? t('orgSettings.salaryComponentsTab.dialog.percentagePlaceholder')
                                            : t('orgSettings.salaryComponentsTab.dialog.amountPlaceholder')}
                                        maxDecimals={2}
                                    />
                                </div>

                                <label className="flex items-start gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={proRata}
                                        onChange={(e) => setProRata(e.target.checked)}
                                        className="mt-0.5 size-4 accent-primary"
                                    />
                                    <span>
                                        {t('orgSettings.salaryComponentsTab.dialog.proRata')}
                                        <span className="block text-[11px] text-muted-foreground">
                                            {t('orgSettings.salaryComponentsTab.dialog.proRataHelp')}
                                        </span>
                                    </span>
                                </label>
                            </>
                        )}

                        {/* Deduction / Benefit frequency */}
                        {(kind === 'deduction' || kind === 'benefit') && (
                            <fieldset className="space-y-1.5">
                                <Label>{t('orgSettings.salaryComponentsTab.dialog.frequency')} <span className="text-destructive">*</span></Label>
                                <div className="grid grid-cols-2 gap-2">
                                    <RadioCard
                                        label={t('orgSettings.salaryComponentsTab.dialog.freqOneTime')}
                                        help={t('orgSettings.salaryComponentsTab.dialog.freqOneTimeHelp')}
                                        selected={frequency === 'one_time'}
                                        onClick={() => setFrequency('one_time')}
                                    />
                                    <RadioCard
                                        label={t('orgSettings.salaryComponentsTab.dialog.freqRecurring')}
                                        help={t('orgSettings.salaryComponentsTab.dialog.freqRecurringHelp')}
                                        selected={frequency === 'recurring'}
                                        onClick={() => setFrequency('recurring')}
                                    />
                                </div>
                            </fieldset>
                        )}

                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={isActive}
                                onChange={(e) => setIsActive(e.target.checked)}
                                className="size-4 accent-primary"
                            />
                            {t('orgSettings.salaryComponentsTab.dialog.markActive')}
                        </label>
                    </div>

                    {/* Right column — social security (earning only) */}
                    {kind === 'earning' && (
                        <div className="space-y-3">
                            <div>
                                <p className="text-sm font-semibold">
                                    {t('orgSettings.salaryComponentsTab.dialog.schemesTitle')}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {t('orgSettings.salaryComponentsTab.dialog.schemesDesc')}
                                </p>
                            </div>
                            <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                                {SOCIAL_SECURITY_SCHEMES.map((s) => (
                                    <label key={s} className="flex items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            checked={schemes.includes(s)}
                                            onChange={() => toggleScheme(s)}
                                            className="size-4 accent-primary"
                                        />
                                        <span className="font-medium">{s}</span>
                                        <span className="text-[11px] text-muted-foreground">
                                            {t(`orgSettings.salaryComponentsTab.schemes.${s}`)}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="mt-4 rounded-md border border-amber-200/70 bg-amber-50/60 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                    <strong>{t('orgSettings.salaryComponentsTab.dialog.headsUp')}</strong>{' '}
                    {t('orgSettings.salaryComponentsTab.dialog.headsUpBody')}
                </div>

                <div className="mt-4 flex items-center justify-end gap-2">
                    <Button variant="ghost" onClick={onClose} disabled={isPending}>
                        <X className="size-3.5" /> {t('orgSettings.salaryComponentsTab.dialog.cancel')}
                    </Button>
                    <Button onClick={handleSave} loading={isPending} disabled={!canSubmit}>
                        <FileText className="size-3.5" />{' '}
                        {isEditing
                            ? t('orgSettings.salaryComponentsTab.dialog.saveChanges')
                            : t('orgSettings.salaryComponentsTab.dialog.save')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

function RadioCard({
    label, help, selected, onClick,
}: {
    label: string; help: string; selected: boolean; onClick: () => void
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'rounded-lg border px-3 py-2 text-left text-sm transition-all',
                selected
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                    : 'border-border hover:border-primary/40',
            )}
            aria-pressed={selected}
        >
            <div className="flex items-center justify-between">
                <span className="font-medium">{label}</span>
                {selected && <Briefcase className="size-3 text-primary" />}
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{help}</p>
        </button>
    )
}
