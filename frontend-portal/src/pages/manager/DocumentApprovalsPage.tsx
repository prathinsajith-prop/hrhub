import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Check, Download, FileCheck2, X } from 'lucide-react'

import { ApiError } from '@/lib/api'
import {
    triggerDocumentDownload,
    useApproveDocument,
    usePendingDocuments,
    useRejectDocument,
    type PendingDocument,
} from '@/hooks/useDocuments'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { formatDate } from '@/lib/utils'

export function ManagerDocumentApprovalsPage() {
    const { data, isLoading } = usePendingDocuments()
    const approve = useApproveDocument()
    const [rejectTarget, setRejectTarget] = useState<PendingDocument | null>(null)

    const docs = data ?? []

    function onApprove(doc: PendingDocument) {
        approve.mutate(doc.id, {
            onSuccess: () => toast.success(`${doc.docType} approved`),
            onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Approval failed'),
        })
    }

    return (
        <div className="space-y-5">
            <PageHeader
                title="Document approvals"
                subtitle={docs.length > 0 ? `${docs.length} awaiting review` : undefined}
            />

            {isLoading ? (
                <div className="space-y-3">
                    <Skeleton className="h-24" />
                    <Skeleton className="h-24" />
                </div>
            ) : docs.length === 0 ? (
                <EmptyState
                    icon={<FileCheck2 className="size-8" />}
                    title="No documents awaiting your approval"
                    description="When a team member uploads a document, it'll show up here for you to review."
                />
            ) : (
                <div className="space-y-2">
                    {docs.map((doc) => (
                        <PendingRow
                            key={doc.id}
                            doc={doc}
                            onApprove={() => onApprove(doc)}
                            onReject={() => setRejectTarget(doc)}
                            approving={approve.isPending && approve.variables === doc.id}
                        />
                    ))}
                </div>
            )}

            <RejectDialog
                target={rejectTarget}
                onClose={() => setRejectTarget(null)}
            />
        </div>
    )
}

function PendingRow({
    doc,
    onApprove,
    onReject,
    approving,
}: {
    doc: PendingDocument
    onApprove: () => void
    onReject: () => void
    approving: boolean
}) {
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

    return (
        <Card className="border-border/70">
            <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold">{doc.docType}</span>
                            <Badge variant="outline" className="text-[10px] capitalize">{doc.category}</Badge>
                            <Badge className="border-0 bg-sky-100 text-[10px] uppercase tracking-wider text-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
                                pending
                            </Badge>
                        </div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">{doc.fileName}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground/90">
                            <span>
                                {doc.employeeName ?? 'Unknown employee'}
                                {doc.employeeNo ? ` · #${doc.employeeNo}` : ''}
                                {doc.employeeDepartment ? ` · ${doc.employeeDepartment}` : ''}
                            </span>
                            {doc.expiryDate ? <span>Expires {formatDate(doc.expiryDate)}</span> : null}
                            <span>Submitted {formatDate(doc.createdAt)}</span>
                        </div>
                        {doc.notes ? (
                            <p className="mt-1 text-[11px] italic text-muted-foreground/80">"{doc.notes}"</p>
                        ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={download}
                            loading={downloading}
                            disabled={!doc.hasFile}
                        >
                            <Download className="size-4" />
                            <span className="hidden sm:inline">View</span>
                        </Button>
                        <Button size="sm" variant="outline" onClick={onReject} disabled={approving}>
                            <X className="size-4" />
                            <span className="hidden sm:inline">Reject</span>
                        </Button>
                        <Button size="sm" onClick={onApprove} loading={approving}>
                            <Check className="size-4" />
                            <span className="hidden sm:inline">Approve</span>
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

function RejectDialog({ target, onClose }: { target: PendingDocument | null; onClose: () => void }) {
    const reject = useRejectDocument()
    const [reason, setReason] = useState('')

    function onSubmit(e: FormEvent) {
        e.preventDefault()
        if (!target) return
        const trimmed = reason.trim()
        if (!trimmed) {
            toast.error('Please provide a reason')
            return
        }
        reject.mutate(
            { id: target.id, reason: trimmed },
            {
                onSuccess: () => {
                    toast.success(`${target.docType} rejected`)
                    setReason('')
                    onClose()
                },
                onError: (err) => {
                    toast.error(err instanceof ApiError ? err.message : 'Rejection failed')
                },
            },
        )
    }

    return (
        <Dialog open={!!target} onOpenChange={(v) => { if (!v) { setReason(''); onClose() } }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Reject document</DialogTitle>
                    <DialogDescription>
                        {target ? <>Tell {target.employeeName ?? 'the employee'} why "{target.docType}" was rejected so they can re-upload.</> : null}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={onSubmit} className="space-y-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="reject-reason">Reason *</Label>
                        <Input
                            id="reject-reason"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Reason for rejection"
                            required
                        />
                    </div>
                    <DialogFooter className="gap-2">
                        <Button type="button" variant="ghost" onClick={onClose} disabled={reject.isPending}>
                            Cancel
                        </Button>
                        <Button type="submit" variant="destructive" loading={reject.isPending}>
                            Reject document
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
