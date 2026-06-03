import { useMemo, useRef, useState, useCallback, type FormEvent, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
    AlertCircle,
    Briefcase,
    CheckCircle2,
    Clock,
    Download,
    FileText,
    HeartPulse,
    Landmark,
    ScrollText,
    ShieldCheck,
    Stamp,
    Upload,
    X,
    XCircle,
} from 'lucide-react'

import { ApiError } from '@/lib/api'
import {
    triggerDocumentDownload,
    useMyDocuments,
    useUploadMyDocument,
    type DocumentCategory,
    type DocumentStatus,
    type MyDocument,
    type UploadDocumentInput,
} from '@/hooks/useDocuments'
import {
    CATEGORY_DISPLAY_ORDER,
    CATEGORY_LABELS,
    DOC_TYPE_CATALOG,
    docNumberMeta,
    getDocType,
} from '@/lib/docTypes'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { cn, formatDate } from '@/lib/utils'

// ─── Icon + label per category ───────────────────────────────────────────────
const CATEGORY_META: Record<DocumentCategory, { label: string; icon: typeof FileText; tone: string }> = {
    identity: { label: 'Identity', icon: ShieldCheck, tone: 'text-indigo-600 dark:text-indigo-300' },
    visa: { label: 'Visa & permits', icon: Stamp, tone: 'text-sky-600 dark:text-sky-300' },
    company: { label: 'Company', icon: Briefcase, tone: 'text-fuchsia-600 dark:text-fuchsia-300' },
    employment: { label: 'Employment', icon: ScrollText, tone: 'text-emerald-600 dark:text-emerald-300' },
    insurance: { label: 'Insurance', icon: HeartPulse, tone: 'text-rose-600 dark:text-rose-300' },
    qualification: { label: 'Qualifications', icon: FileText, tone: 'text-amber-600 dark:text-amber-300' },
    financial: { label: 'Financial', icon: Landmark, tone: 'text-violet-600 dark:text-violet-300' },
    compliance: { label: 'Compliance', icon: ShieldCheck, tone: 'text-teal-600 dark:text-teal-300' },
}

const STATUS_TONE: Record<DocumentStatus, string> = {
    valid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
    expiring_soon: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    expired: 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
    pending_upload: 'bg-muted text-muted-foreground',
    under_review: 'bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300',
    rejected: 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
}

function statusLabel(s: DocumentStatus): string {
    return s.replace(/_/g, ' ')
}

