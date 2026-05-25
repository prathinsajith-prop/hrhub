// ─── Bulk Import Assets dialog ──────────────────────────────────────────────
//
// Three-stage flow (mirrors the payroll bulk-adjustment dialog so HR has
// one mental model for "upload a sheet"):
//
//   ┌──────────────┐    parse client-side       ┌──────────────┐
//   │ 1. Pick file │ ─────────────────────────▶ │ 2. Preview   │
//   └──────────────┘   (xlsx, dynamic import)   │   table +    │
//                                               │   per-row    │
//                                               │   server     │
//                                               │   validation │
//                                               └──────┬───────┘
//                                                      │ commit
//                                                      ▼
//                                               ┌──────────────┐
//                                               │ 3. Done      │
//                                               │   (toast +   │
//                                               │    close)    │
//                                               └──────────────┘
//
// Empty rows (no name AND no asset code) are skipped silently so HR can
// fill only what they need from the pre-populated template. Rows with a
// corrupt amount / unknown category surface as red in the preview but
// don't block the rest of the batch from being saved.

import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    UploadCloud, FileSpreadsheet, X, CheckCircle2, AlertCircle, Download, Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter, toast,
} from '@/components/ui/overlays'
import { Badge } from '@/components/ui/primitives'
import { api } from '@/lib/api'
import {
    useValidateBulkAssets, useBulkCreateAssets,
    type BulkAssetRowInput, type BulkAssetRowResult,
} from '@/hooks/useAssets'
import { cn } from '@/lib/utils'

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
}

// Columns the .xlsx must carry. Matches the backend template + /bulk-validate
// row shape exactly. Anything outside this list is ignored.
const TEMPLATE_HEADERS = [
    'asset_code',
    'name',
    'category_name',
    'brand',
    'model',
    'serial_number',
    'purchase_date',
    'purchase_cost',
    'status',
    'condition',
    'notes',
] as const

type LocalRow = BulkAssetRowInput & {
    /** Set when the server validation came back for this row. */
    serverResult?: BulkAssetRowResult
}

const MAX_ROWS = 500

