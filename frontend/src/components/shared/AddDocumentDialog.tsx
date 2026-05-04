import { useRef, useState, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DatePicker } from '@/components/ui/date-picker'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useUploadDocument } from '@/hooks/useDocuments'
import { FLAT_DOC_TYPES } from '@/lib/docTypes'
import { toast } from '@/components/ui/overlays'
import { Upload, FileText, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Pre-set and lock the employee (e.g. from employee detail page) */
    employeeId?: string
}

function addOneYear(dateStr: string): string {
    const d = new Date(dateStr)
    d.setFullYear(d.getFullYear() + 1)
    return d.toISOString().split('T')[0]!
}

export function AddDocumentDialog({ open, onOpenChange, employeeId }: Props) {
    const { mutateAsync, isPending } = useUploadDocument()

    const [docType, setDocType] = useState('')
    const [issueDate, setIssueDate] = useState('')
    const [expiryDate, setExpiryDate] = useState('')
    const [notes, setNotes] = useState('')
    const [file, setFile] = useState<File | null>(null)
    const [dragging, setDragging] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    // Track the last auto-set expiry value so re-picking the issue date keeps expiry in sync
    const autoExpiryRef = useRef<string>('')

    const selectedDef = FLAT_DOC_TYPES.find(d => d.docType === docType)
    const expiryRequired = selectedDef?.expiryRequired ?? false

    function handleIssueDateChange(v: string | undefined) {
        const date = v ?? ''
        setIssueDate(date)
        if (date) {
            const auto = addOneYear(date)
            // Auto-fill expiry if empty or if it still matches the previous auto-set value
            if (!expiryDate || expiryDate === autoExpiryRef.current) {
                setExpiryDate(auto)
                autoExpiryRef.current = auto
            }
        }
    }

    function handleExpiryDateChange(v: string | undefined) {
        const date = v ?? ''
        setExpiryDate(date)
        // User manually changed expiry — stop tracking auto-set
        autoExpiryRef.current = date
    }

    function reset() {
        setDocType('')
        setIssueDate('')
        setExpiryDate('')
        setNotes('')
        setFile(null)
        setDragging(false)
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
        if (!docType) { toast.warning('Document type required', 'Please select a document type.'); return }
        if (expiryRequired && !expiryDate) { toast.warning('Expiry date required', `${docType} requires an expiry date.`); return }
        if (!file) { toast.warning('File required', 'Please select a file to upload.'); return }

        try {
            await mutateAsync({
                file,
                employeeId,
                category: selectedDef?.category ?? 'identity',
                docType,
                issueDate: issueDate || undefined,
                expiryDate: expiryDate || undefined,
                notes: notes.trim() || undefined,
            })
            toast.success('Document uploaded', `${docType} has been submitted for review.`)
            handleClose(false)
        } catch {
            // error toast handled by hook
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-lg p-0 overflow-hidden">
                <DialogHeader className="px-6 pt-6 pb-4 border-b">
                    <DialogTitle className="text-lg font-semibold">Add Document</DialogTitle>
                </DialogHeader>

                <div className="px-6 py-5 space-y-4">
                    {/* Document type */}
                    <div className="space-y-1.5">
                        <Label className="text-sm font-medium">
                            Document Type <span className="text-destructive">*</span>
                        </Label>
                        <Select value={docType} onValueChange={setDocType}>
                            <SelectTrigger className="h-9">
                                <SelectValue placeholder="Select document type…" />
                            </SelectTrigger>
                            <SelectContent className="max-h-72">
                                {FLAT_DOC_TYPES.map(d => (
                                    <SelectItem key={d.docType} value={d.docType}>
                                        {d.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Issue date + Expiry date side by side */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-sm font-medium text-muted-foreground">
                                Issue Date <span className="text-xs font-normal">(optional)</span>
                            </Label>
                            <DatePicker
                                value={issueDate}
                                onChange={handleIssueDateChange}
                                placeholder="Select issue date"
                            />
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
                                onChange={handleExpiryDateChange}
                                placeholder="Select expiry date"
                            />
                            {selectedDef?.hint && (
                                <p className="text-[11px] text-muted-foreground">{selectedDef.hint}</p>
                            )}
                        </div>
                    </div>

                    {/* Notes / comment */}
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

                    {/* File upload zone */}
                    <div className="space-y-1.5">
                        <Label className="text-sm font-medium">
                            File <span className="text-destructive">*</span>
                        </Label>
                        <input
                            ref={fileInputRef}
                            type="file"
                            className="hidden"
                            accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xlsx"
                            onChange={e => pickFile(e.target.files?.[0])}
                        />

                        {file ? (
                            <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
                                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                    <FileText className="h-4 w-4 text-primary" />
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
                                    <X className="h-3.5 w-3.5" />
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
                                        : 'border-border hover:border-primary/50 hover:bg-muted/30',
                                )}
                            >
                                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                                    <Upload className="h-5 w-5 text-muted-foreground" />
                                </div>
                                <div className="text-center">
                                    <p className="text-sm font-medium text-foreground">
                                        Click to upload <span className="text-muted-foreground font-normal">or drag and drop</span>
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">PDF, JPG, PNG, WEBP, GIF, DOCX, XLSX · Max 10 MB</p>
                                </div>
                            </button>
                        )}
                    </div>
                </div>

                <DialogFooter className="px-6 py-4 border-t bg-muted/20">
                    <Button variant="outline" onClick={() => handleClose(false)} disabled={isPending}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={isPending}>
                        {isPending
                            ? <><Upload className="h-3.5 w-3.5 mr-1.5 animate-bounce" />Uploading…</>
                            : <><Upload className="h-3.5 w-3.5 mr-1.5" />Submit</>}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
