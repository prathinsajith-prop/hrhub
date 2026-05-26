// ─── Bulk Update Biometric Mappings dialog ──────────────────────────────────
//
// Mirrors the BulkImportAssetsDialog / BulkImportJobsDialog so HR has one
// mental model for "upload a sheet". Domain rules unique to this flow:
//
//   • The template is pre-populated with every unmapped employee
//     (server-generated, tenant-scoped).
//   • HR types a mapping_id into the rows they want to map; leaves the
//     rest blank.
//   • Blank mapping_id → row silently skipped (don't pester HR about
//     "you didn't fill row 17 — fine, that's the whole point").
//   • One-to-one is enforced server-side: the same mapping_id can't be
//     assigned twice, and an employee with an existing mapping can't be
//     given another via bulk update.

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
    useValidateBulkMappings, useBulkCreateMappings,
    type BulkMappingRowInput, type BulkMappingRowResult,
} from '@/hooks/useBiometric'
import { cn } from '@/lib/utils'

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
}

const TEMPLATE_HEADERS = [
    'employee_no',
    'employee_name',
    'email',
    'mapping_id',
] as const

type LocalRow = BulkMappingRowInput & {
    /** Optional carried-over display fields from the template — shown in
     *  the preview even when validation fails. */
    employeeName?: string | null
    email?: string | null
    serverResult?: BulkMappingRowResult
}

const MAX_ROWS = 500

