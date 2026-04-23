import { useEffect, useState } from 'react'
import { Download, ExternalLink, FileText, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, toast } from '@/components/ui/overlays'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'

interface DocumentViewerDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    documentId: string | null
    fileName?: string | null
}

/**
 * Inline document viewer modal — fetches a presigned download URL for the
 * document and renders it inside the dialog.
 *  - PDFs render in an embedded <iframe>.
 *  - Images render as an <img>.
 *  - Anything else falls back to a "Open in new tab" / Download CTA.
 */
export function DocumentViewerDialog({ open, onOpenChange, documentId, fileName }: DocumentViewerDialogProps) {
    const [url, setUrl] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!open || !documentId) {
            setUrl(null)
            return
        }
        let cancelled = false
        setLoading(true)
        api
            .get<{ data: { downloadUrl: string } }>(`/documents/${documentId}/download-url`)
            .then((res) => {
                if (!cancelled) setUrl(res.data.downloadUrl)
            })
            .catch(() => {
                if (!cancelled) toast.error('Could not load document', 'Please try again.')
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [open, documentId])

    const ext = (fileName ?? '').toLowerCase().split('.').pop() ?? ''
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)
    const isPdf = ext === 'pdf'

    const handleDownload = () => {
        if (!url) return
        const a = document.createElement('a')
        a.href = url
        a.download = fileName ?? 'document'
        a.target = '_blank'
        a.rel = 'noopener'
        document.body.appendChild(a)
        a.click()
        a.remove()
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size="xl" className="max-w-5xl">
                <DialogHeader>
                    <div className="flex items-center justify-between gap-3 pe-8">
                        <DialogTitle className="flex items-center gap-2 min-w-0">
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="truncate">{fileName ?? 'Document'}</span>
                        </DialogTitle>
                        <div className="flex items-center gap-2 shrink-0">
                            {url && (
                                <>
                                    <Button size="sm" variant="outline" leftIcon={<ExternalLink className="h-3.5 w-3.5" />} onClick={() => window.open(url, '_blank')}>
                                        Open
                                    </Button>
                                    <Button size="sm" variant="outline" leftIcon={<Download className="h-3.5 w-3.5" />} onClick={handleDownload}>
                                        Download
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                </DialogHeader>
                <DialogBody className="p-0">
                    <div className="bg-muted/30 min-h-[60vh] flex items-center justify-center">
                        {loading && (
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                <Loader2 className="h-6 w-6 animate-spin" />
                                <span className="text-sm">Loading document…</span>
                            </div>
                        )}
                        {!loading && url && isPdf && (
                            <iframe
                                src={url}
                                title={fileName ?? 'Document'}
                                className="w-full h-[75vh] border-0 bg-background"
                            />
                        )}
                        {!loading && url && isImage && (
                            <img src={url} alt={fileName ?? 'Document'} className="max-w-full max-h-[75vh] object-contain" />
                        )}
                        {!loading && url && !isPdf && !isImage && (
                            <div className="text-center p-10 space-y-3">
                                <FileText className="h-12 w-12 mx-auto text-muted-foreground/40" />
                                <p className="text-sm text-muted-foreground">
                                    This file type can't be previewed in the browser.
                                </p>
                                <div className="flex items-center justify-center gap-2">
                                    <Button size="sm" variant="outline" leftIcon={<ExternalLink className="h-3.5 w-3.5" />} onClick={() => window.open(url, '_blank')}>
                                        Open in new tab
                                    </Button>
                                    <Button size="sm" leftIcon={<Download className="h-3.5 w-3.5" />} onClick={handleDownload}>
                                        Download
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </DialogBody>
            </DialogContent>
        </Dialog>
    )
}
