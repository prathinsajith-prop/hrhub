import { useEffect, useState } from 'react'
import { labelFor } from '@/lib/enums'
import {
    CheckCircle2, XCircle, AlertTriangle, FileText, User, Calendar, Clock, Eye,
    Download, ExternalLink, Loader2, Shield, History,
} from 'lucide-react'
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, toast,
} from '@/components/ui/overlays'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { useVerifyDocument, useRejectDocument, useDocumentAuditLog } from '@/hooks/useDocuments'
import { formatDate } from '@/lib/utils'

interface Doc {
    id: string
    docType?: string | null
    fileName?: string | null
    category?: string | null
    status?: string | null
    expiryDate?: string | null
    fileSize?: number | null
    uploadedBy?: string | null
    employeeId?: string | null
    employeeName?: string | null
    employeeNo?: string | null
    employeeDepartment?: string | null
    stepId?: string | null
    rejectionReason?: string | null
    createdAt?: string | null
}

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
    document: Doc | null
}

const ACTION_ICON: Record<string, typeof CheckCircle2> = {
    uploaded: FileText,
    viewed: Eye,
    downloaded: Download,
    verified: CheckCircle2,
    rejected: XCircle,
    deleted: AlertTriangle,
    status_changed: Shield,
    metadata_updated: History,
}

const ACTION_TONE: Record<string, string> = {
    verified: 'text-green-600 bg-green-50',
    rejected: 'text-red-600 bg-red-50',
    deleted: 'text-red-600 bg-red-50',
    uploaded: 'text-blue-600 bg-blue-50',
    viewed: 'text-gray-600 bg-gray-50',
    downloaded: 'text-gray-600 bg-gray-50',
}