export function BulkMappingsImportDialog({ open, onOpenChange }: Props) {
    const { t } = useTranslation()
    const validate = useValidateBulkMappings()
    const create = useBulkCreateMappings()

    const [file, setFile] = useState<File | null>(null)
    const [rows, setRows] = useState<LocalRow[]>([])
    const [parseError, setParseError] = useState<string | null>(null)
    const [downloading, setDownloading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement | null>(null)

    // State-during-render reset on open — same pattern as other bulk dialogs.
    const [wasOpen, setWasOpen] = useState(false)
    if (open !== wasOpen) {
        setWasOpen(open)
        if (open) {
            setFile(null)
            setRows([])
            setParseError(null)
        }
    }

    async function handleDownloadTemplate() {
        setDownloading(true)
        try {
            const blob = await api.download('/attendance/mappings/bulk-template')
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'biometric-mappings-bulk-template.xlsx'
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
        } catch (err) {
            toast.error(
                t('biometric.bulkImport.downloadFailed', { defaultValue: 'Could not download template' }),
                err instanceof Error ? err.message : 'Unknown error',
            )
        } finally {
            setDownloading(false)
        }
    }

    async function parseFile(picked: File) {
        setFile(picked)
        setParseError(null)
        try {
            const buffer = await picked.arrayBuffer()
            const XLSX = await import('xlsx')
            const wb = XLSX.read(buffer, { type: 'array' })
            const firstSheet = wb.Sheets[wb.SheetNames[0]]
            if (!firstSheet) {
                setParseError(t('biometric.bulkImport.noSheets', { defaultValue: 'Workbook contains no sheets.' }))
                setRows([])
                return
            }
            const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '', raw: true })
            if (json.length === 0) {
                setParseError(t('biometric.bulkImport.emptySheet', { defaultValue: 'Sheet is empty. Download the template for the correct format.' }))
                setRows([])
                return
            }
            const sample = json[0]
            const haveExpectedHeader = TEMPLATE_HEADERS.some((h) => h in sample)
            if (!haveExpectedHeader) {
                setParseError(
                    t('biometric.bulkImport.headerMismatch', {
                        defaultValue: 'Headers must match: {{headers}}.',
                        headers: TEMPLATE_HEADERS.join(', '),
                    }),
                )
                setRows([])
                return
            }
            // Drop rows with no mapping_id — that's HR saying "I didn't
            // map this employee in this batch". Keep the row in the
            // preview only if there's a mapping_id to validate.
            const parsed: LocalRow[] = json.reduce<LocalRow[]>((acc, row, idx) => {
                const mappingId = String(row.mapping_id ?? '').trim()
                if (!mappingId) return acc
                acc.push({
                    rowNumber: idx + 2, // spreadsheet line (header is row 1)
                    employeeNo: String(row.employee_no ?? '').trim() || null,
                    mappingId,
                    label: null,
                    employeeName: String(row.employee_name ?? '').trim() || null,
                    email: String(row.email ?? '').trim() || null,
                })
                return acc
            }, [])
            if (parsed.length === 0) {
                setParseError(
                    t('biometric.bulkImport.allEmpty', {
                        defaultValue: 'No rows with a mapping_id were found. Fill the mapping_id column for at least one employee before uploading.',
                    }),
                )
                setRows([])
                return
            }
            if (parsed.length > MAX_ROWS) {
                setParseError(
                    t('biometric.bulkImport.tooManyRows', {
                        defaultValue: 'Maximum {{max}} rows per import (this file has {{count}}).',
                        max: MAX_ROWS, count: parsed.length,
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
                    t('biometric.bulkImport.validateFailed', { defaultValue: 'Validation failed' }),
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
                t('biometric.bulkImport.savedTitle', {
                    defaultValue: '{{count}} mapping(s) saved',
                    count: result.created,
                }),
                result.skipped > 0
                    ? t('biometric.bulkImport.savedSkipped', {
                        defaultValue: '{{count}} row(s) skipped due to errors.',
                        count: result.skipped,
                    })
                    : undefined,
            )
            onOpenChange(false)
        } catch {
            /* useBulkCreateMappings surfaces the toast */
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-4xl">
                <DialogHeader>
                    <DialogTitle>
                        {t('biometric.bulkImport.title', { defaultValue: 'Bulk update biometric mappings' })}
                    </DialogTitle>
                </DialogHeader>
                <DialogBody className="space-y-4">
                    {/* Step 1 — guidance + template download */}
                    <div className="rounded-lg border bg-muted/30 p-3 flex items-start gap-3">
                        <FileSpreadsheet className="size-4 mt-0.5 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0 space-y-1">
                            <p className="text-sm font-medium">
                                {t('biometric.bulkImport.step1', { defaultValue: '1. Download the template' })}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {t('biometric.bulkImport.step1Hint', {
                                    defaultValue: 'The .xlsx lists every employee in your organisation that does not yet have a biometric mapping. Type the device ID into the mapping_id column for each employee you want to map.',
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
                            {t('biometric.bulkImport.downloadTemplate', { defaultValue: 'Download template' })}
                        </Button>
                    </div>

                    {/* Step 2 — file picker */}
                    <div className="rounded-lg border p-3 space-y-2">
                        <p className="text-sm font-medium">
                            {t('biometric.bulkImport.step2', { defaultValue: '2. Upload the filled-in file' })}
                        </p>
                        {!file ? (
                            <label className="flex items-center justify-center gap-2 cursor-pointer rounded-md border border-dashed bg-background px-4 py-6 hover:bg-muted/40 transition-colors">
                                <UploadCloud className="size-4 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">
                                    {t('biometric.bulkImport.choosePrompt', {
                                        defaultValue: 'Click to choose an .xlsx file (max {{max}} mapped rows)',
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
                                    aria-label={t('biometric.bulkImport.chooseFile', { defaultValue: 'Choose file' })}
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
                                    {t('biometric.bulkImport.previewTitle', {
                                        defaultValue: '3. Preview ({{total}} row{{plural}})',
                                        total: rows.length,
                                        plural: rows.length === 1 ? '' : 's',
                                    })}
                                </p>
                                <div className="flex items-center gap-3 text-[11px]">
                                    {validate.isPending || pendingCount > 0 ? (
                                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                                            <Loader2 className="size-3 animate-spin" />
                                            {t('biometric.bulkImport.validating', { defaultValue: 'Validating…' })}
                                        </span>
                                    ) : (
                                        <>
                                            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                                                <CheckCircle2 className="size-3" />
                                                {t('biometric.bulkImport.validCount', { count: validCount, defaultValue: '{{count}} valid' })}
                                            </span>
                                            {invalidCount > 0 && (
                                                <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-400">
                                                    <AlertCircle className="size-3" />
                                                    {t('biometric.bulkImport.invalidCount', { count: invalidCount, defaultValue: '{{count}} with errors' })}
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
                                            <th className="px-2 py-1.5 text-start w-24">{t('biometric.bulkImport.colEmployeeNo', { defaultValue: 'Employee no' })}</th>
                                            <th className="px-2 py-1.5 text-start">{t('biometric.bulkImport.colEmployee', { defaultValue: 'Employee' })}</th>
                                            <th className="px-2 py-1.5 text-start">{t('biometric.bulkImport.colEmail', { defaultValue: 'Email' })}</th>
                                            <th className="px-2 py-1.5 text-start w-28">{t('biometric.bulkImport.colMappingId', { defaultValue: 'Mapping ID' })}</th>
                                            <th className="px-2 py-1.5 text-start w-28">{t('biometric.bulkImport.colResult', { defaultValue: 'Result' })}</th>
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
                                            // Prefer server-echoed name when available; fall
                                            // back to the value the template carried.
                                            const displayName = result?.employeeName ?? r.employeeName
                                            return (
                                                <tr
                                                    key={r.rowNumber}
                                                    className={cn(
                                                        status === 'error' && 'bg-rose-50/40 dark:bg-rose-950/20',
                                                        status === 'ok' && 'hover:bg-muted/30',
                                                    )}
                                                >
                                                    <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{r.rowNumber}</td>
                                                    <td className="px-2 py-1.5 font-mono text-[11px]">{r.employeeNo || <span className="text-rose-600">—</span>}</td>
                                                    <td className="px-2 py-1.5">{displayName || <span className="text-muted-foreground">—</span>}</td>
                                                    <td className="px-2 py-1.5 text-muted-foreground">{r.email || <span className="text-muted-foreground">—</span>}</td>
                                                    <td className="px-2 py-1.5 font-mono text-[11px]">{r.mappingId || <span className="text-rose-600">—</span>}</td>
                                                    <td className="px-2 py-1.5">
                                                        {status === 'pending' ? (
                                                            <Badge variant="secondary" className="text-[10px]">
                                                                {t('common.pending', { defaultValue: 'pending' })}
                                                            </Badge>
                                                        ) : status === 'ok' ? (
                                                            <Badge variant="success" className="text-[10px]">
                                                                <CheckCircle2 className="size-2.5 me-0.5" />
                                                                {t('biometric.bulkImport.ready', { defaultValue: 'ready' })}
                                                            </Badge>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 text-[10px] text-rose-700 dark:text-rose-400" title={result?.errors.join('; ')}>
                                                                <AlertCircle className="size-2.5" />
                                                                {result?.errors[0] ?? t('biometric.bulkImport.invalid', { defaultValue: 'error' })}
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
                                {t('biometric.bulkImport.saving', { defaultValue: 'Saving…' })}
                            </>
                        ) : (
                            t('biometric.bulkImport.save', { defaultValue: 'Save {{count}}', count: validCount })
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
