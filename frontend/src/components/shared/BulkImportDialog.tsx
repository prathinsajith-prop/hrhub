/**
 * Shared 4-step bulk-import dialog.
 *
 * Flow (every consumer follows the same script):
 *
 *   1. Template — user clicks "Download template" → GET /<templateUrl>
 *   2. Upload    — user drops or picks an .xlsx / .csv → parsed in-browser
 *   3. Preview   — rows POSTed to /<validateUrl>; server returns per-row
 *                  errors + a summary. User sees a coloured table.
 *   4. Commit    — valid rows POSTed to /<commitUrl>; server inserts +
 *                  returns counts. Success message + close.
 *
 * The dialog itself is module-agnostic: a consumer passes a `BulkImportConfig`
 * that names the columns, target URLs, and a couple of strings. Everything
 * else — the wizard steps, parse logic, retry handling — is owned here.
 *
 * Why this shape:
 *   • Single dialog file = one bug fix benefits every module.
 *   • Server-driven validation means new fields don't require an FE deploy.
 *   • Step UX matches what HR users learn once and reuse everywhere.
 */
import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter, toast,
} from '@/components/ui/overlays'
import { Button } from '@/components/ui/button'
import { CheckCircle2, AlertCircle, Copy, Upload, FileSpreadsheet, Download, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

export interface BulkImportColumn {
    key: string
    label: string
    /** Renders the cell value in the preview table. Defaults to String(v). */
    render?: (value: unknown) => React.ReactNode
    /** Hint text shown in the help drawer above the upload area. */
    hint?: string
}

export interface BulkImportConfig {
    /** Page title shown at the top of the dialog. */
    title: string
    /** Short subtitle / "what is this for". */
    description: string
    /** Path (without /api/v1 prefix) — GET returns an .xlsx template. */
    templateUrl: string
    /** Path — POST { rows } → { rows: RowResult[], summary }. */
    validateUrl: string
    /** Path — POST { rows } → { inserted, skipped? }. */
    commitUrl: string
    /** Columns rendered in the preview table. */
    columns: BulkImportColumn[]
    /** Tags to label the file pickers (e.g. "Holidays file"). */
    fileLabel?: string
    /** Optional onSuccess callback (e.g. invalidate a list query). */
    onCommitted?: (result: CommitResult) => void
}

export interface RowResult {
    rowNumber: number
    raw: Record<string, unknown>
    value?: Record<string, unknown>
    errors: string[]
    ok: boolean
    duplicate?: boolean
}

export interface ValidateResult {
    rows: RowResult[]
    summary: {
        total: number
        ok: number
        invalid: number
        duplicate?: number
    }
}

export interface CommitResult {
    inserted: number
    skipped?: number
}

type Step = 'upload' | 'preview' | 'committing' | 'done'

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
    config: BulkImportConfig
}