export function VerifyDocumentDialog({ open, onOpenChange, document }: Props) {
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [previewLoading, setPreviewLoading] = useState(false)
    const [rejectMode, setRejectMode] = useState(false)
    const [reason, setReason] = useState('')

    const verify = useVerifyDocument()
    const reject = useRejectDocument()
    const { data: auditEntries, refetch: refetchAudit } = useDocumentAuditLog(open ? (document?.id ?? null) : null)

    useEffect(() => {
        if (!open) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setPreviewUrl(null)
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setRejectMode(false)
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setReason('')
            return
        }
        if (!document) return
        let cancelled = false
        setPreviewLoading(true)
        api.get<{ data: { downloadUrl: string } }>(`/documents/${document.id}/download-url`)
            .then(r => { if (!cancelled) setPreviewUrl(r.data.downloadUrl) })
            .catch(() => { /* ignore — preview is optional */ })
            .finally(() => { if (!cancelled) setPreviewLoading(false) })
        return () => { cancelled = true }
    }, [open, document])

    if (!document) return null

    const fileName = document.fileName ?? document.docType ?? 'document'
    const lower = fileName.toLowerCase()
    const isPdf = lower.endsWith('.pdf')
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/.test(lower)

    const handleApprove = () => {
        verify.mutate(document.id, {
            onSuccess: () => {
                toast.success('Document verified', `${document.docType ?? 'Document'} has been marked valid.`)
                refetchAudit()
                onOpenChange(false)
            },
            onError: () => toast.error('Verification failed', 'Could not verify this document.'),
        })
    }

    const handleReject = () => {
        if (!reason.trim()) {
            toast.error('Reason required', 'Please provide a rejection reason.')
            return
        }
        reject.mutate({ id: document.id, reason: reason.trim() }, {
            onSuccess: () => {
                toast.warning('Document rejected', 'Employee has been notified.')
                refetchAudit()
                onOpenChange(false)
            },
            onError: () => toast.error('Reject failed', 'Could not reject this document.'),
        })
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5 text-blue-600" />
                        Verify Document
                    </DialogTitle>
                </DialogHeader>
                <DialogBody className="flex-1 overflow-hidden flex flex-col gap-4">
                    {/* Context strip */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        <ContextItem label="Employee" icon={User}>
                            <p className="text-sm font-medium text-gray-900">{document.employeeName ?? '—'}</p>
                            {document.employeeNo && <p className="text-[11px] text-gray-500">#{document.employeeNo} · {document.employeeDepartment ?? '—'}</p>}
                        </ContextItem>
                        <ContextItem label="Document" icon={FileText}>
                            <p className="text-sm font-medium text-gray-900">{document.docType ?? '—'}</p>
                            <p className="text-[11px] text-gray-500 truncate">{fileName} · {document.category ?? '—'}</p>
                        </ContextItem>
                        <ContextItem label="Expiry" icon={Calendar}>
                            <p className="text-sm font-medium text-gray-900">
                                {document.expiryDate ? formatDate(document.expiryDate) : 'No expiry'}
                            </p>
                        </ContextItem>
                        <ContextItem label="Uploaded" icon={Clock}>
                            <p className="text-sm font-medium text-gray-900">
                                {document.createdAt ? formatDate(document.createdAt) : '—'}
                            </p>
                            {document.fileSize && (
                                <p className="text-[11px] text-gray-500">
                                    {(document.fileSize / 1024 / 1024).toFixed(2)} MB
                                </p>
                            )}
                        </ContextItem>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 overflow-hidden">
                        {/* Preview */}
                        <div className="lg:col-span-2 border rounded-lg bg-gray-50 overflow-hidden flex items-center justify-center min-h-[260px]">
                            {previewLoading ? (
                                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                            ) : previewUrl ? (
                                isPdf ? (
                                    <iframe src={previewUrl} className="w-full h-[420px] border-0" title="Document preview" />
                                ) : isImage ? (
                                    <img src={previewUrl} alt="Document preview" className="max-h-[420px] max-w-full object-contain" />
                                ) : (
                                    <div className="text-center space-y-2">
                                        <FileText className="h-8 w-8 text-gray-400 mx-auto" />
                                        <p className="text-sm text-gray-600">{fileName}</p>
                                        <Button size="sm" variant="outline" leftIcon={<ExternalLink className="h-3.5 w-3.5" />} onClick={() => window.open(previewUrl, '_blank')}>
                                            Open in new tab
                                        </Button>
                                    </div>
                                )
                            ) : (
                                <div className="text-center text-sm text-gray-500">
                                    <FileText className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                                    Preview unavailable
                                </div>
                            )}
                        </div>

                        {/* Audit log */}
                        <div className="border rounded-lg bg-white overflow-hidden flex flex-col">
                            <div className="px-3 py-2 border-b bg-gray-50 flex items-center gap-1.5">
                                <History className="h-3.5 w-3.5 text-gray-500" />
                                <p className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide">Audit log</p>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-1.5 max-h-[420px]">
                                {!auditEntries?.length ? (
                                    <p className="text-xs text-gray-400 text-center py-4">No history yet</p>
                                ) : (
                                    auditEntries.map(e => {
                                        const Icon = ACTION_ICON[e.action] ?? Shield
                                        const tone = ACTION_TONE[e.action] ?? 'text-gray-600 bg-gray-50'
                                        return (
                                            <div key={e.id} className="flex gap-2 p-2 rounded-md hover:bg-gray-50">
                                                <span className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${tone}`}>
                                                    <Icon className="h-3 w-3" />
                                                </span>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[11px] font-medium text-gray-800 capitalize">{labelFor(e.action)}</p>
                                                    <p className="text-[10px] text-gray-500 truncate">
                                                        {e.actorLabel ?? 'system'} · {formatDate(e.createdAt)}
                                                    </p>
                                                    {e.details && typeof e.details === 'object' && 'reason' in e.details && (
                                                        <p className="text-[10px] text-red-600 mt-0.5">"{String((e.details as Record<string, unknown>).reason)}"</p>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Reject reason area (toggled) */}
                    {rejectMode && (
                        <div className="border border-red-200 rounded-lg bg-red-50 p-3 space-y-2">
                            <label className="text-xs font-semibold text-red-800">Reason for rejection (will be emailed to the employee)</label>
                            <textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                rows={3}
                                placeholder="e.g. Document is blurry — please re-upload a clear scan."
                                className="w-full text-sm rounded-md border border-red-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-400/40"
                            />
                        </div>
                    )}

                    {/* Action bar */}
                    <div className="flex flex-wrap items-center justify-end gap-2 pt-1 border-t pt-3">
                        {previewUrl && (
                            <Button variant="outline" size="sm" leftIcon={<Download className="h-3.5 w-3.5" />} onClick={() => window.open(previewUrl, '_blank')}>
                                Open file
                            </Button>
                        )}
                        <div className="flex-1" />
                        {!rejectMode ? (
                            <>
                                <Button variant="outline" size="sm" className="border-red-200 text-red-700 hover:bg-red-50" leftIcon={<XCircle className="h-3.5 w-3.5" />} onClick={() => setRejectMode(true)}>
                                    Reject
                                </Button>
                                <Button size="sm" leftIcon={<CheckCircle2 className="h-3.5 w-3.5" />} onClick={handleApprove} loading={verify.isPending}>
                                    Approve
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button variant="ghost" size="sm" onClick={() => { setRejectMode(false); setReason('') }}>
                                    Cancel
                                </Button>
                                <Button variant="destructive" size="sm" leftIcon={<XCircle className="h-3.5 w-3.5" />} onClick={handleReject} loading={reject.isPending}>
                                    Confirm Reject
                                </Button>
                            </>
                        )}
                    </div>
                </DialogBody>
            </DialogContent>
        </Dialog>
    )
}

function ContextItem({ label, icon: Icon, children }: { label: string; icon: typeof User; children: React.ReactNode }) {
    return (
        <div className="border rounded-lg p-3 bg-white">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1 mb-1">
                <Icon className="h-3 w-3" />{label}
            </p>
            {children}
        </div>
    )
}
