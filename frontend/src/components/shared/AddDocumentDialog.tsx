import { useRef, useState, useCallback, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { DatePicker } from '@/components/ui/date-picker'
import {
    Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { InitialsAvatar } from '@/components/shared/Avatar'
import { useUploadDocument } from '@/hooks/useDocuments'
import { useEmployees } from '@/hooks/useEmployees'
import { DOC_TYPE_CATALOG, CATEGORY_LABELS } from '@/lib/docTypes'
import { toast } from '@/components/ui/overlays'
import { Upload, FileText, X, Search, Check } from 'lucide-react'
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

export function AddDocumentDialog({ open, onOpenChange, employeeId: fixedEmployeeId }: Props) {
    const { mutateAsync, isPending } = useUploadDocument()
    const { data: empList, isLoading: empLoading } = useEmployees({ limit: 500 })

    const employeeOptions = useMemo(() =>
        (empList?.data ?? [])
            .filter(e => e.status !== 'terminated')
            .map(e => ({ value: e.id, label: e.fullName, secondary: e.employeeNo ?? '' })),
        [empList],
    )

    const [selectedEmpId, setSelectedEmpId] = useState('')
    const [empSearch, setEmpSearch] = useState('')
    const [empOpen, setEmpOpen] = useState(false)
    const [docType, setDocType] = useState('')
    const [issueDate, setIssueDate] = useState('')
    const [expiryDate, setExpiryDate] = useState('')
    const [notes, setNotes] = useState('')
    const [file, setFile] = useState<File | null>(null)
    const [dragging, setDragging] = useState(false)
    const [errors, setErrors] = useState<{ employee?: string; docType?: string; expiryDate?: string; file?: string }>({})
    const fileInputRef = useRef<HTMLInputElement>(null)
    const autoExpiryRef = useRef<string>('')
    const empInputRef = useRef<HTMLInputElement>(null)

    const effectiveEmployeeId = fixedEmployeeId ?? (selectedEmpId || undefined)
    const selectedEmployee = employeeOptions.find(e => e.value === selectedEmpId)

    const filteredEmployees = useMemo(() => {
        const q = empSearch.trim().toLowerCase()
        const list = q
            ? employeeOptions.filter(e =>
                e.label.toLowerCase().includes(q) || e.secondary.toLowerCase().includes(q),
            )
            : employeeOptions
        return list.slice(0, 8)
    }, [employeeOptions, empSearch])

    const allDocTypes = Object.values(DOC_TYPE_CATALOG).flat()
    const selectedDef = allDocTypes.find(d => d.docType === docType)
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

    function selectEmployee(id: string) {
        setSelectedEmpId(id)
        setEmpSearch('')
        setEmpOpen(false)
        setErrors(e => ({ ...e, employee: undefined }))
    }

    function clearEmployee() {
        setSelectedEmpId('')
        setEmpSearch('')
        setEmpOpen(false)
        setTimeout(() => empInputRef.current?.focus(), 50)
    }

    function reset() {
        setSelectedEmpId('')
        setEmpSearch('')
        setEmpOpen(false)
        setDocType('')
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
                category: selectedDef?.category ?? 'identity',
                docType,
                issueDate: issueDate || undefined,
                expiryDate: expiryDate || undefined,
                notes: notes.trim() || undefined,
            })
            toast.success('Document uploaded', `${docType} has been submitted for review.`)
            handleClose(false)
        } catch {
            // error handled by hook
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-lg p-0 flex flex-col max-h-[90vh]">
                <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
                    <DialogTitle className="text-lg font-semibold">Add Document</DialogTitle>
                </DialogHeader>

                <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">

                    {/* ── Employee selector (only when not pre-set) ── */}
                    {!fixedEmployeeId && (
                        <div className="space-y-1.5">
                            <Label className="text-sm font-medium">
                                Employee <span className="text-destructive">*</span>
                            </Label>

                            {selectedEmployee ? (
                                /* Selected state — show employee chip */
                                <div className={cn(
                                    'flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5',
                                    errors.employee && 'border-destructive',
                                )}>
                                    <InitialsAvatar name={selectedEmployee.label} size="sm" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium leading-tight truncate">{selectedEmployee.label}</p>
                                        {selectedEmployee.secondary && (
                                            <p className="text-xs text-muted-foreground">{selectedEmployee.secondary}</p>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={clearEmployee}
                                        className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                        aria-label="Clear employee"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            ) : (
                                /* Search state */
                                <div className="space-y-1">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                                        <Input
                                            ref={empInputRef}
                                            value={empSearch}
                                            onChange={e => { setEmpSearch(e.target.value); setEmpOpen(true) }}
                                            onFocus={() => setEmpOpen(true)}
                                            placeholder={empLoading ? 'Loading employees…' : 'Search by name or employee no…'}
                                            disabled={empLoading}
                                            className={cn(
                                                'pl-9 h-9 text-sm',
                                                errors.employee && 'border-destructive focus-visible:ring-destructive/30',
                                            )}
                                            autoComplete="off"
                                        />
                                    </div>

                                    {/* Inline dropdown — no portal, no z-index conflict */}
                                    {empOpen && !empLoading && (
                                        <div className="rounded-lg border bg-background shadow-sm overflow-hidden">
                                            {filteredEmployees.length === 0 ? (
                                                <p className="px-3 py-4 text-sm text-muted-foreground text-center">
                                                    {empSearch ? 'No employees match your search' : 'No employees found'}
                                                </p>
                                            ) : (
                                                <ul className="max-h-44 overflow-y-auto divide-y divide-border/50">
                                                    {filteredEmployees.map(emp => (
                                                        <li key={emp.value}>
                                                            <button
                                                                type="button"
                                                                onMouseDown={e => e.preventDefault()}
                                                                onClick={() => selectEmployee(emp.value)}
                                                                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/60 transition-colors text-left"
                                                            >
                                                                <InitialsAvatar name={emp.label} size="sm" />
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="text-sm font-medium truncate">{emp.label}</p>
                                                                    {emp.secondary && (
                                                                        <p className="text-xs text-muted-foreground">{emp.secondary}</p>
                                                                    )}
                                                                </div>
                                                                {emp.value === selectedEmpId && (
                                                                    <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                                                                )}
                                                            </button>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                            {employeeOptions.length > 8 && (
                                                <p className="px-3 py-1.5 text-[11px] text-muted-foreground border-t bg-muted/20">
                                                    Type to filter · showing {filteredEmployees.length} of {employeeOptions.length}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

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
                        <Select value={docType} onValueChange={v => { setDocType(v); setErrors(e => ({ ...e, docType: undefined })) }}>
                            <SelectTrigger className={cn('h-9', errors.docType && 'border-destructive ring-destructive/20')}>
                                <SelectValue placeholder="Select document type…" />
                            </SelectTrigger>
                            <SelectContent className="max-h-80">
                                {(Object.keys(DOC_TYPE_CATALOG) as (keyof typeof DOC_TYPE_CATALOG)[]).map(cat => (
                                    <SelectGroup key={cat}>
                                        <SelectLabel className="text-xs font-semibold text-muted-foreground px-2 py-1.5 uppercase tracking-wide">
                                            {CATEGORY_LABELS[cat]}
                                        </SelectLabel>
                                        {DOC_TYPE_CATALOG[cat].map(d => (
                                            <SelectItem key={d.docType} value={d.docType}>{d.label}</SelectItem>
                                        ))}
                                    </SelectGroup>
                                ))}
                                <SelectGroup>
                                    <SelectLabel className="text-xs font-semibold text-muted-foreground px-2 py-1.5 uppercase tracking-wide">
                                        Other
                                    </SelectLabel>
                                    <SelectItem value="Other">Other</SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        {errors.docType && <p className="text-xs text-destructive">{errors.docType}</p>}
                    </div>

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
                                        : errors.file
                                            ? 'border-destructive bg-destructive/5 hover:border-destructive/70'
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
                        {errors.file && <p className="text-xs text-destructive">{errors.file}</p>}
                    </div>
                </div>

                <DialogFooter className="px-6 py-4 border-t bg-muted/20 shrink-0">
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