export function BulkImportDialog({ open, onOpenChange, config }: Props) {
    const [step, setStep] = useState<Step>('upload')
    const [file, setFile] = useState<File | null>(null)
    const [parsing, setParsing] = useState(false)
    const [validating, setValidating] = useState(false)
    const [validation, setValidation] = useState<ValidateResult | null>(null)
    const [committed, setCommitted] = useState<CommitResult | null>(null)
    const [dragOver, setDragOver] = useState(false)
    const inputRef = useRef<HTMLInputElement | null>(null)

    const reset = () => {
        setStep('upload')
        setFile(null)
        setParsing(false)
        setValidating(false)
        setValidation(null)
        setCommitted(null)
        setDragOver(false)
    }

    const handleClose = () => {
        if (validating) return
        reset()
        onOpenChange(false)
    }

    // Sync: on open, snap back to step 1 so a re-open starts clean.
    const [lastOpen, setLastOpen] = useState(open)
    if (open !== lastOpen) {
        setLastOpen(open)
        if (open) reset()
    }

    const acceptFile = async (f: File) => {
        setFile(f)
        setParsing(true)
        try {
            const buf = await f.arrayBuffer()
            const wb = XLSX.read(buf, { type: 'array', cellDates: true })
            const sheet = wb.Sheets[wb.SheetNames[0]!]
            if (!sheet) throw new Error('Sheet is empty')
            const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false })
            if (rows.length === 0) {
                toast.error('Empty file', 'No data rows found below the header.')
                setParsing(false)
                return
            }
            // Parse done — call validate.
            setValidating(true)
            const result = await api.post<{ data: ValidateResult }>(config.validateUrl, { rows })
            setValidation(result.data)
            setStep('preview')
        } catch (err) {
            toast.error('Could not read file', err instanceof Error ? err.message : 'Unknown error')
        } finally {
            setParsing(false)
            setValidating(false)
        }
    }

    const handleCommit = async () => {
        if (!validation) return
        const okRows = validation.rows.reduce<Record<string, unknown>[]>((acc, r) => {
            if (r.ok) acc.push(r.value ?? r.raw)
            return acc
        }, [])
        if (okRows.length === 0) {
            toast.error('Nothing to import', 'All rows had errors.')
            return
        }
        setStep('committing')
        try {
            const result = await api.post<{ data: CommitResult }>(config.commitUrl, { rows: okRows })
            setCommitted(result.data)
            setStep('done')
            config.onCommitted?.(result.data)
        } catch (err) {
            toast.error('Import failed', err instanceof Error ? err.message : 'Unknown error')
            setStep('preview')
        }
    }

    const handleDownloadTemplate = async () => {
        try {
            const blob = await api.download(config.templateUrl)
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            const fallbackName = (config.templateUrl.split('/').pop() ?? 'template') + '.xlsx'
            a.download = fallbackName
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
        } catch (err) {
            toast.error('Download failed', err instanceof Error ? err.message : 'Unknown error')
        }
    }

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
            <DialogContent className="sm:max-w-3xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
                <DialogHeader className="px-6 pt-5 pb-4 border-b">
                    <DialogTitle className="text-base">{config.title}</DialogTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">{config.description}</p>
                    <StepIndicator step={step} />
                </DialogHeader>

                <DialogBody className="px-6 py-5 overflow-y-auto">
                    {step === 'upload' && (
                        <UploadStep
                            config={config}
                            file={file}
                            parsing={parsing || validating}
                            dragOver={dragOver}
                            setDragOver={setDragOver}
                            onPick={() => inputRef.current?.click()}
                            onDownloadTemplate={handleDownloadTemplate}
                        />
                    )}
                    {step === 'preview' && validation && (
                        <PreviewStep config={config} validation={validation} />
                    )}
                    {step === 'committing' && (
                        <div className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
                            <Loader2 className="size-8 animate-spin text-primary" />
                            <p className="text-sm">Importing records…</p>
                        </div>
                    )}
                    {step === 'done' && committed && (
                        <DoneStep config={config} committed={committed} />
                    )}
                </DialogBody>

                <DialogFooter className="px-6 py-4 border-t bg-muted/20 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground">
                        {step === 'upload' && (file ? <>Selected <code>{file.name}</code></> : 'Step 1 of 3: choose a file')}
                        {step === 'preview' && validation && (
                            <>
                                Step 2 of 3: review · <strong>{validation.summary.ok}</strong> ready,{' '}
                                <strong className="text-rose-600">{validation.summary.invalid}</strong> error
                                {validation.summary.duplicate ? <>, <strong className="text-amber-600">{validation.summary.duplicate}</strong> duplicate</> : null}
                            </>
                        )}
                        {step === 'committing' && 'Step 3 of 3: committing…'}
                        {step === 'done' && 'Finished'}
                    </span>
                    <div className="flex items-center gap-2">
                        {step !== 'done' && (
                            <Button size="sm" variant="ghost" onClick={handleClose} disabled={validating}>
                                Cancel
                            </Button>
                        )}
                        {step === 'preview' && validation && (
                            <>
                                <Button size="sm" variant="outline" onClick={() => { reset() }}>
                                    Back
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={handleCommit}
                                    disabled={validation.summary.ok === 0}
                                >
                                    Import {validation.summary.ok} row{validation.summary.ok === 1 ? '' : 's'}
                                </Button>
                            </>
                        )}
                        {step === 'done' && (
                            <Button size="sm" onClick={handleClose}>Done</Button>
                        )}
                    </div>
                </DialogFooter>

                {/* Hidden file picker — driven by the visible drop zone above */}
                <input
                    ref={inputRef}
                    type="file"
                    aria-label="Upload spreadsheet file"
                    className="hidden"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) void acceptFile(f)
                        e.target.value = ''
                    }}
                />
            </DialogContent>
        </Dialog>
    )
}

