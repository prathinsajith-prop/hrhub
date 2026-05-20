/**
 * Salary Components configuration tab.
 *
 * Tenant-wide catalog of earning / deduction / benefit / correction templates,
 * laid out as three sub-tabs (matching the Zoho Payroll reference). Adding a
 * component opens a kind-specific form via the unified `<Add Component>` menu
 * — fields swap based on what's being created.
 */
import { useMemo, useState } from 'react'
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

// Friendlier category labels for the UI — DB stores snake_case.
const CATEGORY_LABELS: Record<string, string> = {
    basic: 'Basic', housing: 'Housing Allowance', transport: 'Transport Allowance',
    cost_of_living: 'Cost of Living Allowance', children_social: 'Children Social Allowance',
    social: 'Social Allowance', custom_allowance: 'Custom Allowance',
    withheld_salary: 'Withheld Salary', salary_advance: 'Salary Advance',
    fines_damages: 'Fines and Damages', notice_pay: 'Notice Pay', custom: 'Custom',
    medical_insurance: 'Medical Insurance',
    bonus: 'Bonus', commission: 'Commission', leave_encashment: 'Leave Encashment',
    annual_leave_salary: 'Annual Leave Salary',
}

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

const KIND_LABELS: Record<SalaryComponentKind, string> = {
    earning: 'Earning',
    deduction: 'Deduction',
    benefit: 'Benefit',
    correction: 'Correction',
}

