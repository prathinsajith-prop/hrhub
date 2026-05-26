// ─── Bulk Import Candidates dialog ──────────────────────────────────────────
//
// Three-stage UX (matches the assets / jobs / mappings dialogs):
//   1. Pick the target job + download the template.
//   2. Upload the filled-in .xlsx (LinkedIn export or any ATS export).
//   3. Preview → save.
//
// Header-alias detection: HR shouldn't have to clean up a LinkedIn export
// or a Workable / Greenhouse / BambooHR / Recruitee CSV. The parser maps
// common headers to our canonical schema BEFORE sending rows to the
// server-side validator. The server then re-runs validation + dedup
// against the target job's live pipeline.
//
// Duplicate rule: same email + same job in any stage except 'rejected' is
// flagged as a *duplicate* (orange) at preview. Those rows are skipped at
// save without erroring out the rest of the batch.

import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    UploadCloud, FileSpreadsheet, X, CheckCircle2, AlertCircle, Download, Loader2,
    Briefcase, UserX,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter, toast,
} from '@/components/ui/overlays'
import { Badge, Label } from '@/components/ui/primitives'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/form-controls'
import { api } from '@/lib/api'
import {
    useJobs, useValidateBulkCandidates, useBulkCreateCandidates,
    type BulkCandidateRowInput, type BulkCandidateRowResult,
} from '@/hooks/useRecruitment'
import { cn } from '@/lib/utils'

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** When set, the job picker is pre-selected (e.g. when the user opens
     *  the dialog from a specific job's detail page). HR can still change
     *  it before importing. */
    initialJobId?: string
}

// Header alias table — case-insensitive, whitespace + underscores collapsed.
// Both LinkedIn ("First Name", "Email Address") and ATS variants ("Candidate
// Name", "Years of Experience") are normalised onto one canonical column
// name before the row is passed to the server.
//
// Add aliases here as new ATS exports show up — keeping the table central
// (rather than scattered through the parser) is what lets us add a new
// vendor by appending one line.
const HEADER_ALIASES: Record<string, string> = {
    // first_name
    'first name': 'firstName',
    'first_name': 'firstName',
    'firstname': 'firstName',
    'given name': 'firstName',
    'given_name': 'firstName',
    'fname': 'firstName',
    // last_name
    'last name': 'lastName',
    'last_name': 'lastName',
    'lastname': 'lastName',
    'surname': 'lastName',
    'family name': 'lastName',
    'family_name': 'lastName',
    'lname': 'lastName',
    // full name
    'name': 'name',
    'full name': 'name',
    'full_name': 'name',
    'candidate name': 'name',
    'candidate_name': 'name',
    'fullname': 'name',
    // email
    'email': 'email',
    'email address': 'email',
    'email_address': 'email',
    'e-mail': 'email',
    'e_mail': 'email',
    'emailaddress': 'email',
    // phone
    'phone': 'phone',
    'phone number': 'phone',
    'phone_number': 'phone',
    'phonenumber': 'phone',
    'mobile': 'phone',
    'mobile number': 'phone',
    'contact': 'phone',
    'contact number': 'phone',
    // nationality
    'nationality': 'nationality',
    'country': 'nationality',
    'location': 'nationality',
    // experience
    'experience': 'experience',
    'years of experience': 'experience',
    'yrs exp': 'experience',
    'yrs_exp': 'experience',
    'exp_years': 'experience',
    'experience_years': 'experience',
    // expected salary
    'expected salary': 'expectedSalary',
    'expected_salary': 'expectedSalary',
    'salary': 'expectedSalary',
    'compensation': 'expectedSalary',
    'expected compensation': 'expectedSalary',
    // notes
    'notes': 'notes',
    'note': 'notes',
    'remarks': 'notes',
    'comments': 'notes',
    'description': 'notes',
    'headline': 'notes',
}

function normalizeHeader(raw: string): string {
    return raw.trim().toLowerCase().replace(/[\s_-]+/g, ' ').replace(/\s+/g, ' ')
}