function StepIndicator({ step }: { step: Step }) {
    const order: Step[] = ['upload', 'preview', 'committing', 'done']
    const idx = order.indexOf(step)
    const labels: Record<Step, string> = {
        upload: 'Upload',
        preview: 'Preview',
        committing: 'Commit',
        done: 'Done',
    }
    return (
        <div className="mt-3 flex items-center gap-1.5">
            {(['upload', 'preview', 'committing', 'done'] as const).map((s, i) => {
                const active = i <= idx
                const current = i === idx
                return (
                    <div key={s} className="flex items-center gap-1.5">
                        <span className={cn(
                            'inline-flex items-center justify-center size-5 rounded-full text-[10px] font-bold border transition-colors',
                            active ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-border',
                            current && 'ring-2 ring-primary/30',
                        )}>{i + 1}</span>
                        <span className={cn('text-[11px] font-medium', active ? 'text-foreground' : 'text-muted-foreground')}>
                            {labels[s]}
                        </span>
                        {i < 3 && <span className={cn('w-6 h-px', i < idx ? 'bg-primary' : 'bg-border')} />}
                    </div>
                )
            })}
        </div>
    )
}

function UploadStep({
    config, file, parsing, dragOver, setDragOver, onPick, onDownloadTemplate,
}: {
    config: BulkImportConfig
    file: File | null
    parsing: boolean
    dragOver: boolean
    setDragOver: (v: boolean) => void
    onPick: () => void
    onDownloadTemplate: () => void
}) {
    return (
        <div className="space-y-4">
            {/* Template card */}
            <div className="rounded-lg border bg-muted/20 p-3 flex items-center justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                    <FileSpreadsheet className="size-4 text-primary shrink-0 mt-0.5" />
                    <div className="min-w-0">
                        <p className="text-sm font-medium">Start with the template</p>
                        <p className="text-[11px] text-muted-foreground">
                            Download, fill in the columns, then drop the file below. The sample row shows the expected format.
                        </p>
                    </div>
                </div>
                <Button size="sm" variant="outline" onClick={onDownloadTemplate} leftIcon={<Download className="size-3.5" />}>
                    Template
                </Button>
            </div>

            {/* Columns hint */}
            {config.columns.some((c) => c.hint) && (
                <div className="rounded-lg border p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Column reference</p>
                    <ul className="text-[11px] space-y-1">
                        {config.columns.filter((c) => c.hint).map((c) => (
                            <li key={c.key} className="flex gap-2">
                                <code className="font-mono text-foreground shrink-0">{c.key}</code>
                                <span className="text-muted-foreground">{c.hint}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Drop zone */}
            <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                    e.preventDefault()
                    setDragOver(false)
                    const f = e.dataTransfer.files?.[0]
                    if (f) void (async () => { /* trigger the parent's onPick path via change */ })()
                }}
                className={cn(
                    'rounded-xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer',
                    dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-foreground/30',
                )}
                onClick={onPick}
                role="button"
                tabIndex={0}
            >
                {parsing ? (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Loader2 className="size-6 animate-spin text-primary" />
                        <p className="text-sm">Parsing {file?.name}…</p>
                    </div>
                ) : file ? (
                    <div className="flex flex-col items-center gap-2">
                        <FileSpreadsheet className="size-8 text-primary" />
                        <p className="text-sm font-medium">{file.name}</p>
                        <p className="text-[11px] text-muted-foreground">Click to pick a different file</p>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Upload className="size-8 opacity-50" />
                        <p className="text-sm">
                            Drop your <strong>{config.fileLabel ?? 'file'}</strong> here, or click to browse
                        </p>
                        <p className="text-[10px]">.xlsx, .xls, .csv up to ~5 MB</p>
                    </div>
                )}
            </div>
        </div>
    )
}

function PreviewStep({ config, validation }: { config: BulkImportConfig; validation: ValidateResult }) {
    const { rows, summary } = validation
    return (
        <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
                <SummaryTile label="Total" value={summary.total} tone="slate" />
                <SummaryTile label="Ready to import" value={summary.ok} tone="emerald" />
                <SummaryTile label="Errors" value={summary.invalid + (summary.duplicate ?? 0)} tone="rose" />
            </div>
            <div className="rounded-lg border overflow-hidden">
                <div className="overflow-x-auto max-h-[400px]">
                    <table className="w-full text-xs">
                        <thead className="bg-muted/50 sticky top-0 z-10">
                            <tr>
                                <th className="px-2 py-2 text-left font-semibold w-12">#</th>
                                <th className="px-2 py-2 text-left font-semibold w-24">Status</th>
                                {config.columns.map((c) => (
                                    <th key={c.key} className="px-2 py-2 text-left font-semibold whitespace-nowrap">{c.label}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {rows.map((r) => (
                                <tr key={r.rowNumber} className={cn(!r.ok && 'bg-rose-50/40 dark:bg-rose-950/15')}>
                                    <td className="px-2 py-1.5 text-muted-foreground tabular-nums">{r.rowNumber}</td>
                                    <td className="px-2 py-1.5">
                                        {r.ok
                                            ? <Badge tone="emerald" icon={<CheckCircle2 className="size-3" />}>OK</Badge>
                                            : r.duplicate
                                                ? <Badge tone="amber" icon={<Copy className="size-3" />}>Duplicate</Badge>
                                                : <Badge tone="rose" icon={<AlertCircle className="size-3" />}>Invalid</Badge>}
                                    </td>
                                    {config.columns.map((c) => (
                                        <td key={c.key} className="px-2 py-1.5 align-top">
                                            <span className="block">
                                                {c.render
                                                    ? c.render(r.raw[c.key])
                                                    : (r.raw[c.key] ?? '') === '' ? <span className="text-muted-foreground/50">—</span> : String(r.raw[c.key])}
                                            </span>
                                            {r.errors.length > 0 && c.key === config.columns[0]!.key && (
                                                <ul className="mt-0.5 text-[10px] text-rose-600 space-y-0.5">
                                                    {r.errors.map((e, i) => <li key={i}>· {e}</li>)}
                                                </ul>
                                            )}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}

function DoneStep({ committed }: { config: BulkImportConfig; committed: CommitResult }) {
    return (
        <div className="py-8 flex flex-col items-center gap-3 text-center">
            <div className="size-14 rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
                <CheckCircle2 className="size-7 text-emerald-600" />
            </div>
            <p className="text-base font-semibold">
                Imported {committed.inserted} record{committed.inserted === 1 ? '' : 's'}
            </p>
            {committed.skipped != null && committed.skipped > 0 && (
                <p className="text-xs text-muted-foreground">
                    {committed.skipped} row{committed.skipped === 1 ? '' : 's'} skipped as duplicates.
                </p>
            )}
        </div>
    )
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone: 'slate' | 'emerald' | 'rose' }) {
    const toneClass = {
        slate: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-800',
        emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
        rose: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900',
    }[tone]
    return (
        <div className={cn('rounded-lg border p-2.5', toneClass)}>
            <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80">{label}</p>
            <p className="text-lg font-bold tabular-nums">{value}</p>
        </div>
    )
}

function Badge({ tone, icon, children }: { tone: 'emerald' | 'amber' | 'rose'; icon: React.ReactNode; children: React.ReactNode }) {
    const toneClass = {
        emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
        amber: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
        rose: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
    }[tone]
    return (
        <span className={cn('inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold', toneClass)}>
            {icon}
            {children}
        </span>
    )
}
