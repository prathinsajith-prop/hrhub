import { useMemo, useRef, useState, useCallback, type FormEvent, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
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

// ─── Icon + tone per category ────────────────────────────────────────────────
// Heading text is sourced from CATEGORY_LABELS (single label source) and
// localized via categoryLabel() — only the icon + accent colour live here.
const CATEGORY_META: Record<DocumentCategory, { icon: typeof FileText; tone: string }> = {
    identity: { icon: ShieldCheck, tone: 'text-indigo-600 dark:text-indigo-300' },
    visa: { icon: Stamp, tone: 'text-sky-600 dark:text-sky-300' },
    company: { icon: Briefcase, tone: 'text-fuchsia-600 dark:text-fuchsia-300' },
    employment: { icon: ScrollText, tone: 'text-emerald-600 dark:text-emerald-300' },
    insurance: { icon: HeartPulse, tone: 'text-rose-600 dark:text-rose-300' },
    qualification: { icon: FileText, tone: 'text-amber-600 dark:text-amber-300' },
    financial: { icon: Landmark, tone: 'text-violet-600 dark:text-violet-300' },
    compliance: { icon: ShieldCheck, tone: 'text-teal-600 dark:text-teal-300' },
}

const STATUS_TONE: Record<DocumentStatus, string> = {
    valid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
    expiring_soon: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    expired: 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
    pending_upload: 'bg-muted text-muted-foreground',
    under_review: 'bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300',
    rejected: 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
}

const STATUS_LABEL_KEY: Record<DocumentStatus, string> = {
    valid: 'valid',
    expiring_soon: 'expiringSoon',
    expired: 'expired',
    pending_upload: 'pendingUpload',
    under_review: 'underReview',
    rejected: 'rejected',
}

const STATUS_LABEL_FALLBACK: Record<DocumentStatus, string> = {
    valid: 'Valid',
    expiring_soon: 'Expiring soon',
    expired: 'Expired',
    pending_upload: 'Pending upload',
    under_review: 'Under review',
    rejected: 'Rejected',
}

function statusLabel(s: DocumentStatus, t: TFunction): string {
    return t(`documents.status.${STATUS_LABEL_KEY[s]}`, { defaultValue: STATUS_LABEL_FALLBACK[s] })
}

// Single source for category heading text — translated copy of CATEGORY_LABELS
// (from lib/docTypes) keyed by category, so the section heading and the upload
// dialog's Select groups never drift apart.
function categoryLabel(category: DocumentCategory, t: TFunction): string {
    return t(`documents.category.${category}`, { defaultValue: CATEGORY_LABELS[category] })
}

function humanFileSize(bytes: number | null, kbDigits = 1): string {
    if (bytes == null) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(kbDigits)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function EmployeeDocumentsPage() {
    const { t } = useTranslation()
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
            categoryLabel(a, t).localeCompare(categoryLabel(b, t)),
        )
    }, [docs, t])

    const totalCount = docs?.length ?? 0
    const expiringCount = docs?.filter((d) => d.status === 'expiring_soon' || d.status === 'expired').length ?? 0

    const subtitle = isLoading || totalCount === 0
        ? undefined
        : expiringCount > 0
          ? t('documents.summaryWithAttention', {
                count: totalCount,
                attention: expiringCount,
                defaultValue: '{{count}} on file · {{attention}} need attention',
            })
          : t('documents.summary', { count: totalCount, defaultValue: '{{count}} on file' })

    return (
        <div className="space-y-5">
            <PageHeader
                title={t('documents.title', { defaultValue: 'My documents' })}
                subtitle={subtitle}
                action={
                    <Button size="sm" onClick={() => setUploadOpen(true)}>
                        <Upload className="size-4" /> {t('documents.upload', { defaultValue: 'Upload' })}
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
                    title={t('documents.emptyTitle', { defaultValue: 'No documents yet' })}
                    description={t('documents.emptyDesc', {
                        defaultValue:
                            'Upload your visa, contract or other personal documents. Your manager will review them before they go live.',
                    })}
                    action={
                        <Button size="sm" onClick={() => setUploadOpen(true)}>
                            <Upload className="size-4" />{' '}
                            {t('documents.uploadFirst', { defaultValue: 'Upload your first document' })}
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
                                <h2 className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    {categoryLabel(category, t)}
                                </h2>
                                <span className="text-xs tabular-figures text-muted-foreground/70">
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
    const { t } = useTranslation()
    const [downloading, setDownloading] = useState(false)

    async function download() {
        if (downloading) return
        setDownloading(true)
        try {
            await triggerDocumentDownload(doc.id)
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t('documents.downloadFailed', { defaultValue: 'Download failed' }))
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
                                'border-0 text-xs uppercase tracking-wider',
                                STATUS_TONE[doc.status],
                            )}
                        >
                            {statusLabel(doc.status, t)}
                        </Badge>
                        {doc.verified ? (
                            <span
                                className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                                title={
                                    doc.verifiedAt
                                        ? t('documents.verifiedOn', {
                                              date: formatDate(doc.verifiedAt),
                                              defaultValue: 'Verified {{date}}',
                                          })
                                        : t('documents.verified', { defaultValue: 'Verified' })
                                }
                            >
                                <CheckCircle2 className="size-3" /> {t('documents.verified', { defaultValue: 'Verified' })}
                            </span>
                        ) : null}
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">{doc.fileName}</div>
                    {doc.status === 'rejected' && doc.rejectionReason ? (
                        <div className="mt-1 flex items-start gap-1 text-xs text-rose-700 dark:text-rose-300">
                            <XCircle className="mt-0.5 size-3 shrink-0" />
                            <span>
                                <span className="font-semibold">{t('documents.rejectedLabel', { defaultValue: 'Rejected:' })}</span>{' '}
                                {doc.rejectionReason}
                            </span>
                        </div>
                    ) : null}
                    {doc.status === 'under_review' ? (
                        <div className="mt-1 flex items-center gap-1 text-xs text-sky-700 dark:text-sky-300">
                            <Clock className="size-3" />{' '}
                            {t('documents.awaitingApproval', { defaultValue: 'Awaiting manager approval' })}
                        </div>
                    ) : null}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground/90">
                        {doc.docNumber ? <span>#{doc.docNumber}</span> : null}
                        {doc.issueDate ? (
                            <span>
                                {t('documents.issuedOn', {
                                    date: formatDate(doc.issueDate),
                                    defaultValue: 'Issued {{date}}',
                                })}
                            </span>
                        ) : null}
                        {doc.expiryDate ? (
                            <span
                                className={cn(
                                    'inline-flex items-center gap-1',
                                    expired
                                        ? 'text-rose-600 dark:text-rose-300'
                                        : expiringSoon
                                          ? 'text-amber-800 dark:text-amber-300'
                                          : '',
                                )}
                            >
                                {(expired || expiringSoon) ? <AlertCircle className="size-3" /> : <Clock className="size-3" />}
                                {t('documents.expiresOn', {
                                    date: formatDate(doc.expiryDate),
                                    defaultValue: 'Expires {{date}}',
                                })}
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
                    aria-label={
                        doc.hasFile
                            ? t('documents.downloadFile', { file: doc.fileName, defaultValue: 'Download {{file}}' })
                            : t('documents.noFile', { defaultValue: 'No file attached' })
                    }
                >
                    <Download className="size-4" />
                    <span className="hidden sm:inline">{t('documents.download', { defaultValue: 'Download' })}</span>
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

function UploadDocumentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
    const { t } = useTranslation()
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
            toast.error(
                t('documents.invalidFileType', {
                    defaultValue: 'Invalid file type — use PDF, image, Word or Excel',
                }),
            )
            return
        }
        if (picked.size > MAX_FILE_BYTES) {
            toast.error(t('documents.fileTooLarge', { defaultValue: 'File too large (max 10 MB)' }))
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
        if (!docType) newErrors.docType = t('documents.selectTypeError', { defaultValue: 'Please select a document type' })
        if (expiryRequired && !expiryDate)
            newErrors.expiryDate = t('documents.expiryRequiredError', {
                docType,
                defaultValue: '{{docType}} requires an expiry date',
            })
        if (!file) newErrors.file = t('documents.chooseFileError', { defaultValue: 'Please choose a file to upload' })
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
                toast.success(
                    t('documents.submittedToast', {
                        docType,
                        defaultValue: '{{docType}} submitted — awaiting manager approval',
                    }),
                )
                handleClose(false)
            },
            onError: (err) => {
                toast.error(err instanceof ApiError ? err.message : t('documents.uploadFailed', { defaultValue: 'Upload failed' }))
            },
        })
    }

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="flex max-h-[90vh] flex-col p-0 sm:max-w-2xl">
                <DialogHeader className="shrink-0 border-b px-6 pb-4 pt-6">
                    <DialogTitle className="font-display text-lg font-semibold">
                        {t('documents.addDocument', { defaultValue: 'Add Document' })}
                    </DialogTitle>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        {t('documents.reviewHint', {
                            defaultValue:
                                'Your manager will review the document before it appears as valid in your profile.',
                        })}
                    </p>
                </DialogHeader>

                <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
                    <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
                        {/* ── Document type ── */}
                        <div className="space-y-1.5">
                            <Label htmlFor="doc-type" className="text-sm font-medium">
                                {t('documents.documentType', { defaultValue: 'Document Type' })}{' '}
                                <span className="text-destructive">*</span>
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
                                    <SelectValue
                                        placeholder={t('documents.selectTypePlaceholder', {
                                            defaultValue: 'Select document type…',
                                        })}
                                    />
                                </SelectTrigger>
                                <SelectContent className="max-h-72">
                                    {CATEGORY_DISPLAY_ORDER.flatMap((cat) => {
                                        const items = DOC_TYPE_CATALOG[cat]
                                        if (!items || items.length === 0) return []
                                        return (
                                            <SelectGroup key={cat}>
                                                <SelectLabel className="text-xs uppercase tracking-wider text-muted-foreground">
                                                    {categoryLabel(cat, t)}
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
                                    <span className="text-xs font-normal text-muted-foreground">
                                        {t('documents.optional', { defaultValue: '(optional)' })}
                                    </span>
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
                                    {t('documents.issueDate', { defaultValue: 'Issue Date' })}{' '}
                                    <span className="text-xs font-normal">
                                        {t('documents.optional', { defaultValue: '(optional)' })}
                                    </span>
                                </Label>
                                <DatePicker
                                    id="doc-issue"
                                    value={issueDate}
                                    onChange={handleIssueDateChange}
                                    placeholder={t('documents.issueDatePlaceholder', { defaultValue: 'Issue date' })}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label
                                    htmlFor="doc-expiry"
                                    className={cn('text-sm font-medium', !expiryRequired && 'text-muted-foreground')}
                                >
                                    {t('documents.expiryDate', { defaultValue: 'Expiry Date' })}
                                    {expiryRequired ? (
                                        <span className="ms-0.5 text-destructive">*</span>
                                    ) : (
                                        <span className="ms-1 text-xs font-normal">
                                            {t('documents.optional', { defaultValue: '(optional)' })}
                                        </span>
                                    )}
                                </Label>
                                <DatePicker
                                    id="doc-expiry"
                                    value={expiryDate}
                                    onChange={handleExpiryDateChange}
                                    aria-invalid={!!errors.expiryDate}
                                    className={cn(errors.expiryDate && 'border-destructive')}
                                    placeholder={t('documents.expiryDatePlaceholder', { defaultValue: 'Expiry date' })}
                                />
                                {errors.expiryDate ? (
                                    <p className="text-xs text-destructive">{errors.expiryDate}</p>
                                ) : selectedDef?.hint ? (
                                    <p className="text-xs text-muted-foreground">{selectedDef.hint}</p>
                                ) : null}
                            </div>
                        </div>

                        {/* ── Notes ── */}
                        <div className="space-y-1.5">
                            <Label htmlFor="doc-notes" className="text-sm font-medium text-muted-foreground">
                                {t('documents.notes', { defaultValue: 'Notes' })}{' '}
                                <span className="text-xs font-normal">
                                    {t('documents.optional', { defaultValue: '(optional)' })}
                                </span>
                            </Label>
                            <Textarea
                                id="doc-notes"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder={t('documents.notesPlaceholder', {
                                    defaultValue: 'Add any notes or comments about this document…',
                                })}
                                rows={2}
                                className="resize-none text-sm"
                            />
                        </div>

                        {/* ── File drop zone ── */}
                        <div className="space-y-1.5">
                            <Label className="text-sm font-medium">
                                {t('documents.file', { defaultValue: 'File' })}{' '}
                                <span className="text-destructive">*</span>
                            </Label>
                            <input
                                ref={fileInputRef}
                                type="file"
                                className="hidden"
                                accept={ALLOWED_FILE_TYPES}
                                onChange={(e) => pickFile(e.target.files?.[0])}
                                aria-label={t('documents.uploadFileAria', { defaultValue: 'Upload document file' })}
                            />
                            {file ? (
                                <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
                                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                                        <FileText className="size-4 text-primary" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium">{file.name}</p>
                                        <p className="text-xs text-muted-foreground">{humanFileSize(file.size, 0)}</p>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => {
                                            setFile(null)
                                            if (fileInputRef.current) fileInputRef.current.value = ''
                                        }}
                                        aria-label={t('documents.removeFile', { defaultValue: 'Remove file' })}
                                    >
                                        <X className="size-3.5" />
                                    </Button>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    onDrop={onDrop}
                                    onDragOver={onDragOver}
                                    onDragLeave={onDragLeave}
                                    className={cn(
                                        'flex w-full cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
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
                                            {t('documents.clickToUpload', { defaultValue: 'Click to upload' })}{' '}
                                            <span className="font-normal text-muted-foreground">
                                                {t('documents.orDragAndDrop', { defaultValue: 'or drag and drop' })}
                                            </span>
                                        </p>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            {t('documents.fileHint', {
                                                defaultValue: 'PDF, JPG, PNG, WEBP, DOCX, XLSX · Max 10 MB',
                                            })}
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
                            {t('common.cancel', { defaultValue: 'Cancel' })}
                        </Button>
                        <Button type="submit" loading={upload.isPending}>
                            <Upload className="me-1.5 size-3.5" />
                            {upload.isPending
                                ? t('documents.uploading', { defaultValue: 'Uploading…' })
                                : t('common.submit', { defaultValue: 'Submit' })}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
