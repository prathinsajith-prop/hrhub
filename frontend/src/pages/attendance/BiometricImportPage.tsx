/**
 * Biometric mapping + attendance import page.
 *
 * Two tabs on one surface — mirrors the Zoho-style "Biometric ID mapping" /
 * "Check-in/out Import & Export" header from the reference screenshot:
 *
 *   • Biometric ID mapping  — list + add + remove employee↔device mappings
 *   • Check-in/out import   — upload an Excel file, preview, commit
 *
 * Both tabs respect the same scope: HR-only. The router-level guard already
 * locks the page; we just hide nothing here.
 */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Fingerprint, Upload, ArrowLeft, Plus, Trash2, Loader2, FileSpreadsheet,
    CheckCircle2, XCircle, AlertCircle, Copy, Download, X, Send, Pencil,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge, Card, Input, Label, Separator } from '@/components/ui/primitives'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
    ConfirmDialog, toast,
} from '@/components/ui/overlays'
import { EmployeeSelect } from '@/components/shared'
import { api } from '@/lib/api'
import { cn, formatDate } from '@/lib/utils'
import {
    useBiometricMappings, useCreateMapping, useUpdateMapping, useDeleteMapping,
    useValidateAttendanceImport, useCommitAttendanceImport,
    type BiometricMapping, type AttendanceImportRow, type AttendanceImportRowResult,
    type AttendanceImportValidateResult,
} from '@/hooks/useBiometric'

export default function BiometricImportPage() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    return (
        <PageWrapper>
            <PageHeader
                title={t('biometric.title', 'Attendance integrations')}
                description={t('biometric.subtitle', 'Map biometric device IDs to employees and bulk-import punch records')}
                actions={
                    <Button variant="ghost" size="sm" onClick={() => navigate('/attendance')} className="gap-1.5">
                        <ArrowLeft className="size-4" />
                        {t('biometric.back', 'Back to attendance')}
                    </Button>
                }
            />

            <Tabs defaultValue="mapping" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="mapping" className="gap-1.5">
                        <Fingerprint className="size-3.5" />
                        {t('biometric.tabs.mapping', 'Biometric ID mapping')}
                    </TabsTrigger>
                    <TabsTrigger value="import" className="gap-1.5">
                        <Upload className="size-3.5" />
                        {t('biometric.tabs.import', 'Check-in/out Import')}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="mapping" className="space-y-4">
                    <BiometricMappingTab />
                </TabsContent>

                <TabsContent value="import" className="space-y-4">
                    <AttendanceImportTab />
                </TabsContent>
            </Tabs>
        </PageWrapper>
    )
}

// ─── Biometric ID mapping ───────────────────────────────────────────────────