type LocalRow = BulkCandidateRowInput & { serverResult?: BulkCandidateRowResult }

const MAX_ROWS = 500

export function BulkImportCandidatesDialog({ open, onOpenChange, initialJobId }: Props) {
    const { t } = useTranslation()
    const validate = useValidateBulkCandidates()
    const create = useBulkCreateCandidates()

    // Job picker — only OPEN jobs are eligible (closed/draft jobs would
    // hide the candidates from the recruiter's view). HR can change this
    // before importing.
    const jobsQuery = useJobs({ status: 'open', limit: 200 })
    const jobList = useMemo(() => {
        const data = (jobsQuery.data as unknown as { data?: Array<{ id: string; title: string; department?: string | null }> } | undefined)
        return data?.data ?? []
    }, [jobsQuery.data])

    const [jobId, setJobId] = useState<string>(initialJobId ?? '')
    const [file, setFile] = useState<File | null>(null)
    const [rows, setRows] = useState<LocalRow[]>([])
    const [parseError, setParseError] = useState<string | null>(null)
    const [downloading, setDownloading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement | null>(null)

    // State-during-render reset on open — same pattern as the other bulk
    // dialogs. We also re-pin the initial job id every time the dialog
    // re-opens with a different `initialJobId`.
    const [wasOpen, setWasOpen] = useState(false)
    if (open !== wasOpen) {
        setWasOpen(open)
        if (open) {
            setFile(null)
            setRows([])
            setParseError(null)
            setJobId(initialJobId ?? '')
        }
    }

    async function handleDownloadTemplate() {
        setDownloading(true)
        try {
            const blob = await api.download('/applications/bulk-template')
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'candidates-bulk-template.xlsx'
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
        } catch (err) {
            toast.error(
                t('recruitment.bulkCandidates.downloadFailed', { defaultValue: 'Could not download template' }),
                err instanceof Error ? err.message : 'Unknown error',
            )
        } finally {
            setDownloading(false)
        }
    }

    async function parseFile(picked: File) {
        setFile(picked)
        setParseError(null)
        if (!jobId) {
            setParseError(t('recruitment.bulkCandidates.jobRequired', { defaultValue: 'Pick a target job first, then upload the file.' }))
            return
        }
        try {
            const buffer = await picked.arrayBuffer()
            const XLSX = await import('xlsx')
            const wb = XLSX.read(buffer, { type: 'array' })
            const firstSheet = wb.Sheets[wb.SheetNames[0]]
            if (!firstSheet) {
                setParseError(t('recruitment.bulkCandidates.noSheets', { defaultValue: 'Workbook contains no sheets.' }))
                setRows([])
                return
            }
            // Read the raw 2D array first so we can resolve headers ourselves
            // — `sheet_to_json` with `header: 1` returns arrays-of-arrays;
            // anything fancier and we lose control over alias mapping.
            const aoa = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { defval: '', raw: true, header: 1 })
            if (aoa.length === 0) {
                setParseError(t('recruitment.bulkCandidates.emptySheet', { defaultValue: 'Sheet is empty. Download the template for the correct format.' }))
                setRows([])
                return
            }
            const headerRow = (aoa[0] ?? []) as unknown[]
            // Map every header cell to a canonical field (or undefined when
            // we don't know it — those columns are silently ignored).
            const canonicalByIndex: Array<string | undefined> = headerRow.map((h) =>
                HEADER_ALIASES[normalizeHeader(String(h ?? ''))],
            )
            const knownColumns = canonicalByIndex.filter(Boolean).length
            if (knownColumns === 0) {
                setParseError(
                    t('recruitment.bulkCandidates.headerMismatch', {
                        defaultValue: 'No known columns found. Headers must include at least name + email (or first_name + last_name + email).',
                    }),
                )
                setRows([])
                return
            }
            const dataRows = aoa.slice(1)
            if (dataRows.length > MAX_ROWS) {
                setParseError(
                    t('recruitment.bulkCandidates.tooManyRows', {
                        defaultValue: 'Maximum {{max}} rows per import (this file has {{count}}).',
                        max: MAX_ROWS, count: dataRows.length,
                    }),
                )
                setRows([])
                return
            }

            // Drop rows with no email AND no name AND no first/last — that's
            // HR saying "this line isn't a real candidate". Keeps the
            // preview focused on the rows that actually want to be imported.
            const parsed: LocalRow[] = dataRows.reduce<LocalRow[]>((acc, cells, idx) => {
                const row: Record<string, string> = {}
                cells.forEach((cell, colIdx) => {
                    const key = canonicalByIndex[colIdx]
                    if (!key) return
                    const v = cell == null ? '' : String(cell).trim()
                    if (v) row[key] = v
                })
                // Skip totally blank rows.
                const hasName = !!(row.name || row.firstName || row.lastName)
                if (!row.email && !hasName) return acc
                acc.push({
                    rowNumber: idx + 2,
                    firstName: row.firstName ?? null,
                    lastName: row.lastName ?? null,
                    name: row.name ?? null,
                    email: row.email ?? null,
                    phone: row.phone ?? null,
                    nationality: row.nationality ?? null,
                    experience: row.experience ?? null,
                    expectedSalary: row.expectedSalary ?? null,
                    notes: row.notes ?? null,
                })
                return acc
            }, [])
            if (parsed.length === 0) {
                setParseError(
                    t('recruitment.bulkCandidates.allEmpty', {
                        defaultValue: 'No usable rows found. Make sure at least name + email are filled in.',
                    }),
                )
                setRows([])
                return
            }
            setRows(parsed)

            // Auto-run server validation so HR sees the preview straight away.
            try {
                const result = await validate.mutateAsync({ jobId, rows: parsed })
                const byNumber = new Map(result.rows.map((r) => [r.rowNumber, r]))
                setRows(parsed.map((p) => ({ ...p, serverResult: byNumber.get(p.rowNumber) })))
            } catch (err) {
                toast.error(
                    t('recruitment.bulkCandidates.validateFailed', { defaultValue: 'Validation failed' }),
                    err instanceof Error ? err.message : 'Unknown error',
                )
            }
        } catch (err) {
            setParseError(err instanceof Error ? err.message : 'Could not parse file.')
            setRows([])
        }
    }

    const validCount = useMemo(() => rows.filter((r) => r.serverResult?.ok && !r.serverResult?.duplicate).length, [rows])
    const duplicateCount = useMemo(() => rows.filter((r) => r.serverResult?.duplicate).length, [rows])
    const invalidCount = useMemo(() => rows.filter((r) => r.serverResult && !r.serverResult.ok && !r.serverResult.duplicate).length, [rows])
    const pendingCount = useMemo(() => rows.filter((r) => !r.serverResult).length, [rows])
    const canSubmit = !!jobId && rows.length > 0 && validCount > 0 && !validate.isPending && !create.isPending

    function clearFile() {
        setFile(null)
        setRows([])
        setParseError(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    async function handleSubmit() {
        if (!canSubmit) return
        try {
            const result = await create.mutateAsync({ jobId, rows })
            toast.success(
                t('recruitment.bulkCandidates.savedTitle', {
                    defaultValue: '{{count}} candidate(s) imported',
                    count: result.created,
                }),
                result.skipped > 0
                    ? t('recruitment.bulkCandidates.savedSkipped', {
                        defaultValue: '{{count}} row(s) skipped (duplicates or errors).',
                        count: result.skipped,
                    })
                    : undefined,
            )
            onOpenChange(false)
        } catch {
            /* hook already surfaces a toast */
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-4xl">
                <DialogHeader>
                    <DialogTitle>
                        {t('recruitment.bulkCandidates.title', { defaultValue: 'Bulk import candidates' })}
                    </DialogTitle>
                </DialogHeader>
                <DialogBody className="space-y-4">
                    {/* Step 1 — job picker + template download. Job is
                        required before parsing kicks off so we can run the
                        per-job duplicate check at preview time. */}
                    <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                        <div className="flex items-start gap-3">
                            <Briefcase className="size-4 mt-0.5 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0 space-y-1">
                                <p className="text-sm font-medium">
                                    {t('recruitment.bulkCandidates.step1', { defaultValue: '1. Pick the job and download the template' })}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {t('recruitment.bulkCandidates.step1Hint', {
                                        defaultValue: 'Every row in the file lands as a candidate for the selected job. The template accepts LinkedIn export columns AND common ATS headers — see the Reference sheet inside it.',
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
                                {t('recruitment.bulkCandidates.downloadTemplate', { defaultValue: 'Download template' })}
                            </Button>
                        </div>
                        <div className="grid sm:grid-cols-[160px_1fr] items-center gap-2">
                            <Label className="text-xs font-medium">
                                {t('recruitment.bulkCandidates.targetJob', { defaultValue: 'Target job' })} <span className="text-rose-500">*</span>
                            </Label>
                            <Select value={jobId} onValueChange={setJobId}>
                                <SelectTrigger className="h-9 text-sm">
                                    <SelectValue placeholder={t('recruitment.bulkCandidates.pickJob', { defaultValue: 'Select an open job…' })} />
                                </SelectTrigger>
                                <SelectContent>
                                    {jobList.length === 0 ? (
                                        <SelectItem value="__none__" disabled>
                                            {t('recruitment.bulkCandidates.noJobs', { defaultValue: 'No open jobs — create one first.' })}
                                        </SelectItem>
                                    ) : (
                                        jobList.map((j) => (
                                            <SelectItem key={j.id} value={j.id}>
                                                {j.title}{j.department ? ` — ${j.department}` : ''}
                                            </SelectItem>
                                        ))
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Step 2 — file picker. Disabled until a job is picked
                        so HR can't upload, then realise they had to
                        choose a job first. */}
                    <div className={cn('rounded-lg border p-3 space-y-2', !jobId && 'opacity-60')}>
                        <p className="text-sm font-medium">
                            {t('recruitment.bulkCandidates.step2', { defaultValue: '2. Upload the filled-in file' })}
                        </p>
                        {!file ? (
                            <label className={cn(
                                'flex items-center justify-center gap-2 rounded-md border border-dashed bg-background px-4 py-6 transition-colors',
                                jobId ? 'cursor-pointer hover:bg-muted/40' : 'cursor-not-allowed',
                            )}>
                                <UploadCloud className="size-4 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">
                                    {jobId
                                        ? t('recruitment.bulkCandidates.choosePrompt', {
                                            defaultValue: 'Click to choose an .xlsx file (max {{max}} candidates)',
                                            max: MAX_ROWS,
                                        })
                                        : t('recruitment.bulkCandidates.pickJobFirst', { defaultValue: 'Pick a job above first.' })}
                                </span>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                                    className="hidden"
                                    disabled={!jobId}
                                    onChange={(e) => {
                                        const picked = e.target.files?.[0]
                                        if (picked) parseFile(picked)
                                    }}
                                    aria-label={t('recruitment.bulkCandidates.chooseFile', { defaultValue: 'Choose file' })}
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

                    {/* Step 3 — preview. Three counters: ready / duplicate /
                        error. Duplicates are not errors — they're valid
                        rows we just won't insert a second copy of. */}
                    {rows.length > 0 && (
                        <div className="rounded-lg border overflow-hidden">
                            <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2 text-xs">
                                <p className="font-medium">
                                    {t('recruitment.bulkCandidates.previewTitle', {
                                        defaultValue: '3. Preview ({{total}} row{{plural}})',
                                        total: rows.length,
                                        plural: rows.length === 1 ? '' : 's',
                                    })}
                                </p>
                                <div className="flex items-center gap-3 text-[11px]">
                                    {validate.isPending || pendingCount > 0 ? (
                                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                                            <Loader2 className="size-3 animate-spin" />
                                            {t('recruitment.bulkCandidates.validating', { defaultValue: 'Validating…' })}
                                        </span>
                                    ) : (
                                        <>
                                            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                                                <CheckCircle2 className="size-3" />
                                                {t('recruitment.bulkCandidates.validCount', { count: validCount, defaultValue: '{{count}} ready' })}
                                            </span>
                                            {duplicateCount > 0 && (
                                                <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                                                    <UserX className="size-3" />
                                                    {t('recruitment.bulkCandidates.duplicateCount', { count: duplicateCount, defaultValue: '{{count}} duplicate' })}
                                                </span>
                                            )}
                                            {invalidCount > 0 && (
                                                <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-400">
                                                    <AlertCircle className="size-3" />
                                                    {t('recruitment.bulkCandidates.invalidCount', { count: invalidCount, defaultValue: '{{count}} with errors' })}
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
                                            <th className="px-2 py-1.5 text-start">{t('recruitment.bulkCandidates.colName', { defaultValue: 'Name' })}</th>
                                            <th className="px-2 py-1.5 text-start">{t('recruitment.bulkCandidates.colEmail', { defaultValue: 'Email' })}</th>
                                            <th className="px-2 py-1.5 text-start w-32">{t('recruitment.bulkCandidates.colPhone', { defaultValue: 'Phone' })}</th>
                                            <th className="px-2 py-1.5 text-start w-32">{t('recruitment.bulkCandidates.colResult', { defaultValue: 'Result' })}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {rows.map((r) => {
                                            const result = r.serverResult
                                            const status = result?.duplicate
                                                ? 'duplicate' as const
                                                : result?.ok
                                                    ? 'ok' as const
                                                    : result
                                                        ? 'error' as const
                                                        : 'pending' as const
                                            const displayName = result?.displayName ?? r.name ?? [r.firstName, r.lastName].filter(Boolean).join(' ')
                                            return (
                                                <tr
                                                    key={r.rowNumber}
                                                    className={cn(
                                                        status === 'error' && 'bg-rose-50/40 dark:bg-rose-950/20',
                                                        status === 'duplicate' && 'bg-amber-50/40 dark:bg-amber-950/20',
                                                        status === 'ok' && 'hover:bg-muted/30',
                                                    )}
                                                >
                                                    <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{r.rowNumber}</td>
                                                    <td className="px-2 py-1.5">{displayName || <span className="text-rose-600">—</span>}</td>
                                                    <td className="px-2 py-1.5 text-muted-foreground">{r.email || <span className="text-rose-600">—</span>}</td>
                                                    <td className="px-2 py-1.5 text-muted-foreground">{r.phone || <span className="text-muted-foreground">—</span>}</td>
                                                    <td className="px-2 py-1.5">
                                                        {status === 'pending' ? (
                                                            <Badge variant="secondary" className="text-[10px]">
                                                                {t('common.pending', { defaultValue: 'pending' })}
                                                            </Badge>
                                                        ) : status === 'ok' ? (
                                                            <Badge variant="success" className="text-[10px]">
                                                                <CheckCircle2 className="size-2.5 me-0.5" />
                                                                {t('recruitment.bulkCandidates.ready', { defaultValue: 'ready' })}
                                                            </Badge>
                                                        ) : status === 'duplicate' ? (
                                                            <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400" title={result?.errors.join('; ')}>
                                                                <UserX className="size-2.5" />
                                                                {t('recruitment.bulkCandidates.duplicate', { defaultValue: 'already applied' })}
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 text-[10px] text-rose-700 dark:text-rose-400" title={result?.errors.join('; ')}>
                                                                <AlertCircle className="size-2.5" />
                                                                {result?.errors[0] ?? t('recruitment.bulkCandidates.invalid', { defaultValue: 'error' })}
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
                                {t('recruitment.bulkCandidates.saving', { defaultValue: 'Saving…' })}
                            </>
                        ) : (
                            t('recruitment.bulkCandidates.save', { defaultValue: 'Import {{count}}', count: validCount })
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
