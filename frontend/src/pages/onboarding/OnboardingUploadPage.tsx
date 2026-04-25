import { useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, Clock, Upload, FileText, AlertCircle, ChevronDown, ChevronUp, CalendarDays, Building2, XCircle } from 'lucide-react'
import { useOnboardingUploadInfo, useOnboardingPublicUpload, type UploadInfoStep } from '@/hooks/useOnboarding'
import { DOC_TYPE_CATALOG, type DocCategory } from '@/lib/docTypes'
import { DatePicker } from '@/components/ui/date-picker'
import { cn, formatDate } from '@/lib/utils'

// ── Status pill ──────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
    pending: { label: 'Pending', cls: 'bg-gray-100 text-gray-600' },
    in_progress: { label: 'In Progress', cls: 'bg-blue-50 text-blue-700' },
    completed: { label: 'Completed', cls: 'bg-green-50 text-green-700' },
    overdue: { label: 'Overdue', cls: 'bg-red-50 text-red-700' },
} as const

function StatusPill({ status }: { status: string }) {
    const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending
    return <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium', cfg.cls)}>{cfg.label}</span>
}

// ── Upload area for a single step ────────────────────────────────────────────
function StepUploadArea({
    step,
    token,
    onUploaded,
}: {
    step: UploadInfoStep
    token: string
    onUploaded: () => void
}) {
    const [expanded, setExpanded] = useState(step.uploadedDocs.length === 0 && step.status !== 'completed')
    const [selectedCategory, setSelectedCategory] = useState<DocCategory | ''>('')
    const [selectedDocType, setSelectedDocType] = useState('')
    const [expiryDate, setExpiryDate] = useState('')
    const [file, setFile] = useState<File | null>(null)
    const [uploading, setUploading] = useState(false)
    const [success, setSuccess] = useState(false)
    const [error, setError] = useState('')
    const fileRef = useRef<HTMLInputElement>(null)
    const upload = useOnboardingPublicUpload(token)

    const categoryDocs = selectedCategory ? DOC_TYPE_CATALOG[selectedCategory] : []
    const selectedDocDef = categoryDocs.find(d => d.docType === selectedDocType)
    const expiryRequired = selectedDocDef?.expiryRequired ?? false

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0]
        if (f) { setFile(f); setError('') }
    }

    const handleUpload = async () => {
        if (!selectedCategory) { setError('Please select a document category.'); return }
        if (!selectedDocType) { setError('Please select a document type.'); return }
        if (!file) { setError('Please choose a file to upload.'); return }
        if (expiryRequired && !expiryDate) { setError('This document type requires an expiry date.'); return }

        setUploading(true)
        setError('')
        try {
            await upload.mutateAsync({
                file,
                stepId: step.id,
                category: selectedCategory,
                docType: selectedDocType,
                expiryDate: expiryDate || undefined,
            })
            setSuccess(true)
            setFile(null)
            setSelectedCategory('')
            setSelectedDocType('')
            setExpiryDate('')
            if (fileRef.current) fileRef.current.value = ''
            onUploaded()
            setTimeout(() => { setSuccess(false); setExpanded(false) }, 2000)
        } catch {
            setError('Upload failed. Please check your file and try again.')
        } finally {
            setUploading(false)
        }
    }

    return (
        <div className="border rounded-xl overflow-hidden bg-white shadow-sm">
            {/* Step header */}
            <button
                type="button"
                onClick={() => setExpanded(e => !e)}
                className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors"
            >
                <div className="flex items-center gap-3 min-w-0">
                    <div className={cn(
                        'h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                        step.status === 'completed' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600',
                    )}>
                        {step.status === 'completed' ? <CheckCircle2 className="h-4 w-4" /> : step.stepOrder}
                    </div>
                    <div className="text-left min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{step.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                            <StatusPill status={step.status} />
                            {step.dueDate && (
                                <span className="text-[11px] text-gray-400 flex items-center gap-0.5">
                                    <CalendarDays className="h-3 w-3" />Due {formatDate(step.dueDate)}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {step.requiredDocs.length > 0 && (() => {
                        const fulfilled = step.requiredDocs.filter(r => r.fulfilled).length
                        const total = step.requiredDocs.length
                        const allDone = fulfilled === total
                        return (
                            <span className={cn(
                                'text-[11px] px-2 py-0.5 rounded-full font-medium',
                                allDone ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700',
                            )}>
                                {fulfilled}/{total} required
                            </span>
                        )
                    })()}
                    {step.uploadedDocs.length > 0 && (
                        <span className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                            {step.uploadedDocs.length} doc{step.uploadedDocs.length !== 1 ? 's' : ''}
                        </span>
                    )}
                    {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                </div>
            </button>

            {expanded && (
                <div className="border-t bg-gray-50/50 px-4 pt-4 pb-5 space-y-4">
                    {/* Required documents (configured) */}
                    {step.requiredDocs.length > 0 && (
                        <div>
                            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Required documents</p>
                            <div className="space-y-1.5">
                                {step.requiredDocs.map(r => (
                                    <button
                                        key={r.id}
                                        type="button"
                                        onClick={() => {
                                            setSelectedCategory(r.category as DocCategory)
                                            setSelectedDocType(r.docType)
                                        }}
                                        className={cn(
                                            'w-full flex items-start gap-2.5 px-3 py-2 rounded-lg border text-left transition-colors',
                                            r.fulfilled
                                                ? 'bg-green-50/60 border-green-200'
                                                : selectedDocType === r.docType
                                                    ? 'bg-blue-600 text-white border-blue-600'
                                                    : 'bg-white border-gray-200 hover:border-blue-300',
                                        )}
                                    >
                                        <span className="mt-0.5 shrink-0">
                                            {r.fulfilled
                                                ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                                                : <span className={cn('h-2 w-2 rounded-full inline-block', r.isMandatory ? 'bg-red-500' : 'bg-gray-300', selectedDocType === r.docType && 'bg-white')} />}
                                        </span>
                                        <span className="flex-1 min-w-0">
                                            <span className="flex items-center gap-1.5 flex-wrap">
                                                <span className={cn('text-xs font-medium', selectedDocType === r.docType && !r.fulfilled ? 'text-white' : 'text-gray-900')}>
                                                    {r.docType}
                                                </span>
                                                {r.isMandatory && !r.fulfilled && (
                                                    <span className="text-[9px] font-semibold uppercase tracking-wide text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Required</span>
                                                )}
                                                {r.expiryRequired && (
                                                    <span className={cn(
                                                        'text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded',
                                                        selectedDocType === r.docType && !r.fulfilled ? 'bg-white/20 text-white' : 'bg-amber-50 text-amber-700',
                                                    )}>Expiry needed</span>
                                                )}
                                                {r.fulfilled && (
                                                    <span className="text-[9px] font-semibold uppercase tracking-wide text-green-700 bg-green-100 px-1.5 py-0.5 rounded">Uploaded</span>
                                                )}
                                            </span>
                                            {r.hint && (
                                                <span className={cn('block text-[10px] mt-0.5', selectedDocType === r.docType && !r.fulfilled ? 'text-white/80' : 'text-gray-500')}>
                                                    {r.hint}
                                                </span>
                                            )}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Fallback: legacy suggestions only when no required-docs configured */}
                    {step.requiredDocs.length === 0 && step.suggestedDocs.length > 0 && (
                        <div>
                            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Suggested for this step</p>
                            <div className="flex flex-wrap gap-1.5">
                                {step.suggestedDocs.map((d) => (
                                    <button
                                        key={d.docType}
                                        type="button"
                                        onClick={() => {
                                            setSelectedCategory(d.category as DocCategory)
                                            setSelectedDocType(d.docType)
                                        }}
                                        className={cn(
                                            'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors',
                                            selectedDocType === d.docType
                                                ? 'bg-blue-600 text-white border-blue-600'
                                                : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300',
                                        )}
                                    >
                                        {d.docType}
                                        {d.expiryRequired && <span className="text-[9px] opacity-70">· exp. req.</span>}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Already uploaded docs */}
                    {step.uploadedDocs.length > 0 && (
                        <div>
                            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Uploaded</p>
                            <div className="space-y-1.5">
                                {step.uploadedDocs.map((d) => {
                                    const rejected = d.status === 'rejected'
                                    return (
                                        <div
                                            key={d.id}
                                            className={cn(
                                                'flex items-start gap-2 px-3 py-2 rounded-lg border',
                                                rejected ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200',
                                            )}
                                        >
                                            {rejected
                                                ? <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                                                : <FileText className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-medium text-gray-800 truncate">{d.docType}</p>
                                                <p className="text-[10px] text-gray-400 truncate">{d.fileName}{d.expiryDate ? ` · Exp ${formatDate(d.expiryDate)}` : ''}</p>
                                                {rejected && d.rejectionReason && (
                                                    <p className="text-[11px] text-red-700 mt-1">
                                                        <span className="font-semibold">Rejected — please re-upload.</span>{' '}
                                                        Reason: {d.rejectionReason}
                                                    </p>
                                                )}
                                            </div>
                                            <span className={cn(
                                                'text-[10px] capitalize px-1.5 py-0.5 rounded shrink-0',
                                                rejected ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-400',
                                            )}>{d.status.replace('_', ' ')}</span>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* Upload form */}
                    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                        <p className="text-xs font-semibold text-gray-700">Upload a document for this step</p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <label className="text-[11px] font-medium text-gray-500">Category *</label>
                                <select
                                    value={selectedCategory}
                                    onChange={(e) => { setSelectedCategory(e.target.value as DocCategory); setSelectedDocType('') }}
                                    className="w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                >
                                    <option value="">Select category…</option>
                                    {(Object.keys(DOC_TYPE_CATALOG) as DocCategory[]).map(cat => (
                                        <option key={cat} value={cat} className="capitalize">
                                            {cat.charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, ' ')}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[11px] font-medium text-gray-500">Document type *</label>
                                <select
                                    value={selectedDocType}
                                    onChange={(e) => setSelectedDocType(e.target.value)}
                                    disabled={!selectedCategory}
                                    className="w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 disabled:opacity-50"
                                >
                                    <option value="">Select document…</option>
                                    {categoryDocs.map(d => (
                                        <option key={d.docType} value={d.docType}>{d.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {expiryRequired && (
                            <div className="space-y-1">
                                <label className="text-[11px] font-medium text-red-600 flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" />
                                    Expiry date required *
                                </label>
                                <DatePicker
                                    value={expiryDate}
                                    onChange={setExpiryDate}
                                    className="h-9"
                                    placeholder="Select expiry date"
                                />
                                {selectedDocDef?.hint && (
                                    <p className="text-[10px] text-gray-400">{selectedDocDef.hint}</p>
                                )}
                            </div>
                        )}

                        {selectedDocDef && !expiryRequired && selectedDocDef.hint && (
                            <p className="text-[11px] text-gray-400">{selectedDocDef.hint}</p>
                        )}

                        {/* File picker */}
                        <div>
                            <label className="text-[11px] font-medium text-gray-500">File *</label>
                            <div
                                className="mt-1 border-2 border-dashed border-gray-200 rounded-lg p-4 text-center hover:border-blue-300 hover:bg-blue-50/30 transition-colors cursor-pointer"
                                onClick={() => fileRef.current?.click()}
                            >
                                {file ? (
                                    <div className="flex items-center justify-center gap-2">
                                        <FileText className="h-4 w-4 text-blue-500" />
                                        <span className="text-sm font-medium text-gray-800">{file.name}</span>
                                        <span className="text-[11px] text-gray-400">({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
                                    </div>
                                ) : (
                                    <div>
                                        <Upload className="h-5 w-5 text-gray-300 mx-auto mb-1" />
                                        <p className="text-xs text-gray-500">Click to select file</p>
                                        <p className="text-[10px] text-gray-400">PDF, JPG, PNG — max 10 MB</p>
                                    </div>
                                )}
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    className="hidden"
                                    onChange={handleFile}
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                {error}
                            </div>
                        )}

                        {success && (
                            <div className="flex items-center gap-2 text-green-700 text-xs bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                Document uploaded successfully — thank you!
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={handleUpload}
                            disabled={uploading}
                            className="w-full h-9 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60 transition-colors"
                        >
                            {uploading ? (
                                <><div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Uploading…</>
                            ) : (
                                <><Upload className="h-4 w-4" />Upload Document</>
                            )}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function OnboardingUploadPage() {
    const { token = '' } = useParams<{ token: string }>()
    const { data, isLoading, error, refetch } = useOnboardingUploadInfo(token)
    const info = data

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
                <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-gray-500">Loading your upload portal…</p>
                </div>
            </div>
        )
    }

    if (error || !info) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-4">
                <div className="max-w-sm w-full bg-white rounded-2xl shadow-lg border border-red-100 p-8 text-center space-y-3">
                    <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center mx-auto">
                        <AlertCircle className="h-6 w-6 text-red-500" />
                    </div>
                    <h2 className="text-lg font-bold text-gray-900">Link Expired or Invalid</h2>
                    <p className="text-sm text-gray-500">This upload link has expired or is not valid. Please contact your HR team to request a new link.</p>
                </div>
            </div>
        )
    }

    const completedSteps = info.steps.filter(s => s.status === 'completed').length
    const totalSteps = info.steps.length
    const hasUploads = info.steps.some(s => s.uploadedDocs.length > 0)

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 py-8 px-4">
            <div className="max-w-2xl mx-auto space-y-4">
                {/* Header card */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <div className="flex items-start gap-4">
                        <div className="h-12 w-12 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
                            <Building2 className="h-6 w-6 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-wide mb-0.5">
                                {info.companyName ?? 'Your Company'}
                            </p>
                            <h1 className="text-xl font-bold text-gray-900">Welcome, {info.employeeName}!</h1>
                            <p className="text-sm text-gray-500 mt-1">
                                Please upload the required documents for each onboarding step below.
                                Your HR team will review and verify them.
                            </p>
                        </div>
                    </div>

                    {/* Progress bar */}
                    <div className="mt-5 space-y-3">
                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs font-medium text-gray-600">Onboarding progress</span>
                                <span className="text-xs font-semibold text-gray-900">{completedSteps}/{totalSteps} steps complete</span>
                            </div>
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-blue-600 rounded-full transition-all duration-500"
                                    style={{ width: `${totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0}%` }}
                                />
                            </div>
                        </div>
                        {info.mandatoryTotal > 0 && (
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-xs font-medium text-gray-600">Required documents uploaded</span>
                                    <span className={cn(
                                        'text-xs font-semibold',
                                        info.mandatoryFulfilled === info.mandatoryTotal ? 'text-green-700' : 'text-amber-700',
                                    )}>
                                        {info.mandatoryFulfilled}/{info.mandatoryTotal}
                                    </span>
                                </div>
                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className={cn(
                                            'h-full rounded-full transition-all duration-500',
                                            info.mandatoryFulfilled === info.mandatoryTotal ? 'bg-green-600' : 'bg-amber-500',
                                        )}
                                        style={{ width: `${info.requiredDocsProgress ?? 0}%` }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Info banner */}
                {hasUploads && (
                    <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                        <p className="text-sm text-green-800">Some documents have already been uploaded. You can continue uploading more below.</p>
                    </div>
                )}

                {/* Steps */}
                <div className="space-y-3">
                    {info.steps.map((step) => (
                        <StepUploadArea
                            key={step.id}
                            step={step}
                            token={token}
                            onUploaded={() => refetch()}
                        />
                    ))}
                </div>

                {/* Footer */}
                <div className="text-center">
                    <p className="text-[11px] text-gray-400">
                        Secure document upload powered by <strong className="text-gray-600">HRHub</strong> &mdash; UAE HR &amp; PRO Platform
                    </p>
                    <div className="flex items-center justify-center gap-1 mt-1">
                        <Clock className="h-3 w-3 text-gray-400" />
                        <p className="text-[10px] text-gray-400">This link is single-use and time-limited. Contact HR if it expires.</p>
                    </div>
                </div>
            </div>
        </div>
    )
}