function BiometricMappingTab() {
    const { t } = useTranslation()
    const { data, isLoading } = useBiometricMappings()
    const remove = useDeleteMapping()
    const [addOpen, setAddOpen] = useState(false)
    const [editing, setEditing] = useState<BiometricMapping | null>(null)
    const [removing, setRemoving] = useState<BiometricMapping | null>(null)
    const rows = data ?? []

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-sm font-semibold">{t('biometric.mapping.title', 'Employee ↔ device ID mappings')}</h2>
                    <p className="text-[11px] text-muted-foreground">
                        {t('biometric.mapping.subtitle', 'Each row links a biometric device user (or external system ID) to an HRHub employee — so punch imports can resolve which row belongs to which person.')}
                    </p>
                </div>
                <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5 shrink-0">
                    <Plus className="size-4" />
                    {t('biometric.mapping.add', 'Add mapping')}
                </Button>
            </div>

            <Card>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                            <tr>
                                <th className="px-3 py-2 text-left font-medium">{t('biometric.mapping.col.mapperId', 'Mapper ID')}</th>
                                <th className="px-3 py-2 text-left font-medium">{t('biometric.mapping.col.employee', 'Employee')}</th>
                                <th className="px-3 py-2 text-left font-medium">{t('biometric.mapping.col.label', 'Label')}</th>
                                <th className="px-3 py-2 text-left font-medium">{t('biometric.mapping.col.created', 'Added')}</th>
                                <th className="px-3 py-2 text-right font-medium">{t('common.actions', 'Actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {isLoading ? (
                                <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">{t('common.loading', 'Loading...')}</td></tr>
                            ) : rows.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-3 py-12 text-center">
                                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                            <Fingerprint className="size-8 opacity-30" />
                                            <p>{t('biometric.mapping.empty', 'No mappings yet')}</p>
                                            <p className="text-[11px] text-muted-foreground/80 max-w-md">
                                                {t('biometric.mapping.emptyHint', 'Add a mapping for each biometric / device user ID that you want to recognise during punch imports.')}
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            ) : rows.map((r) => (
                                <tr key={r.id} className="hover:bg-muted/30">
                                    <td className="px-3 py-2">
                                        <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold">
                                            <Fingerprint className="size-3 text-muted-foreground" />
                                            {r.mapperId}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="font-medium">{r.employeeName}</div>
                                        <div className="text-[10px] text-muted-foreground">
                                            {r.employeeNo}{r.department ? ` · ${r.department}` : ''}
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.label || '—'}</td>
                                    <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                                        {formatDate(r.createdAt)}
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                        <div className="inline-flex items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => setEditing(r)}
                                                aria-label="Edit mapping"
                                                title={t('common.edit', 'Edit') as string}
                                                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted/40"
                                            >
                                                <Pencil className="size-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setRemoving(r)}
                                                aria-label="Remove mapping"
                                                title={t('common.remove', 'Remove') as string}
                                                className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-800 transition-colors hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300"
                                            >
                                                <Trash2 className="size-3.5" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            <AddMappingDialog open={addOpen} onOpenChange={setAddOpen} />
            <EditMappingDialog
                mapping={editing}
                onClose={() => setEditing(null)}
            />
            <ConfirmDialog
                open={!!removing}
                onOpenChange={(v) => !v && setRemoving(null)}
                title={t('biometric.mapping.removeTitle', 'Remove this mapping?')}
                description={t('biometric.mapping.removeDesc',
                    `Mapper ID '${removing?.mapperId ?? ''}' will no longer resolve to ${removing?.employeeName ?? 'this employee'} during punch imports.`)}
                variant="destructive"
                confirmLabel={t('common.remove', 'Remove')}
                onConfirm={async () => {
                    if (!removing) return
                    await remove.mutateAsync(removing.id)
                    setRemoving(null)
                }}
            />
        </div>
    )
}