export function SalaryComponentsTab() {
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

    const del = useDeleteSalaryComponent()
    const update = useUpdateSalaryComponent()

    const handleToggleActive = (c: SalaryComponent) => {
        update.mutate(
            { id: c.id, patch: { isActive: !c.isActive } },
            {
                onSuccess: () => toast.success(`${c.name} ${!c.isActive ? 'activated' : 'deactivated'}`),
            },
        )
    }

    const handleDelete = () => {
        if (!toDelete) return
        del.mutate(toDelete.id, {
            onSuccess: () => {
                toast.success(`${toDelete.name} deleted`)
                setToDelete(null)
            },
            onError: () => setToDelete(null),
        })
    }

    return (
        <Section
            icon={Coins}
            title="Salary Components"
            description="Catalog of earning, deduction, benefit, and correction templates used across payroll."
            action={
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button size="sm" leftIcon={<Plus className="size-3.5" />}>Add Component</Button>
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
                                    {KIND_LABELS[k]}
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
                        <Banknote className="h-3.5 w-3.5" /> Earnings
                    </TabsTrigger>
                    <TabsTrigger value="deduction" className="gap-1.5 text-sm">
                        <FileMinus className="h-3.5 w-3.5" /> Deductions
                    </TabsTrigger>
                    <TabsTrigger value="benefit" className="gap-1.5 text-sm">
                        <HeartPulse className="h-3.5 w-3.5" /> Benefits
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
                title={toDelete ? `Delete "${toDelete.name}"?` : ''}
                description="This component will no longer appear when adjusting payroll. Existing payslips that already used it stay unchanged."
                confirmLabel={del.isPending ? 'Deleting…' : 'Delete'}
                cancelLabel="Cancel"
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
    if (loading) {
        return (
            <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
        )
    }
    if (items.length === 0) {
        return (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
                <Sparkles className="size-6 text-muted-foreground/40" />
                <p className="text-sm font-medium">No {kind}s yet</p>
                <p className="text-xs text-muted-foreground">
                    Add your first {KIND_LABELS[kind].toLowerCase()} using the button above.
                </p>
            </div>
        )
    }

    return (
        <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                        <th className="px-4 py-2.5 text-left font-medium">Name</th>
                        <th className="px-4 py-2.5 text-left font-medium">
                            {kind === 'earning' ? 'Category' : kind === 'benefit' ? 'Benefit Type' : 'Deduction Type'}
                        </th>
                        <th className="px-4 py-2.5 text-left font-medium">
                            {kind === 'earning' ? 'Pay Type · Amount' : 'Frequency'}
                        </th>
                        <th className="px-4 py-2.5 text-left font-medium">Status</th>
                        <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {items.map((c) => (
                        <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3">
                                <div className="font-medium">{c.name}</div>
                                {c.nameInPayslip !== c.name && (
                                    <div className="text-[11px] text-muted-foreground">
                                        Payslip: {c.nameInPayslip}
                                    </div>
                                )}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                                {CATEGORY_LABELS[c.category] ?? c.category}
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
                                                    ? `${Number(c.amount)}% of basic`
                                                    : formatCurrency(Number(c.amount))}
                                            </span>
                                        )}
                                    </span>
                                ) : (
                                    <Badge variant="outline" className="text-[10px] uppercase">
                                        {c.frequency === 'one_time' ? 'One Time' : c.frequency === 'recurring' ? 'Recurring' : '—'}
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
                                    title="Click to toggle"
                                >
                                    {c.isActive ? <CheckCircle2 className="size-3" /> : <Circle className="size-3" />}
                                    {c.isActive ? 'Active' : 'Inactive'}
                                </button>
                            </td>
                            <td className="px-4 py-3 text-right">
                                <div className="inline-flex items-center gap-1">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-7"
                                        onClick={() => onEdit(c)}
                                        title="Edit"
                                    >
                                        <Pencil className="size-3.5" />
                                    </Button>
                                    {!c.isSystem ? (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="size-7 text-muted-foreground hover:text-rose-600"
                                            onClick={() => onDelete(c)}
                                            title="Delete"
                                        >
                                            <Trash2 className="size-3.5" />
                                        </Button>
                                    ) : (
                                        <span title="System component — cannot be deleted">
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
    const [isActive, setIsActive] = useState(existing?.isActive ?? false)
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
    const dialogTitle = isEditing
        ? `Edit ${KIND_LABELS[kind]}`
        : `New ${KIND_LABELS[kind]}`

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
                toast.success(isEditing ? 'Component updated' : 'Component added')
                onClose()
            },
        }
        if (isEditing) {
            update.mutate({ id: existing.id, patch: body }, opts)
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

    return (
        <Dialog open onOpenChange={(o) => { if (!o && !isPending) onClose() }}>
            <DialogContent className={cn('w-[95vw] max-h-[90vh] overflow-y-auto', dialogWidth)}>
                <DialogHeader>
                    <DialogTitle>{dialogTitle}</DialogTitle>
                    <DialogDescription>
                        {kind === 'earning' && 'Defines a recurring or one-off earning that appears on payslips.'}
                        {kind === 'deduction' && 'A deduction line that HR can apply on a specific payroll run.'}
                        {kind === 'benefit' && 'A non-cash or scheduled benefit (e.g. medical insurance) tracked alongside payroll.'}
                        {kind === 'correction' && 'A one-off correction such as a bonus, commission, or leave encashment.'}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 sm:grid-cols-2">
                    {/* Left column — core fields */}
                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <Label>
                                {kind === 'earning' ? 'Earning Type' : kind === 'correction' ? 'Correction Type' : 'Category'}
                                <span className="text-destructive"> *</span>
                            </Label>
                            <Select value={category} onValueChange={setCategory} disabled={isEditing}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {categories.map((c) => (
                                        <SelectItem key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label>Name <span className="text-destructive">*</span></Label>
                            <Input value={name} onChange={(e) => setNameSmart(e.target.value)} placeholder={`e.g. ${CATEGORY_LABELS[category] ?? 'Allowance'}`} />
                        </div>

                        <div className="space-y-1.5">
                            <Label>Name in payslip <span className="text-destructive">*</span></Label>
                            <Input
                                value={nameInPayslip}
                                onChange={(e) => { setNameInPayslip(e.target.value); setPayslipDirty(true) }}
                                placeholder="Printed on the payslip"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label>Name in payslip (Arabic)</Label>
                            <Input
                                value={nameInPayslipAr ?? ''}
                                onChange={(e) => setNameInPayslipAr(e.target.value)}
                                placeholder="optional — Arabic display"
                                dir="rtl"
                            />
                        </div>

                        {/* Earning-only inputs */}
                        {kind === 'earning' && (
                            <>
                                <fieldset className="space-y-1.5">
                                    <Label>Pay type <span className="text-destructive">*</span></Label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <RadioCard
                                            label="Fixed"
                                            help="Same amount every month"
                                            selected={payType === 'fixed'}
                                            onClick={() => setPayType('fixed')}
                                        />
                                        <RadioCard
                                            label="Variable"
                                            help="Differs per payroll"
                                            selected={payType === 'variable'}
                                            onClick={() => setPayType('variable')}
                                        />
                                    </div>
                                </fieldset>

                                <fieldset className="space-y-1.5">
                                    <Label>Calculation <span className="text-destructive">*</span></Label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <RadioCard
                                            label="Flat amount"
                                            help="Fixed AED value"
                                            selected={calculationType === 'flat'}
                                            onClick={() => setCalculationType('flat')}
                                        />
                                        <RadioCard
                                            label="% of basic"
                                            help="Percentage of basic salary"
                                            selected={calculationType === 'percentage_of_basic'}
                                            onClick={() => setCalculationType('percentage_of_basic')}
                                        />
                                    </div>
                                </fieldset>

                                <div className="space-y-1.5">
                                    <Label>
                                        {calculationType === 'percentage_of_basic' ? 'Percentage' : 'Amount (AED)'}
                                    </Label>
                                    <NumericInput
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        placeholder={calculationType === 'percentage_of_basic' ? '0–100' : '0.00'}
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
                                        Calculate on pro-rata basis
                                        <span className="block text-[11px] text-muted-foreground">
                                            Reduce automatically when employees joined or left mid-month.
                                        </span>
                                    </span>
                                </label>
                            </>
                        )}

                        {/* Deduction / Benefit frequency */}
                        {(kind === 'deduction' || kind === 'benefit') && (
                            <fieldset className="space-y-1.5">
                                <Label>Frequency <span className="text-destructive">*</span></Label>
                                <div className="grid grid-cols-2 gap-2">
                                    <RadioCard
                                        label="One-time"
                                        help="Applied on a single payroll"
                                        selected={frequency === 'one_time'}
                                        onClick={() => setFrequency('one_time')}
                                    />
                                    <RadioCard
                                        label="Recurring"
                                        help="Every payroll until deactivated"
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
                            Mark as active
                        </label>
                    </div>

                    {/* Right column — social security (earning only) */}
                    {kind === 'earning' && (
                        <div className="space-y-3">
                            <div>
                                <p className="text-sm font-semibold">Applicable Social Security Benefits</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Schemes that include this earning when computing employer and employee contributions.
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
                                            {SCHEME_NAMES[s]}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="mt-4 rounded-md border border-amber-200/70 bg-amber-50/60 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                    <strong>Heads up:</strong> Once you associate this component with an employee or a processed payslip, only the name and amount stay editable. Amount changes apply only to new payroll runs.
                </div>

                <div className="mt-4 flex items-center justify-end gap-2">
                    <Button variant="ghost" onClick={onClose} disabled={isPending}>
                        <X className="size-3.5" /> Cancel
                    </Button>
                    <Button onClick={handleSave} loading={isPending} disabled={!canSubmit}>
                        <FileText className="size-3.5" /> {isEditing ? 'Save changes' : 'Save'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

// Friendly long-form names for the social-security pickers.
const SCHEME_NAMES: Record<SocialSecurityScheme, string> = {
    GPSSA: 'General Pension And Social Security Authority',
    ADPF: 'Abu Dhabi Pension Fund',
    GOSI: 'General Organization for Social Insurance',
    SIO: 'Social Insurance Organization',
    SPF: 'Social Protection Fund',
    PIFSS: 'Public Institution for Social Security',
    GRSIA: 'General Retirement and Social Insurance Authority',
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
