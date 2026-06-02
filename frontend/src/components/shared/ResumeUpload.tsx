import { useId, useRef, useState, type DragEvent } from 'react'
import { UploadCloud, Paperclip, Eye, Trash2, Loader2, Sparkles } from 'lucide-react'
import { cn, formatFileSize } from '@/lib/utils'
import { toast } from '@/components/ui/overlays'
import { parseResumeFile, extractResumeImage, type ParsedResume } from '@/lib/resume-parser'

const DEFAULT_ACCEPT = '.pdf,.doc,.docx,.txt,.rtf'
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024
const ACCEPT_RE = /\.(pdf|docx?|txt|rtf)$/i

/**
 * Résumé upload area — designed to sit FIRST in any apply / add-candidate form.
 * Drag-drop or click to upload; on select it parses the file client-side and
 * calls `onParsed` so the parent can auto-fill its fields. Manual entry below
 * always remains available. No AI / no backend — fully client-side & offline.
 */
export function ResumeUpload({
    file,
    onFile,
    onParsed,
    onPhoto,
    accept = DEFAULT_ACCEPT,
    maxBytes = DEFAULT_MAX_BYTES,
    title = 'Upload résumé to auto-fill',
    hint = 'PDF, DOC, DOCX, TXT or RTF · up to 5 MB. We’ll read it and fill the form for you.',
    disabled = false,
    required = false,
}: {
    file: File | null
    onFile: (file: File | null) => void
    onParsed?: (parsed: ParsedResume, file: File) => void
    /** Receives a candidate photo extracted from the résumé (or null if none found). */
    onPhoto?: (photo: Blob | null) => void
    accept?: string
    maxBytes?: number
    title?: string
    hint?: string
    disabled?: boolean
    required?: boolean
}) {
    const inputRef = useRef<HTMLInputElement>(null)
    const inputId = useId()
    // Bumped on every pick/replace/remove; an in-flight parse whose token is stale
    // (file was replaced or removed before it resolved) skips all its side effects.
    const reqRef = useRef(0)
    const [dragging, setDragging] = useState(false)
    const [parsing, setParsing] = useState(false)
    const [parsedNote, setParsedNote] = useState<string | null>(null)

    async function pick(picked: File | null | undefined) {
        if (!picked) return
        if (!ACCEPT_RE.test(picked.name)) return toast.error('Unsupported file', 'Upload a PDF, DOC, DOCX, TXT or RTF résumé.')
        if (picked.size > maxBytes) return toast.error('File too large', `Résumé must be under ${formatFileSize(maxBytes)}.`)
        const token = ++reqRef.current
        onFile(picked)
        setParsedNote(null)
        if (!onParsed && !onPhoto) return
        setParsing(true)
        // Photo extraction runs alongside text parsing; it never blocks the form.
        if (onPhoto) extractResumeImage(picked).then(p => { if (token === reqRef.current) onPhoto(p) }).catch(() => { if (token === reqRef.current) onPhoto(null) })
        if (!onParsed) { if (token === reqRef.current) setParsing(false); return }
        try {
            const parsed = await parseResumeFile(picked)
            if (token !== reqRef.current) return   // stale — file was replaced/removed
            onParsed(parsed, picked)
            const filled = ['name', 'email', 'phone'].filter(k => parsed[k as keyof ParsedResume])
            if (parsed.textLength === 0) {
                setParsedNote('Couldn’t read text (scanned/image résumé?) — please fill the form manually.')
            } else if (filled.length) {
                setParsedNote(`Auto-filled ${filled.join(', ')}${parsed.skills.length ? ` · ${parsed.skills.length} skills detected` : ''}. Review before submitting.`)
                toast.success('Résumé read', 'We pre-filled the form — please review.')
            } else {
                setParsedNote('Résumé attached. We couldn’t auto-detect fields — please fill them in.')
            }
        } catch {
            if (token === reqRef.current) setParsedNote('Résumé attached (couldn’t auto-read it — fill the form manually).')
        } finally {
            if (token === reqRef.current) setParsing(false)
        }
    }

    // Open the picked file in a new tab (PDF/images preview inline; .doc(x)
    // downloads — same as any browser). Works on the local File, pre-upload.
    function view() {
        if (!file) return
        const url = URL.createObjectURL(file)
        window.open(url, '_blank', 'noopener')
        setTimeout(() => URL.revokeObjectURL(url), 60_000)
    }

    function remove() {
        reqRef.current++
        onFile(null)
        setParsedNote(null)
        setParsing(false)
        onPhoto?.(null)
    }

    return (
        <div>
            <input
                ref={inputRef}
                id={inputId}
                type="file"
                accept={accept}
                aria-label={title}
                className="sr-only"
                disabled={disabled}
                onChange={e => { pick(e.target.files?.[0]); e.target.value = '' }}
            />
            {file ? (
                // Dashed chip: filename + view/remove, with "Replace file or drag
                // and drop here" — and the whole tile accepts a drop to replace.
                <div
                    onDragOver={e => { if (!disabled) { e.preventDefault(); setDragging(true) } }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e: DragEvent) => { e.preventDefault(); setDragging(false); if (!disabled) pick(e.dataTransfer.files?.[0]) }}
                    className={cn(
                        'rounded-xl border border-dashed px-3 py-3 transition-colors',
                        dragging ? 'border-primary bg-primary/5' : 'border-border bg-muted/30',
                    )}
                >
                    <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex min-w-0 items-center gap-2.5 text-sm">
                            {parsing ? <Loader2 className="size-4 shrink-0 animate-spin text-primary" /> : <Paperclip className="size-4 shrink-0 text-muted-foreground" />}
                            <span className="min-w-0">
                                <span className="block truncate font-medium">{file.name}</span>
                                <span className="block text-[11px] text-muted-foreground tabular-figures">{formatFileSize(file.size)}</span>
                            </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-0.5">
                            <button type="button" onClick={view} aria-label="View résumé" title="View" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                                <Eye className="size-4" />
                            </button>
                            <button type="button" onClick={remove} aria-label="Remove résumé" title="Remove" disabled={disabled} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
                                <Trash2 className="size-4" />
                            </button>
                        </span>
                    </div>
                    <div className="mt-2.5 border-t border-border/60 pt-2 text-center text-xs text-muted-foreground">
                        <button type="button" onClick={() => inputRef.current?.click()} disabled={disabled} className="font-medium text-primary hover:underline disabled:opacity-50">Replace file</button>
                        {' '}or drag and drop here
                    </div>
                    {(parsing || parsedNote) && (
                        <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <Sparkles className="size-3 text-primary" />
                            {parsing ? 'Reading résumé…' : parsedNote}
                        </p>
                    )}
                </div>
            ) : (
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => inputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDragging(true) }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e: DragEvent) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files?.[0]) }}
                    className={cn(
                        'flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-3 py-5 text-center transition-colors disabled:opacity-50',
                        dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-accent/40',
                    )}
                >
                    <span className="grid size-9 place-items-center rounded-full bg-primary/10 text-primary"><UploadCloud className="size-4" /></span>
                    <span className="text-sm font-medium">{title}{required && <span className="text-destructive"> *</span>}</span>
                    <span className="text-[11px] text-muted-foreground">{hint}</span>
                </button>
            )}
        </div>
    )
}