function AddMappingDialog({
    open, onOpenChange,
}: {
    open: boolean
    onOpenChange: (v: boolean) => void
}) {
    const { t } = useTranslation()
    const create = useCreateMapping()
    const [employeeId, setEmployeeId] = useState('')
    const [mapperId, setMapperId] = useState('')
    const [label, setLabel] = useState('')

    const reset = () => { setEmployeeId(''); setMapperId(''); setLabel('') }

    const canSubmit = !!employeeId && !!mapperId.trim()
    const handleSubmit = async () => {
        if (!canSubmit) return
        try {
            await create.mutateAsync({
                employeeId,
                mapperId: mapperId.trim(),
                label: label.trim() || null,
            })
            toast.success(t('biometric.mapping.createSuccess', 'Mapping added'))
            reset()
            onOpenChange(false)
        } catch {
            /* hook surfaces the toast */
        }
    }

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
            <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
                <DialogHeader className="space-y-0 p-6 pb-4 border-b bg-gradient-to-br from-sky-50/60 to-indigo-50/40 dark:from-sky-950/20 dark:to-indigo-950/15">
                    <div className="flex items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-sm shadow-indigo-500/20">
                            <Fingerprint className="size-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <DialogTitle className="text-base font-semibold">{t('biometric.mapping.addTitle', 'Add user ID mapping')}</DialogTitle>
                            <DialogDescription className="mt-0.5 text-xs">
                                {t('biometric.mapping.addDesc', 'Link a biometric device user ID (or external system ID) to an HRHub employee.')}
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="px-6 py-4 space-y-4 bg-muted/20">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium">
                            {t('biometric.mapping.field.employee', 'Employee')}
                            <span className="ms-0.5 text-rose-600">*</span>
                        </Label>
                        <EmployeeSelect value={employeeId} onValueChange={setEmployeeId} />
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium">
                            {t('biometric.mapping.field.mapperId', 'Mapper ID')}
                            <span className="ms-0.5 text-rose-600">*</span>
                        </Label>
                        <Input
                            value={mapperId}
                            onChange={(e) => setMapperId(e.target.value)}
                            placeholder={t('biometric.mapping.field.mapperIdPlaceholder', 'e.g. 101, BIO-A1, EMP_007') as string}
                        />
                        <p className="text-[10px] text-muted-foreground">
                            {t('biometric.mapping.field.mapperIdHint', 'The exact ID the device or external system uses for this person.')}
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium">{t('biometric.mapping.field.label', 'Label (optional)')}</Label>
                        <Input
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            placeholder={t('biometric.mapping.field.labelPlaceholder', 'e.g. Office finger reader') as string}
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-2 border-t bg-background px-6 py-3">
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>{t('common.cancel', 'Cancel')}</Button>
                    <Button onClick={handleSubmit} disabled={!canSubmit} loading={create.isPending} className="gap-1.5">
                        <Send className="size-3.5" />
                        {t('biometric.mapping.submit', 'Add mapping')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

/**
 * Edit dialog for an existing mapping. Locks the Employee field (re-binding
 * a mapper_id to a different employee is a delete + create, not an update —
 * historical punches reference the mapping_id, so swapping the employee
 * silently would rewrite history). Mapper_id + label are editable.
 */
function EditMappingDialog({
    mapping,
    onClose,
}: {
    mapping: BiometricMapping | null
    onClose: () => void
}) {
    const { t } = useTranslation()
    const update = useUpdateMapping()
    // Local form state — initialized from the row when the dialog opens.
    // State-during-render syncs back when the parent swaps the target row.
    const [mapperId, setMapperId] = useState('')
    const [label, setLabel] = useState('')
    const [lastId, setLastId] = useState<string | null>(null)
    if (mapping && mapping.id !== lastId) {
        setLastId(mapping.id)
        setMapperId(mapping.mapperId)
        setLabel(mapping.label ?? '')
    }
    if (!mapping && lastId !== null) {
        setLastId(null)
    }

    const trimmed = mapperId.trim()
    const labelTrimmed = label.trim()
    const dirty = !!mapping && (
        trimmed !== mapping.mapperId.trim()
        || labelTrimmed !== (mapping.label ?? '').trim()
    )
    const canSubmit = !!mapping && !!trimmed && dirty

    const handleSubmit = async () => {
        if (!mapping || !canSubmit) return
        try {
            await update.mutateAsync({
                id: mapping.id,
                // Only send fields that changed — keeps the PATCH minimal
                // and avoids triggering an "already mapped" 409 when the
                // mapper_id wasn't touched.
                mapperId: trimmed !== mapping.mapperId.trim() ? trimmed : undefined,
                label: labelTrimmed !== (mapping.label ?? '').trim() ? (labelTrimmed || null) : undefined,
            })
            toast.success(t('biometric.mapping.updateSuccess', 'Mapping updated'))
            onClose()
        } catch {
            /* hook surfaces the toast */
        }
    }

    return (
        <Dialog open={!!mapping} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
                <DialogHeader className="space-y-0 p-6 pb-4 border-b bg-gradient-to-br from-sky-50/60 to-indigo-50/40 dark:from-sky-950/20 dark:to-indigo-950/15">
                    <div className="flex items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-sm shadow-indigo-500/20">
                            <Pencil className="size-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <DialogTitle className="text-base font-semibold">
                                {t('biometric.mapping.editTitle', 'Edit user ID mapping')}
                            </DialogTitle>
                            <DialogDescription className="mt-0.5 text-xs">
                                {t('biometric.mapping.editDesc',
                                    'Rename the mapper ID or update the device label. Re-assigning to a different employee requires removing and recreating the mapping.')}
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="px-6 py-4 space-y-4 bg-muted/20">
                    {/* Read-only employee panel — re-binding the mapping
                        to a different employee would rewrite punch history,
                        so the field is locked. */}
                    {mapping && (
                        <div className="rounded-md border bg-card p-3">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                                {t('biometric.mapping.field.employee', 'Employee')}
                            </div>
                            <div className="font-medium">{mapping.employeeName}</div>
                            <div className="text-[10px] text-muted-foreground">
                                {mapping.employeeNo}{mapping.department ? ` · ${mapping.department}` : ''}
                            </div>
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium">
                            {t('biometric.mapping.field.mapperId', 'Mapper ID')}
                            <span className="ms-0.5 text-rose-600">*</span>
                        </Label>
                        <Input
                            value={mapperId}
                            onChange={(e) => setMapperId(e.target.value)}
                            placeholder={t('biometric.mapping.field.mapperIdPlaceholder', 'e.g. 101, BIO-A1, EMP_007') as string}
                            autoFocus
                        />
                        <p className="text-[10px] text-muted-foreground">
                            {t('biometric.mapping.field.mapperIdHint', 'The exact ID the device or external system uses for this person.')}
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium">{t('biometric.mapping.field.label', 'Label (optional)')}</Label>
                        <Input
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            placeholder={t('biometric.mapping.field.labelPlaceholder', 'e.g. Office finger reader') as string}
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-2 border-t bg-background px-6 py-3">
                    <Button variant="ghost" onClick={onClose}>{t('common.cancel', 'Cancel')}</Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        loading={update.isPending}
                        className="gap-1.5"
                    >
                        <Send className="size-3.5" />
                        {t('biometric.mapping.saveChanges', 'Save changes')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

// ─── Attendance import ──────────────────────────────────────────────────────

type ImportStage = 'idle' | 'parsing' | 'validating' | 'ready' | 'submitting' | 'submitted'

interface ParsedRow extends AttendanceImportRow {
    /** Server verdict — populated after the validate call lands. */
    result?: AttendanceImportRowResult
}

/** Headers we accept in the .xlsx (case-insensitive). The template uses these
 *  exact names; we tolerate common variants too so a stock ZKTeco export
 *  doesn't require cleanup before upload. */
const HEADER_ALIASES: Record<string, keyof AttendanceImportRow> = {
    mapper_id: 'mapperId',
    user_id: 'mapperId',
    biometric_id: 'mapperId',
    device_user: 'mapperId',
    employee_no: 'employeeNo',
    employee_code: 'employeeNo',
    emp_no: 'employeeNo',
    employee: 'employeeNo',
    date: 'date',
    time: 'recordedAt',
    timestamp: 'recordedAt',
    recorded_at: 'recordedAt',
    punch_type: 'punchType',
    type: 'punchType',
    direction: 'punchType',
    location: 'locationName',
    location_name: 'locationName',
    device_id: 'deviceId',
    device: 'deviceId',
    note: 'notes',
    notes: 'notes',
}

function AttendanceImportTab() {
    const { t } = useTranslation()
    const [stage, setStage] = useState<ImportStage>('idle')
    const [file, setFile] = useState<File | null>(null)
    const [rows, setRows] = useState<ParsedRow[]>([])
    const [parseError, setParseError] = useState<string | null>(null)
    const [validation, setValidation] = useState<AttendanceImportValidateResult | null>(null)
    const [dragOver, setDragOver] = useState(false)
    const [filter, setFilter] = useState<'all' | 'new' | 'duplicate' | 'invalid'>('all')
    // Export range — defaults to the current month so HR's single-click
    // download covers the most-likely-needed window.
    const today = new Date().toISOString().slice(0, 10)
    const monthStart = today.slice(0, 8) + '01'
    const [exportFrom, setExportFrom] = useState(monthStart)
    const [exportTo, setExportTo] = useState(today)
    const [exporting, setExporting] = useState(false)

    const validate = useValidateAttendanceImport()
    const commit = useCommitAttendanceImport()

    const downloadTemplate = async () => {
        try {
            const blob = await api.download('/attendance/import/template')
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'attendance-import-template.xlsx'
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
        } catch (err) {
            toast.error(t('biometric.import.templateError', 'Could not download template'),
                err instanceof Error ? err.message : 'Unknown error')
        }
    }

    /**
     * Download punches in the chosen range. Default = current month. The
     * exported .xlsx is round-trip compatible with this dialog's import,
     * so HR can use the export as a backup before mass-deleting punches
     * or hand it to payroll without further processing.
     */
    const downloadExport = async (format: 'xlsx' | 'csv') => {
        if (!exportFrom || !exportTo) {
            toast.error(t('biometric.export.errors.range', 'Pick both start and end dates'))
            return
        }
        if (exportFrom > exportTo) {
            toast.error(t('biometric.export.errors.swapped', 'Start date must be on or before end date'))
            return
        }
        setExporting(true)
        try {
            const qs = new URLSearchParams({ from: exportFrom, to: exportTo, format }).toString()
            const blob = await api.download(`/attendance/punches/export?${qs}`)
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `attendance-punches-${exportFrom}-to-${exportTo}.${format}`
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
            toast.success(t('biometric.export.success', 'Export downloaded'))
        } catch (err) {
            toast.error(t('biometric.export.errors.failed', 'Export failed'),
                err instanceof Error ? err.message : 'Unknown error')
        } finally {
            setExporting(false)
        }
    }

    const reset = () => {
        setStage('idle')
        setFile(null)
        setRows([])
        setParseError(null)
        setValidation(null)
        setFilter('all')
    }

    const handleFile = async (picked: File) => {
        setParseError(null)
        setStage('parsing')
        setFile(picked)
        try {
            const buf = await picked.arrayBuffer()
            const XLSX = await import('xlsx')
            const wb = XLSX.read(buf, { type: 'array', cellDates: false })
            const sheet = wb.Sheets[wb.SheetNames[0]]
            if (!sheet) {
                setParseError(t('biometric.import.errors.noSheet', 'Workbook has no sheets'))
                setStage('idle')
                return
            }
            // Read with header:1 so we control the header normalization
            // ourselves — XLSX's default header detection is case-sensitive
            // and trips on minor variations.
            const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
            if (aoa.length < 2) {
                setParseError(t('biometric.import.errors.empty', 'Sheet is empty (only a header was found)'))
                setStage('idle')
                return
            }
            const headerRow = (aoa[0] as unknown[]).map((h) =>
                String(h ?? '').trim().toLowerCase().replace(/\s+/g, '_'),
            )
            // Map each header to a known field via HEADER_ALIASES; unknown
            // columns are skipped (forward-compat with extra device fields).
            const fieldByCol: Array<keyof AttendanceImportRow | null> = headerRow.map(
                (h) => HEADER_ALIASES[h] ?? null,
            )
            const parsed: ParsedRow[] = []
            for (let i = 1; i < aoa.length; i++) {
                const r = aoa[i] as unknown[]
                if (r.every((v) => v === '' || v == null)) continue // skip blank lines
                const row: Partial<AttendanceImportRow> = {}
                for (let c = 0; c < fieldByCol.length; c++) {
                    const f = fieldByCol[c]
                    if (!f) continue
                    const v = r[c]
                    if (v === '' || v == null) continue
                    if (f === 'punchType') {
                        const s = String(v).trim().toLowerCase()
                        row.punchType = (s === 'out' || s === 'o' || s === 'check_out' || s === 'check-out')
                            ? 'out'
                            : (s === 'in' || s === 'i' || s === 'check_in' || s === 'check-in' ? 'in' : (s as any))
                    } else if (f === 'date') {
                        row.date = normalizeDate(v)
                    } else {
                        ;(row as any)[f] = String(v).trim()
                    }
                }
                parsed.push({
                    rowNumber: i + 1, // 1-based + header on row 1
                    mapperId: row.mapperId ?? null,
                    employeeNo: row.employeeNo ?? null,
                    date: row.date ?? '',
                    recordedAt: row.recordedAt ?? '',
                    punchType: (row.punchType as 'in' | 'out') ?? 'in',
                    locationName: row.locationName ?? null,
                    deviceId: row.deviceId ?? null,
                    notes: row.notes ?? null,
                })
            }
            if (parsed.length === 0) {
                setParseError(t('biometric.import.errors.noRows', 'No rows found in the sheet'))
                setStage('idle')
                return
            }
            if (parsed.length > 2000) {
                setParseError(t('biometric.import.errors.tooMany', `Too many rows (${parsed.length}). Split the file — max 2000 per upload.`))
                setStage('idle')
                return
            }
            setRows(parsed)

            // Auto-validate so HR sees the preview without clicking another button.
            setStage('validating')
            try {
                const result = await validate.mutateAsync(parsed.map(({ result: _r, ...row }) => row))
                const byRow = new Map(result.rows.map((r) => [r.rowNumber, r]))
                setRows(parsed.map((p) => ({ ...p, result: byRow.get(p.rowNumber) })))
                setValidation(result)
                setStage('ready')
            } catch (err) {
                toast.error(t('biometric.import.errors.validate', 'Validation failed'),
                    err instanceof Error ? err.message : 'Could not validate')
                setStage('idle')
            }
        } catch (err) {
            setParseError(err instanceof Error ? err.message : t('biometric.import.errors.parse', 'Could not parse file'))
            setStage('idle')
        }
    }

    const visibleRows = useMemo(() => {
        if (filter === 'all') return rows
        return rows.filter((r) => r.result?.action === filter)
    }, [rows, filter])

    const canCommit = stage === 'ready'
        && validation != null
        && validation.invalidCount === 0
        && validation.newCount > 0

    const handleCommit = async () => {
        if (!canCommit) return
        setStage('submitting')
        try {
            const payload = rows.map(({ result: _r, ...row }) => row)
            const res = await commit.mutateAsync(payload)
            if (res.failed > 0) {
                toast.error(t('biometric.import.errors.commitFailed', 'Some rows failed'),
                    `${res.failed} rejected — see the preview for details.`)
                setStage('ready')
                return
            }
            setStage('submitted')
            toast.success(
                t('biometric.import.success', 'Punches imported'),
                `${res.created} created · ${res.duplicate} duplicates skipped`,
            )
        } catch (err) {
            toast.error(t('biometric.import.errors.commitFailed', 'Import failed'),
                err instanceof Error ? err.message : 'Unknown error')
            setStage('ready')
        }
    }

    return (
        <div className="space-y-4">
            {/* Export — top of the tab. Default range = current month so
                the most common ask ("give me this month's punches for
                payroll") is two clicks away. */}
            <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                        <h2 className="text-sm font-semibold">{t('biometric.export.title', 'Export punches')}</h2>
                        <p className="text-[11px] text-muted-foreground max-w-xl">
                            {t('biometric.export.subtitle',
                                'Download the raw check-in/out events for a date range. The file format mirrors the import template, so an exported sheet can be re-imported as-is.')}
                        </p>
                    </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_10rem_1fr_auto] sm:items-end">
                    <div className="space-y-1.5">
                        <Label className="text-[11px] uppercase tracking-wide">{t('biometric.export.from', 'From')}</Label>
                        <Input
                            type="date"
                            value={exportFrom}
                            onChange={(e) => setExportFrom(e.target.value)}
                            max={exportTo}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-[11px] uppercase tracking-wide">{t('biometric.export.to', 'To')}</Label>
                        <Input
                            type="date"
                            value={exportTo}
                            onChange={(e) => setExportTo(e.target.value)}
                            min={exportFrom}
                            max={today}
                        />
                    </div>
                    <div /> {/* spacer so the buttons hug the right edge on wide screens */}
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => downloadExport('csv')}
                            disabled={exporting}
                            className="gap-1.5"
                        >
                            <Download className="size-3.5" />
                            CSV
                        </Button>
                        <Button
                            size="sm"
                            onClick={() => downloadExport('xlsx')}
                            disabled={exporting}
                            loading={exporting}
                            className="gap-1.5"
                        >
                            <Download className="size-3.5" />
                            {t('biometric.export.download', 'Download .xlsx')}
                        </Button>
                    </div>
                </div>
            </Card>

            <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h2 className="text-sm font-semibold">{t('biometric.import.title', 'Bulk import punches')}</h2>
                        <p className="text-[11px] text-muted-foreground max-w-xl">
                            {t('biometric.import.subtitle',
                                'Upload an Excel export from your biometric device or fill in the template. Rows are matched by biometric ID first, then by employee number. Preview before committing.')}
                        </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-1.5 shrink-0">
                        <Download className="size-3.5" />
                        {t('biometric.import.downloadTemplate', 'Download template')}
                    </Button>
                </div>

                {/* Upload zone — drag/drop + file picker */}
                <div className="mt-4">
                    {file == null || stage === 'idle' ? (
                        <label
                            htmlFor="attendance-import-file"
                            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={(e) => {
                                e.preventDefault()
                                setDragOver(false)
                                const f = e.dataTransfer.files?.[0]
                                if (f) handleFile(f)
                            }}
                            className={cn(
                                'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 cursor-pointer transition-colors',
                                dragOver ? 'border-primary bg-primary/5' : 'border-border bg-muted/20 hover:bg-muted/30',
                            )}
                        >
                            <FileSpreadsheet className="size-8 text-muted-foreground/60" />
                            <div className="text-center">
                                <p className="text-sm font-medium">
                                    {dragOver
                                        ? t('biometric.import.dropTo', 'Drop to upload')
                                        : t('biometric.import.dragOrClick', 'Drag an .xlsx here or click to browse')}
                                </p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                    {t('biometric.import.columnsHint',
                                        'Required columns: mapper_id or employee_no, date, time, punch_type')}
                                </p>
                            </div>
                            <input
                                id="attendance-import-file"
                                type="file"
                                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                                className="hidden"
                                onChange={(e) => {
                                    const f = e.target.files?.[0]
                                    if (f) handleFile(f)
                                    e.target.value = ''
                                }}
                            />
                        </label>
                    ) : (
                        <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
                            <div className="flex size-10 items-center justify-center rounded-md bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 shrink-0">
                                {stage === 'parsing' || stage === 'validating' || stage === 'submitting'
                                    ? <Loader2 className="size-5 animate-spin" />
                                    : <FileSpreadsheet className="size-5" />}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">{file.name}</p>
                                <p className="text-[11px] text-muted-foreground">
                                    {(file.size / 1024).toFixed(1)} KB
                                    {stage === 'parsing' && ' · parsing…'}
                                    {stage === 'validating' && ' · validating…'}
                                    {stage === 'ready' && ` · ${rows.length} rows`}
                                    {stage === 'submitting' && ' · importing…'}
                                    {stage === 'submitted' && ' · imported ✓'}
                                </p>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={reset}
                                disabled={stage === 'parsing' || stage === 'validating' || stage === 'submitting'}
                            >
                                <X className="size-3.5 me-1" />
                                {t('biometric.import.replace', 'Replace')}
                            </Button>
                        </div>
                    )}
                    {parseError && (
                        <p className="mt-2 flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
                            <AlertCircle className="size-3" />
                            {parseError}
                        </p>
                    )}
                </div>
            </Card>

            {validation && rows.length > 0 && (
                <>
                    {/* Summary KPIs — clickable filter chips */}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <ImportKpi label={t('biometric.import.kpi.total', 'Total')} value={validation.total}
                            active={filter === 'all'} onClick={() => setFilter('all')} tone="neutral" />
                        <ImportKpi label={t('biometric.import.kpi.new', 'New')} value={validation.newCount}
                            active={filter === 'new'} onClick={() => setFilter('new')}
                            tone="emerald" disabled={validation.newCount === 0} />
                        <ImportKpi label={t('biometric.import.kpi.duplicate', 'Duplicate')} value={validation.duplicateCount}
                            active={filter === 'duplicate'} onClick={() => setFilter('duplicate')}
                            tone="slate" disabled={validation.duplicateCount === 0} />
                        <ImportKpi label={t('biometric.import.kpi.invalid', 'Invalid')} value={validation.invalidCount}
                            active={filter === 'invalid'} onClick={() => setFilter('invalid')}
                            tone="rose" disabled={validation.invalidCount === 0} />
                    </div>

                    {/* Preview table */}
                    <Card>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-medium w-12">#</th>
                                        <th className="px-3 py-2 text-left font-medium w-28">{t('biometric.import.col.status', 'Status')}</th>
                                        <th className="px-3 py-2 text-left font-medium">{t('biometric.import.col.identifier', 'Identifier')}</th>
                                        <th className="px-3 py-2 text-left font-medium">{t('biometric.import.col.employee', 'Employee')}</th>
                                        <th className="px-3 py-2 text-left font-medium">{t('biometric.import.col.dateTime', 'Date / time')}</th>
                                        <th className="px-3 py-2 text-left font-medium w-20">{t('biometric.import.col.punch', 'Punch')}</th>
                                        <th className="px-3 py-2 text-left font-medium">{t('biometric.import.col.note', 'Note / issue')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {visibleRows.length === 0 ? (
                                        <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                                            {t('biometric.import.noMatch', 'No rows match this filter')}
                                        </td></tr>
                                    ) : visibleRows.map((r) => <PreviewRow key={r.rowNumber} row={r} />)}
                                </tbody>
                            </table>
                        </div>
                    </Card>

                    {validation.invalidCount > 0 && (
                        <p className="flex items-start gap-1.5 text-xs text-rose-600 dark:text-rose-400">
                            <AlertCircle className="size-3 mt-0.5 shrink-0" />
                            {t('biometric.import.fixHint',
                                `${validation.invalidCount} row(s) can't be imported. Fix the spreadsheet (add a mapping or correct the employee_no) and re-upload.`,
                                { n: validation.invalidCount })}
                        </p>
                    )}

                    <div className="flex justify-end">
                        <Button onClick={handleCommit} disabled={!canCommit} loading={commit.isPending} className="gap-1.5">
                            <Upload className="size-4" />
                            {t('biometric.import.commit', `Import ${validation.newCount} punches`,
                                { n: validation.newCount })}
                        </Button>
                    </div>
                </>
            )}
        </div>
    )
}

function ImportKpi({
    label, value, active, onClick, tone, disabled,
}: {
    label: string
    value: number
    active: boolean
    onClick: () => void
    tone: 'emerald' | 'slate' | 'rose' | 'neutral'
    disabled?: boolean
}) {
    const toneClass = {
        emerald: 'border-emerald-200/60 bg-emerald-50/40 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/15 dark:text-emerald-200',
        slate: 'border-slate-200/60 bg-slate-50/60 text-slate-700 dark:border-slate-800/40 dark:bg-slate-900/30 dark:text-slate-300',
        rose: 'border-rose-200/60 bg-rose-50/40 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/15 dark:text-rose-200',
        neutral: 'border-border bg-card text-foreground',
    }[tone]
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className={cn(
                'rounded-lg border p-2.5 text-left transition-all',
                toneClass,
                active && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
                disabled ? 'opacity-50 cursor-default' : 'hover:shadow-sm cursor-pointer',
            )}
        >
            <p className="text-[10px] font-bold uppercase tracking-widest">{label}</p>
            <p className="mt-0.5 text-lg font-bold tabular-nums leading-none">{value}</p>
        </button>
    )
}

function PreviewRow({ row }: { row: ParsedRow }) {
    const action = row.result?.action ?? 'new'
    const rowClass = action === 'invalid'
        ? 'bg-rose-50/60 dark:bg-rose-950/20'
        : action === 'duplicate'
            ? 'opacity-60'
            : ''
    return (
        <tr className={cn('text-xs', rowClass)}>
            <td className="px-3 py-2 text-muted-foreground tabular-nums">{row.rowNumber}</td>
            <td className="px-3 py-2"><ImportStatusBadge action={action} /></td>
            <td className="px-3 py-2">
                <div className="font-mono text-[11px]">{row.mapperId || row.employeeNo || '—'}</div>
                {row.result?.resolvedVia && (
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground mt-0.5">
                        via {row.result.resolvedVia === 'mapper_id' ? 'biometric' : 'employee no'}
                    </div>
                )}
            </td>
            <td className="px-3 py-2">
                {row.result?.resolvedName ? (
                    <>
                        <div className="font-medium">{row.result.resolvedName}</div>
                        <div className="text-[10px] text-muted-foreground">{row.result.resolvedEmployeeNo}</div>
                    </>
                ) : <span className="text-muted-foreground/50">—</span>}
            </td>
            <td className="px-3 py-2 tabular-nums">{row.date} · {row.recordedAt}</td>
            <td className="px-3 py-2">
                <span className={cn(
                    'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                    row.punchType === 'in'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
                )}>
                    {row.punchType}
                </span>
            </td>
            <td className="px-3 py-2">
                {row.result?.error ? (
                    <span className="text-rose-600 dark:text-rose-400">{row.result.error}</span>
                ) : row.notes ? (
                    <span className="text-muted-foreground">{row.notes}</span>
                ) : (
                    <span className="text-muted-foreground/50">—</span>
                )}
            </td>
        </tr>
    )
}

function ImportStatusBadge({ action }: { action: 'new' | 'duplicate' | 'invalid' }) {
    const v = {
        new:       { label: 'New',       cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300', Icon: CheckCircle2 },
        duplicate: { label: 'Duplicate', cls: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400',           Icon: Copy },
        invalid:   { label: 'Invalid',   cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',             Icon: XCircle },
    }[action]
    return (
        <span className={cn('inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', v.cls)}>
            <v.Icon className="size-3" />
            {v.label}
        </span>
    )
}

/** Normalize whatever Excel handed us into ISO YYYY-MM-DD. Excel hands back
 *  serial numbers, formatted strings, or Date objects depending on how the
 *  workbook was saved — handle all three. */
function normalizeDate(value: unknown): string {
    if (value instanceof Date) return value.toISOString().slice(0, 10)
    if (typeof value === 'number') {
        // Excel epoch is 1899-12-30; multiply by ms-per-day.
        const d = new Date(Math.round((value - 25569) * 86400 * 1000))
        return d.toISOString().slice(0, 10)
    }
    const s = String(value ?? '').trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
    // Try Date.parse for ISO-with-time or 'M/D/YYYY' shapes.
    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
    return s
}

/** Suppress the unused-import warning for `Badge` so the build stays clean. */
void Badge
/** And separator — kept available for future expansions. */
void Separator
