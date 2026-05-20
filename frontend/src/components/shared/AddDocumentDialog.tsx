import { useRef, useState, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DatePicker } from '@/components/ui/date-picker'
import { EmployeeSelect } from '@/components/shared/EmployeeSelect'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { useUploadDocument } from '@/hooks/useDocuments'
import { DOC_TYPE_CATALOG, CATEGORY_LABELS, docNumberMeta } from '@/lib/docTypes'
import { toast } from '@/components/ui/overlays'
import { Upload, FileText, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Pre-set and lock the employee (e.g. from employee detail page) */
    employeeId?: string
    /** Tag the uploaded document with an onboarding step so it groups under that step on the checklist. */
    stepId?: string
    /** Optional small caption rendered under the title (e.g. "For step: Visa & Compliance"). */
    contextNote?: string
    /** Fires after a successful upload - useful to reset list pagination so the new doc shows on page 1. */
    onUploaded?: () => void
}

function addOneYear(dateStr: string): string {
    const d = new Date(dateStr)
    d.setFullYear(d.getFullYear() + 1)
    return d.toISOString().split('T')[0]!
}

export function AddDocumentDialog({ open, onOpenChange, employeeId: fixedEmployeeId, stepId, contextNote, onUploaded }: Props) {
    const { mutateAsync, isPending } = useUploadDocument()

    const [selectedEmpId, setSelectedEmpId] = useState('')
    const [docType, setDocType] = useState('')
    const [docNumber, setDocNumber] = useState('')
    const [issueDate, setIssueDate] = useState('')
    const [expiryDate, setExpiryDate] = useState('')
    const [notes, setNotes] = useState('')
    const [file, setFile] = useState<File | null>(null)
    const [dragging, setDragging] = useState(false)
    const [errors, setErrors] = useState<{ employee?: string; docType?: string; expiryDate?: string; file?: string }>({})
    const fileInputRef = useRef<HTMLInputElement>(null)
    const autoExpiryRef = useRef<string>('')

    const effectiveEmployeeId = fixedEmployeeId ?? (selectedEmpId || undefined)

    const allDocTypes = Object.values(DOC_TYPE_CATALOG).flat()
    const selectedDef = allDocTypes.find(d => d.docType === docType)

    // Build ordered combobox options: identity, visa, insurance first, then rest
    const CAT_ORDER = ['identity', 'visa', 'insurance', 'employment', 'qualification', 'compliance', 'financial', 'company'] as const
    const docTypeOptions: ComboboxOption[] = [
        ...CAT_ORDER.flatMap(cat =>
            (DOC_TYPE_CATALOG[cat] ?? []).map(d => ({
                value: d.docType,
                label: d.label,
                secondary: CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS],
            })),
        ),
        { value: 'Other', label: 'Other', secondary: 'Other' },
    ]
    const expiryRequired = selectedDef?.expiryRequired ?? false

    function handleIssueDateChange(v: string | undefined) {
        const date = v ?? ''
        setIssueDate(date)
        if (date) {
            const auto = addOneYear(date)
            if (!expiryDate || expiryDate === autoExpiryRef.current) {
                setExpiryDate(auto)
                autoExpiryRef.current = auto
            }
        }
    }

    function handleExpiryDateChange(v: string | undefined) {
        const date = v ?? ''
        setExpiryDate(date)
        autoExpiryRef.current = date
    }

    function reset() {
        setSelectedEmpId('')
        setDocType('')
        setDocNumber('')
        setIssueDate('')
        setExpiryDate('')
        setNotes('')
        setFile(null)
        setDragging(false)
        setErrors({})
        autoExpiryRef.current = ''
    }

    function handleClose(next: boolean) {
        if (!next) reset()
        onOpenChange(next)
    }

    function pickFile(picked: File | null | undefined) {
        if (!picked) return
        const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif',
            'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
        if (!allowed.includes(picked.type) && !picked.name.match(/\.(pdf|jpg|jpeg|png|webp|gif|doc|docx|xlsx)$/i)) {
            toast.error('Invalid file type', 'Please upload a PDF, image, Word, or Excel document.')
            return
        }
        if (picked.size > 10 * 1024 * 1024) {
            toast.error('File too large', 'Maximum file size is 10 MB.')
            return
        }
        setFile(picked)
    }

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setDragging(false)
        pickFile(e.dataTransfer.files[0])
    }, [])

    const onDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setDragging(true)
    }, [])

    const onDragLeave = useCallback(() => setDragging(false), [])

    async function handleSubmit() {
        const newErrors: typeof errors = {}
        if (!fixedEmployeeId && !selectedEmpId) newErrors.employee = 'Please select an employee'
        if (!docType) newErrors.docType = 'Please select a document type'
        if (expiryRequired && !expiryDate) newErrors.expiryDate = `${docType} requires an expiry date`
        if (!file) newErrors.file = 'Please select a file to upload'
        if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return }

        try {
            await mutateAsync({
                file: file!,
                employeeId: effectiveEmployeeId,
                stepId: stepId || undefined,
                category: selectedDef?.category ?? 'identity',
                docType,
                docNumber: docNumber.trim() || undefined,
                issueDate: issueDate || undefined,
                expiryDate: expiryDate || undefined,
                notes: notes.trim() || undefined,
            })
            toast.success('Document uploaded', `${docType} has been submitted for review.`)
            onUploaded?.()
            handleClose(false)
        } catch {
            // error handled by hook
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-2xl p-0 flex flex-col max-h-[90vh]">
                <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
                    <DialogTitle className="text-lg font-semibold">Add Document</DialogTitle>
                    {contextNote && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{contextNote}</p>
                    )}
                </DialogHeader>

                <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">

                    {/* ── Employee selector (only when not pre-set) ── */}
                    {!fixedEmployeeId && (
                        <div className="space-y-1.5">
                            <Label className="text-sm font-medium">
                                Employee <span className="text-destructive">*</span>
                            </Label>
                            <EmployeeSelect
                                value={selectedEmpId}
                                onValueChange={id => {
                                    setSelectedEmpId(id)
                                    setErrors(e => ({ ...e, employee: undefined }))
                                }}
                                clearable
                                className={cn(errors.employee && 'border-destructive')}
                            />

                            {errors.employee && (
                                <p className="text-xs text-destructive">{errors.employee}</p>
                            )}
                        </div>
                    )}

                    {/* ── Document type ── */}
                    <div className="space-y-1.5">
                        <Label className="text-sm font-medium">
                            Document Type <span className="text-destructive">*</span>
                        </Label>
                        <Combobox
                            value={docType}
                            onValueChange={v => { setDocType(v); setErrors(e => ({ ...e, docType: undefined })) }}
                            options={docTypeOptions}
                            placeholder="Select document type…"
                            searchPlaceholder="Search by name or category…"
                            clearable
                        />
                        {errors.docType && <p className="text-xs text-destructive">{errors.docType}</p>}
                    </div>

                    {docType && (() => {
                        const meta = docNumberMeta(docType)
                        return (
                            <div className="space-y-1.5">
                                <Label className="text-sm font-medium">
                                    {meta.label} <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                                </Label>
                                <Input
                                    value={docNumber}
                                    onChange={e => setDocNumber(e.target.value)}
                                    placeholder={meta.placeholder}
                                    className="h-9"
                                />
                                {meta.linksToEmployee && (
                                    <p className="text-[11px] text-muted-foreground">
                                        On approval, this number will populate the employee&apos;s {meta.label.replace(/\.$/, '').toLowerCase()} field.
                                    </p>
                                )}
                            </div>
                        )
                    })()}

                    {/* ── Issue + Expiry dates ── */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-sm font-medium text-muted-foreground">
                                Issue Date <span className="text-xs font-normal">(optional)</span>
                            </Label>
                            <DatePicker value={issueDate} onChange={handleIssueDateChange} placeholder="Select issue date" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className={cn('text-sm font-medium', !expiryRequired && 'text-muted-foreground')}>
                                Expiry Date
                                {expiryRequired
                                    ? <span className="text-destructive ml-0.5">*</span>
                                    : <span className="text-xs font-normal ml-1">(optional)</span>}
                            </Label>
                            <DatePicker
                                value={expiryDate}
                                onChange={v => { handleExpiryDateChange(v); setErrors(e => ({ ...e, expiryDate: undefined })) }}
                                placeholder="Select expiry date"
                            />
                            {errors.expiryDate
                                ? <p className="text-xs text-destructive">{errors.expiryDate}</p>
                                : selectedDef?.hint && <p className="text-[11px] text-muted-foreground">{selectedDef.hint}</p>
                            }
                        </div>
                    </div>

                    {/* ── Notes ── */}
                    <div className="space-y-1.5">
                        <Label className="text-sm font-medium text-muted-foreground">
                            Notes <span className="text-xs font-normal">(optional)</span>
                        </Label>
                        <Textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Add any notes or comments about this document…"
                            rows={2}
                            className="resize-none text-sm"
                        />
                    </div>

                    {/* ── File upload ── */}
                    <div className="space-y-1.5">
                        <Label className="text-sm font-medium">
                            File <span className="text-destructive">*</span>
                        </Label>
                        <input
                            ref={fileInputRef}
                            type="file"
                            className="hidden"
                            accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xlsx"
                            onChange={e => { pickFile(e.target.files?.[0]); setErrors(err => ({ ...err, file: undefined })) }}
                        />

                        {file ? (
                            <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
                                <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                    <FileText className="size-4 text-primary" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{file.name}</p>
                                    <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                                    className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
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
                                    'w-full rounded-lg border-2 border-dashed px-6 py-8 flex flex-col items-center gap-2 transition-colors cursor-pointer',
                                    dragging
                                        ? 'border-primary bg-primary/5'
                                        : errors.file
                                            ? 'border-destructive bg-destructive/5 hover:border-destructive/70'
                                            : 'border-border hover:border-primary/50 hover:bg-muted/30',
                                )}
                            >
                                <div className="size-10 rounded-full bg-muted flex items-center justify-center">
                                    <Upload className="size-5 text-muted-foreground" />
                                </div>
                                <div className="text-center">
                                    <p className="text-sm font-medium text-foreground">
                                        Click to upload <span className="text-muted-foreground font-normal">or drag and drop</span>
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">PDF, JPG, PNG, WEBP, GIF, DOCX, XLSX · Max 10 MB</p>
                                </div>
                            </button>
                        )}
                        {errors.file && <p className="text-xs text-destructive">{errors.file}</p>}
                    </div>
                </div>

                <DialogFooter className="px-6 py-4 border-t bg-muted/20 shrink-0">
                    <Button variant="outline" onClick={() => handleClose(false)} disabled={isPending}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={isPending}>
                        {isPending
                            ? <><Upload className="size-3.5 mr-1.5 animate-pulse" />Uploading…</>
                            : <><Upload className="size-3.5 mr-1.5" />Submit</>}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