function humanFileSize(bytes: number | null): string {
    if (bytes == null) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function EmployeeDocumentsPage() {
    const { t: _t } = useTranslation()
    const { data: docs, isLoading } = useMyDocuments()
    const [uploadOpen, setUploadOpen] = useState(false)

    // Group by category for visual scanning
    const grouped = useMemo(() => {
        const map = new Map<DocumentCategory, MyDocument[]>()
        for (const d of docs ?? []) {
            const arr = map.get(d.category) ?? []
            arr.push(d)
            map.set(d.category, arr)
        }
        return Array.from(map.entries()).sort(([a], [b]) =>
            (CATEGORY_META[a]?.label ?? a).localeCompare(CATEGORY_META[b]?.label ?? b),
        )
    }, [docs])

    const totalCount = docs?.length ?? 0
    const expiringCount = docs?.filter((d) => d.status === 'expiring_soon' || d.status === 'expired').length ?? 0

    return (
        <div className="space-y-5">
            <PageHeader
                title="My documents"
                subtitle={
                    isLoading
                        ? undefined
                        : totalCount === 0
                          ? undefined
                          : expiringCount > 0
                            ? `${totalCount} on file · ${expiringCount} need attention`
                            : `${totalCount} on file`
                }
                action={
                    <Button size="sm" onClick={() => setUploadOpen(true)}>
                        <Upload className="size-4" /> Upload
                    </Button>
                }
            />

            <UploadDocumentDialog open={uploadOpen} onOpenChange={setUploadOpen} />

            {isLoading ? (
                <div className="space-y-3">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-20" />
                    <Skeleton className="h-20" />
                    <Skeleton className="h-5 w-28" />
                    <Skeleton className="h-20" />
                </div>
            ) : totalCount === 0 ? (
                <EmptyState
                    icon={<FileText className="size-8" />}
                    title="No documents yet"
                    description="Upload your visa, contract or other personal documents. Your manager will review them before they go live."
                    action={
                        <Button size="sm" onClick={() => setUploadOpen(true)}>
                            <Upload className="size-4" /> Upload your first document
                        </Button>
                    }
                />
            ) : (
                grouped.map(([category, items]) => {
                    const meta = CATEGORY_META[category]
                    const Icon = meta?.icon ?? FileText
                    return (
                        <section key={category}>
                            <div className="mb-2 flex items-center gap-2">
                                <Icon className={cn('size-4', meta?.tone)} />
                                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    {meta?.label ?? category}
                                </h2>
                                <span className="text-[10px] tabular-figures text-muted-foreground/70">
                                    {items.length}
                                </span>
                            </div>
                            <div className="space-y-2">
                                {items.map((doc) => (
                                    <DocumentRow key={doc.id} doc={doc} />
                                ))}
                            </div>
                        </section>
                    )
                })
            )}
        </div>
    )
}

function DocumentRow({ doc }: { doc: MyDocument }) {
    const [downloading, setDownloading] = useState(false)

    async function download() {
        if (downloading) return
        setDownloading(true)
        try {
            await triggerDocumentDownload(doc.id)
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Download failed')
        } finally {
            setDownloading(false)
        }
    }

    const expired = doc.status === 'expired'
    const expiringSoon = doc.status === 'expiring_soon'

    return (
        <Card className="border-border/70">
            <CardContent className="flex items-center justify-between gap-3 p-3.5">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium">{doc.docType}</span>
                        <Badge
                            className={cn(
                                'border-0 text-[10px] uppercase tracking-wider',
                                STATUS_TONE[doc.status],
                            )}
                        >
                            {statusLabel(doc.status)}
                        </Badge>
                        {doc.verified ? (
                            <span
                                className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                                title={doc.verifiedAt ? `Verified ${formatDate(doc.verifiedAt)}` : 'Verified'}
                            >
                                <CheckCircle2 className="size-3" /> verified
                            </span>
                        ) : null}
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">{doc.fileName}</div>
                    {doc.status === 'rejected' && doc.rejectionReason ? (
                        <div className="mt-1 flex items-start gap-1 text-[11px] text-rose-700 dark:text-rose-300">
                            <XCircle className="mt-0.5 size-3 shrink-0" />
                            <span><span className="font-semibold">Rejected:</span> {doc.rejectionReason}</span>
                        </div>
                    ) : null}
                    {doc.status === 'under_review' ? (
                        <div className="mt-1 flex items-center gap-1 text-[11px] text-sky-700 dark:text-sky-300">
                            <Clock className="size-3" /> Awaiting manager approval
                        </div>
                    ) : null}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground/90">
                        {doc.docNumber ? <span>#{doc.docNumber}</span> : null}
                        {doc.issueDate ? <span>Issued {formatDate(doc.issueDate)}</span> : null}
                        {doc.expiryDate ? (
                            <span
                                className={cn(
                                    'inline-flex items-center gap-1',
                                    expired
                                        ? 'text-rose-600 dark:text-rose-300'
                                        : expiringSoon
                                          ? 'text-amber-700 dark:text-amber-300'
                                          : '',
                                )}
                            >
                                {(expired || expiringSoon) ? <AlertCircle className="size-3" /> : <Clock className="size-3" />}
                                Expires {formatDate(doc.expiryDate)}
                            </span>
                        ) : null}
                        {doc.fileSize ? <span>{humanFileSize(doc.fileSize)}</span> : null}
                    </div>
                </div>
                <Button
                    size="sm"
                    variant="outline"
                    onClick={download}
                    loading={downloading}
                    disabled={!doc.hasFile}
                    aria-label={doc.hasFile ? `Download ${doc.fileName}` : 'No file attached'}
                >
                    <Download className="size-4" />
                    <span className="hidden sm:inline">Download</span>
                </Button>
            </CardContent>
        </Card>
    )
}

const ALLOWED_MIME_TYPES = [
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]
const ALLOWED_FILE_TYPES = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx'
const MAX_FILE_BYTES = 10 * 1024 * 1024

/**
 * Add +1 year to a YYYY-MM-DD string. Used to auto-suggest expiry when the
 * employee fills in issue date for visas/permits that typically run a year.
 */
function addOneYear(dateStr: string): string {
    const d = new Date(dateStr)
    d.setFullYear(d.getFullYear() + 1)
    return d.toISOString().split('T')[0]!
}

function humanFileSizeShort(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function UploadDocumentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
    const upload = useUploadMyDocument()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const autoExpiryRef = useRef<string>('')

    const [docType, setDocType] = useState('')
    const [docNumber, setDocNumber] = useState('')
    const [issueDate, setIssueDate] = useState('')
    const [expiryDate, setExpiryDate] = useState('')
    const [notes, setNotes] = useState('')
    const [file, setFile] = useState<File | null>(null)
    const [dragging, setDragging] = useState(false)
    const [errors, setErrors] = useState<{ docType?: string; expiryDate?: string; file?: string }>({})

    const selectedDef = getDocType(docType)
    const expiryRequired = selectedDef?.expiryRequired ?? false
    const numberMeta = docType ? docNumberMeta(docType) : null

    function reset() {
        setDocType('')
        setDocNumber('')
        setIssueDate('')
        setExpiryDate('')
        setNotes('')
        setFile(null)
        setDragging(false)
        setErrors({})
        autoExpiryRef.current = ''
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    function handleClose(next: boolean) {
        if (!next) reset()
        onOpenChange(next)
    }

    function handleIssueDateChange(v: string) {
        setIssueDate(v)
        // Auto-populate expiry to +1y when the field is empty or still holds the
        // last auto value (user hasn't typed their own). Mirrors the HR dialog.
        if (v && (!expiryDate || expiryDate === autoExpiryRef.current)) {
            const auto = addOneYear(v)
            setExpiryDate(auto)
            autoExpiryRef.current = auto
        }
    }

    function handleExpiryDateChange(v: string) {
        setExpiryDate(v)
        autoExpiryRef.current = v
        if (v) setErrors((e) => ({ ...e, expiryDate: undefined }))
    }

    function pickFile(picked: File | null | undefined) {
        if (!picked) return
        const looksAllowed =
            ALLOWED_MIME_TYPES.includes(picked.type) ||
            /\.(pdf|jpg|jpeg|png|webp|doc|docx|xls|xlsx)$/i.test(picked.name)
        if (!looksAllowed) {
            toast.error('Invalid file type — use PDF, image, Word or Excel')
            return
        }
        if (picked.size > MAX_FILE_BYTES) {
            toast.error('File too large (max 10 MB)')
            return
        }
        setFile(picked)
        setErrors((e) => ({ ...e, file: undefined }))
    }

    const onDrop = useCallback((e: DragEvent) => {
        e.preventDefault()
        setDragging(false)
        pickFile(e.dataTransfer.files[0])
    }, [])

    const onDragOver = useCallback((e: DragEvent) => {
        e.preventDefault()
        setDragging(true)
    }, [])

    const onDragLeave = useCallback(() => setDragging(false), [])

    function onSubmit(e: FormEvent) {
        e.preventDefault()
        const newErrors: typeof errors = {}
        if (!docType) newErrors.docType = 'Please select a document type'
        if (expiryRequired && !expiryDate) newErrors.expiryDate = `${docType} requires an expiry date`
        if (!file) newErrors.file = 'Please choose a file to upload'
        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors)
            return
        }

        const category = (selectedDef?.category ?? 'identity') as DocumentCategory
        const payload: UploadDocumentInput = {
            file: file!,
            category,
            docType,
        }
        if (docNumber.trim()) payload.docNumber = docNumber.trim()
        if (issueDate) payload.issueDate = issueDate
        if (expiryDate) payload.expiryDate = expiryDate
        if (notes.trim()) payload.notes = notes.trim()

        upload.mutate(payload, {
            onSuccess: () => {
                toast.success(`${docType} submitted — awaiting manager approval`)
                handleClose(false)
            },
            onError: (err) => {
                toast.error(err instanceof ApiError ? err.message : 'Upload failed')
            },
        })
    }

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="flex max-h-[90vh] flex-col p-0 sm:max-w-2xl">
                <DialogHeader className="shrink-0 border-b px-6 pb-4 pt-6">
                    <DialogTitle className="text-lg font-semibold">Add Document</DialogTitle>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        Your manager will review the document before it appears as valid in your profile.
                    </p>
                </DialogHeader>

                <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
                    <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
                        {/* ── Document type ── */}
                        <div className="space-y-1.5">
                            <Label htmlFor="doc-type" className="text-sm font-medium">
                                Document Type <span className="text-destructive">*</span>
                            </Label>
                            <Select
                                value={docType}
                                onValueChange={(v) => {
                                    setDocType(v)
                                    setErrors((e) => ({ ...e, docType: undefined }))
                                }}
                            >
                                <SelectTrigger
                                    id="doc-type"
                                    aria-invalid={errors.docType ? 'true' : 'false'}
                                    className={cn(errors.docType && 'border-destructive')}
                                >
                                    <SelectValue placeholder="Select document type…" />
                                </SelectTrigger>
                                <SelectContent className="max-h-72">
                                    {CATEGORY_DISPLAY_ORDER.flatMap((cat) => {
                                        const items = DOC_TYPE_CATALOG[cat]
                                        if (!items || items.length === 0) return []
                                        return (
                                            <SelectGroup key={cat}>
                                                <SelectLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
                                                    {CATEGORY_LABELS[cat]}
                                                </SelectLabel>
                                                {items.map((d) => (
                                                    <SelectItem key={d.docType} value={d.docType}>
                                                        {d.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectGroup>
                                        )
                                    })}
                                </SelectContent>
                            </Select>
                            {errors.docType ? <p className="text-xs text-destructive">{errors.docType}</p> : null}
                        </div>

                        {/* ── Document number (label adapts to selected type) ── */}
                        {numberMeta ? (
                            <div className="space-y-1.5">
                                <Label htmlFor="doc-number" className="text-sm font-medium">
                                    {numberMeta.label}{' '}
                                    <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                                </Label>
                                <Input
                                    id="doc-number"
                                    value={docNumber}
                                    onChange={(e) => setDocNumber(e.target.value)}
                                    placeholder={numberMeta.placeholder}
                                    className="h-9"
                                />
                            </div>
                        ) : null}

                        {/* ── Issue + Expiry ── */}
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label htmlFor="doc-issue" className="text-sm font-medium text-muted-foreground">
                                    Issue Date <span className="text-xs font-normal">(optional)</span>
                                </Label>
                                <DatePicker
                                    id="doc-issue"
                                    value={issueDate}
                                    onChange={handleIssueDateChange}
                                    placeholder="Issue date"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label
                                    htmlFor="doc-expiry"
                                    className={cn('text-sm font-medium', !expiryRequired && 'text-muted-foreground')}
                                >
                                    Expiry Date
                                    {expiryRequired ? (
                                        <span className="ms-0.5 text-destructive">*</span>
                                    ) : (
                                        <span className="ms-1 text-xs font-normal">(optional)</span>
                                    )}
                                </Label>
                                <DatePicker
                                    id="doc-expiry"
                                    value={expiryDate}
                                    onChange={handleExpiryDateChange}
                                    aria-invalid={!!errors.expiryDate}
                                    className={cn(errors.expiryDate && 'border-destructive')}
                                    placeholder="Expiry date"
                                />
                                {errors.expiryDate ? (
                                    <p className="text-xs text-destructive">{errors.expiryDate}</p>
                                ) : selectedDef?.hint ? (
                                    <p className="text-[11px] text-muted-foreground">{selectedDef.hint}</p>
                                ) : null}
                            </div>
                        </div>

                        {/* ── Notes ── */}
                        <div className="space-y-1.5">
                            <Label htmlFor="doc-notes" className="text-sm font-medium text-muted-foreground">
                                Notes <span className="text-xs font-normal">(optional)</span>
                            </Label>
                            <Textarea
                                id="doc-notes"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Add any notes or comments about this document…"
                                rows={2}
                                className="resize-none text-sm"
                            />
                        </div>

                        {/* ── File drop zone ── */}
                        <div className="space-y-1.5">
                            <Label className="text-sm font-medium">
                                File <span className="text-destructive">*</span>
                            </Label>
                            <input
                                ref={fileInputRef}
                                type="file"
                                className="hidden"
                                accept={ALLOWED_FILE_TYPES}
                                onChange={(e) => pickFile(e.target.files?.[0])}
                                aria-label="Upload document file"
                            />
                            {file ? (
                                <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
                                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                                        <FileText className="size-4 text-primary" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium">{file.name}</p>
                                        <p className="text-xs text-muted-foreground">{humanFileSizeShort(file.size)}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setFile(null)
                                            if (fileInputRef.current) fileInputRef.current.value = ''
                                        }}
                                        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                        aria-label="Remove file"
                                    >
                                        <X className="size-3.5" />
                                    </button>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    onDrop={onDrop}
                                    onDragOver={onDragOver}
                                    onDragLeave={onDragLeave}
                                    className={cn(
                                        'flex w-full cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 transition-colors',
                                        dragging
                                            ? 'border-primary bg-primary/5'
                                            : errors.file
                                              ? 'border-destructive bg-destructive/5 hover:border-destructive/70'
                                              : 'border-border hover:border-primary/50 hover:bg-muted/30',
                                    )}
                                >
                                    <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                                        <Upload className="size-5 text-muted-foreground" />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-sm font-medium text-foreground">
                                            Click to upload{' '}
                                            <span className="font-normal text-muted-foreground">or drag and drop</span>
                                        </p>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            PDF, JPG, PNG, WEBP, DOCX, XLSX · Max 10 MB
                                        </p>
                                    </div>
                                </button>
                            )}
                            {errors.file ? <p className="text-xs text-destructive">{errors.file}</p> : null}
                        </div>
                    </div>

                    <DialogFooter className="shrink-0 gap-2 border-t bg-muted/20 px-6 py-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleClose(false)}
                            disabled={upload.isPending}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" loading={upload.isPending}>
                            <Upload className="me-1.5 size-3.5" />
                            {upload.isPending ? 'Uploading…' : 'Submit'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