export function BulkImportAssetsDialog({ open, onOpenChange }: Props) {
    const { t } = useTranslation()
    const validate = useValidateBulkAssets()
    const create = useBulkCreateAssets()

    const [file, setFile] = useState<File | null>(null)
    const [rows, setRows] = useState<LocalRow[]>([])
    const [parseError, setParseError] = useState<string | null>(null)
    const [downloading, setDownloading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement | null>(null)

    // State-during-render reset on open (preferred over useEffect for
    // ephemeral form state — keeps initial render in sync with the
    // "this dialog is fresh" signal).
    const [wasOpen, setWasOpen] = useState(false)
    if (open !== wasOpen) {
        setWasOpen(open)
        if (open) {
            setFile(null)
            setRows([])
            setParseError(null)
        }
    }

    // ── Download template ──────────────────────────────────────────────
    async function handleDownloadTemplate() {
        setDownloading(true)
        try {
            const blob = await api.download('/assets/bulk-template')
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'assets-bulk-template.xlsx'
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
        } catch (err) {
            toast.error(
                t('assets.bulkImport.downloadFailed', { defaultValue: 'Could not download template' }),
                err instanceof Error ? err.message : 'Unknown error',
            )
        } finally {
            setDownloading(false)
        }
    }

    // ── Parse the uploaded .xlsx in the browser ────────────────────────
    //
    // `xlsx` is a heavy package; we dynamic-import it so the bundle stays
    // lean for HR who never click this button. Once loaded, the cost is a
    // one-time module evaluation per session.
    async function parseFile(picked: File) {
        setFile(picked)
        setParseError(null)
        try {
            const buffer = await picked.arrayBuffer()
            const XLSX = await import('xlsx')
            const wb = XLSX.read(buffer, { type: 'array' })
            const firstSheet = wb.Sheets[wb.SheetNames[0]]
            if (!firstSheet) {
                setParseError(t('assets.bulkImport.noSheets', { defaultValue: 'Workbook contains no sheets.' }))
                setRows([])
                return
            }
            const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '', raw: true })
            if (json.length === 0) {
                setParseError(t('assets.bulkImport.emptySheet', { defaultValue: 'Sheet is empty. Download the template for the correct format.' }))
                setRows([])
                return
            }
            const sample = json[0]
            const haveExpectedHeader = TEMPLATE_HEADERS.some((h) => h in sample)
            if (!haveExpectedHeader) {
                setParseError(
                    t('assets.bulkImport.headerMismatch', {
                        defaultValue: 'Headers must match: {{headers}}.',
                        headers: TEMPLATE_HEADERS.join(', '),
                    }),
                )
                setRows([])
                return
            }
            if (json.length > MAX_ROWS) {
                setParseError(
                    t('assets.bulkImport.tooManyRows', {
                        defaultValue: 'Maximum {{max}} rows per import (this file has {{count}}).',
                        max: MAX_ROWS, count: json.length,
                    }),
                )
                setRows([])
                return
            }
            // Drop empty rows: a row with no name AND no asset code is "HR
            // didn't fill this line". Keeps the preview focused.
            const parsed: LocalRow[] = json.reduce<LocalRow[]>((acc, row, idx) => {
                const name = String(row.name ?? '').trim()
                const code = String(row.asset_code ?? '').trim()
                if (!name && !code) return acc
                acc.push({
                    rowNumber: idx + 2, // spreadsheet line (header is row 1)
                    assetCode: code || null,
                    name: name || null,
                    categoryName: String(row.category_name ?? '').trim() || null,
                    brand: String(row.brand ?? '').trim() || null,
                    model: String(row.model ?? '').trim() || null,
                    serialNumber: String(row.serial_number ?? '').trim() || null,
                    purchaseDate: String(row.purchase_date ?? '').trim() || null,
                    purchaseCost:
                        row.purchase_cost === '' || row.purchase_cost === null || row.purchase_cost === undefined
                            ? null
                            : (row.purchase_cost as number | string),
                    status: String(row.status ?? '').trim() || null,
                    condition: String(row.condition ?? '').trim() || null,
                    notes: String(row.notes ?? '').trim() || null,
                })
                return acc
            }, [])
            if (parsed.length === 0) {
                setParseError(
                    t('assets.bulkImport.allEmpty', {
                        defaultValue: 'No rows with a name or asset code were found. Fill at least one row before uploading.',
                    }),
                )
                setRows([])
                return
            }
            setRows(parsed)

            // Auto-run server validation so HR sees the preview straight away.
            try {
                const result = await validate.mutateAsync(parsed)
                const byNumber = new Map(result.rows.map((r) => [r.rowNumber, r]))
                setRows(parsed.map((p) => ({ ...p, serverResult: byNumber.get(p.rowNumber) })))
            } catch (err) {
                toast.error(
                    t('assets.bulkImport.validateFailed', { defaultValue: 'Validation failed' }),
                    err instanceof Error ? err.message : 'Unknown error',
                )
            }
        } catch (err) {
            setParseError(err instanceof Error ? err.message : 'Could not parse file.')
            setRows([])
        }
    }

    const validCount = useMemo(() => rows.filter((r) => r.serverResult?.ok).length, [rows])
    const invalidCount = useMemo(() => rows.filter((r) => r.serverResult && !r.serverResult.ok).length, [rows])
    const pendingCount = useMemo(() => rows.filter((r) => !r.serverResult).length, [rows])
    const canSubmit = rows.length > 0 && validCount > 0 && !validate.isPending && !create.isPending

    function clearFile() {
        setFile(null)
        setRows([])
        setParseError(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    async function handleSubmit() {
        if (!canSubmit) return
        try {
            const result = await create.mutateAsync(rows)
            toast.success(
                t('assets.bulkImport.savedTitle', {
                    defaultValue: '{{count}} asset(s) imported',
                    count: result.created,
                }),
                result.skipped > 0
                    ? t('assets.bulkImport.savedSkipped', {
                        defaultValue: '{{count}} row(s) skipped due to errors.',
                        count: result.skipped,
                    })
                    : undefined,
            )
            onOpenChange(false)
        } catch {
            // useBulkCreateAssets surfaces the toast already; no rethrow.
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-4xl">
                <DialogHeader>
                    <DialogTitle>
                        {t('assets.bulkImport.title', { defaultValue: 'Bulk import assets' })}
                    </DialogTitle>
                </DialogHeader>
                <DialogBody className="space-y-4">
                    {/* Step 1 — guidance + template download */}
                    <div className="rounded-lg border bg-muted/30 p-3 flex items-start gap-3">
                        <FileSpreadsheet className="size-4 mt-0.5 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0 space-y-1">
                            <p className="text-sm font-medium">
                                {t('assets.bulkImport.step1', { defaultValue: '1. Download the template' })}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {t('assets.bulkImport.step1Hint', {
                                    defaultValue: 'The .xlsx file has the column shape we accept. Sheet 2 lists your existing categories — use one of those names exactly.',
                                })}
                            </p>
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleDownloadTemplate}
                            disabled={downloading}
                        >
                            {downloading ? (
                                <Loader2 className="size-3.5 me-1.5 animate-spin" />
                            ) : (
                                <Download className="size-3.5 me-1.5" />
                            )}
                            {t('assets.bulkImport.downloadTemplate', { defaultValue: 'Download template' })}
                        </Button>
                    </div>

                    {/* Step 2 — file picker */}
                    <div className="rounded-lg border p-3 space-y-2">
                        <p className="text-sm font-medium">
                            {t('assets.bulkImport.step2', { defaultValue: '2. Upload the filled-in file' })}
                        </p>
                        {!file ? (
                            <label className="flex items-center justify-center gap-2 cursor-pointer rounded-md border border-dashed bg-background px-4 py-6 hover:bg-muted/40 transition-colors">
                                <UploadCloud className="size-4 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">
                                    {t('assets.bulkImport.choosePrompt', {
                                        defaultValue: 'Click to choose an .xlsx file (max {{max}} rows)',
                                        max: MAX_ROWS,
                                    })}
                                </span>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                                    className="hidden"
                                    onChange={(e) => {
                                        const picked = e.target.files?.[0]
                                        if (picked) parseFile(picked)
                                    }}
                                    aria-label={t('assets.bulkImport.chooseFile', { defaultValue: 'Choose file' })}
                                />
                            </label>
                        ) : (
                            <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2">
                                <div className="flex items-center gap-2 min-w-0">
                                    <FileSpreadsheet className="size-4 text-muted-foreground shrink-0" />
                                    <span className="text-sm truncate">{file.name}</span>
                                </div>
                                <Button type="button" variant="ghost" size="sm" onClick={clearFile}>
                                    <X className="size-3.5" />
                                </Button>
                            </div>
                        )}
                        {parseError && (
                            <p className="text-xs text-rose-600 dark:text-rose-400 flex items-start gap-1.5">
                                <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
                                {parseError}
                            </p>
                        )}
                    </div>

                    {/* Step 3 — preview */}
                    {rows.length > 0 && (
                        <div className="rounded-lg border overflow-hidden">
                            <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2 text-xs">
                                <p className="font-medium">
                                    {t('assets.bulkImport.previewTitle', {
                                        defaultValue: '3. Preview ({{total}} row{{plural}})',
                                        total: rows.length,
                                        plural: rows.length === 1 ? '' : 's',
                                    })}
                                </p>
                                <div className="flex items-center gap-3 text-[11px]">
                                    {validate.isPending || pendingCount > 0 ? (
                                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                                            <Loader2 className="size-3 animate-spin" />
                                            {t('assets.bulkImport.validating', { defaultValue: 'Validating…' })}
                                        </span>
                                    ) : (
                                        <>
                                            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                                                <CheckCircle2 className="size-3" />
                                                {t('assets.bulkImport.validCount', { count: validCount, defaultValue: '{{count}} valid' })}
                                            </span>
                                            {invalidCount > 0 && (
                                                <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-400">
                                                    <AlertCircle className="size-3" />
                                                    {t('assets.bulkImport.invalidCount', { count: invalidCount, defaultValue: '{{count}} with errors' })}
                                                </span>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                            <div className="max-h-72 overflow-auto">
                                <table className="w-full text-xs">
                                    <thead className="bg-muted/20 text-[10px] uppercase tracking-wide text-muted-foreground">
                                        <tr>
                                            <th className="px-2 py-1.5 text-start w-12">#</th>
                                            <th className="px-2 py-1.5 text-start w-20">{t('assets.bulkImport.colCode', { defaultValue: 'Code' })}</th>
                                            <th className="px-2 py-1.5 text-start">{t('assets.bulkImport.colName', { defaultValue: 'Name' })}</th>
                                            <th className="px-2 py-1.5 text-start">{t('assets.bulkImport.colCategory', { defaultValue: 'Category' })}</th>
                                            <th className="px-2 py-1.5 text-start w-20">{t('assets.bulkImport.colStatus', { defaultValue: 'Status' })}</th>
                                            <th className="px-2 py-1.5 text-start w-24">{t('assets.bulkImport.colResult', { defaultValue: 'Result' })}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {rows.map((r) => {
                                            const result = r.serverResult
                                            const status = result?.ok
                                                ? 'ok' as const
                                                : result
                                                    ? 'error' as const
                                                    : 'pending' as const
                                            return (
                                                <tr
                                                    key={r.rowNumber}
                                                    className={cn(
                                                        status === 'error' && 'bg-rose-50/40 dark:bg-rose-950/20',
                                                        status === 'ok' && 'hover:bg-muted/30',
                                                    )}
                                                >
                                                    <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{r.rowNumber}</td>
                                                    <td className="px-2 py-1.5 font-mono text-[11px]">{r.assetCode || <span className="text-muted-foreground italic">auto</span>}</td>
                                                    <td className="px-2 py-1.5">{r.name || <span className="text-rose-600">—</span>}</td>
                                                    <td className="px-2 py-1.5">{r.categoryName || <span className="text-muted-foreground">—</span>}</td>
                                                    <td className="px-2 py-1.5 capitalize">{r.status || 'available'}</td>
                                                    <td className="px-2 py-1.5">
                                                        {status === 'pending' ? (
                                                            <Badge variant="secondary" className="text-[10px]">
                                                                {t('common.pending', { defaultValue: 'pending' })}
                                                            </Badge>
                                                        ) : status === 'ok' ? (
                                                            <Badge variant="success" className="text-[10px]">
                                                                <CheckCircle2 className="size-2.5 me-0.5" />
                                                                {t('assets.bulkImport.ready', { defaultValue: 'ready' })}
                                                            </Badge>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 text-[10px] text-rose-700 dark:text-rose-400" title={result?.errors.join('; ')}>
                                                                <AlertCircle className="size-2.5" />
                                                                {result?.errors[0] ?? t('assets.bulkImport.invalid', { defaultValue: 'error' })}
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </DialogBody>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
                        {t('common.cancel')}
                    </Button>
                    <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
                        {create.isPending ? (
                            <>
                                <Loader2 className="size-3.5 me-1.5 animate-spin" />
                                {t('assets.bulkImport.saving', { defaultValue: 'Saving…' })}
                            </>
                        ) : (
                            t('assets.bulkImport.save', { defaultValue: 'Import {{count}}', count: validCount })
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
