import { memo, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { useQueryClient } from '@tanstack/react-query'
import { FileText, Upload, AlertTriangle, CheckCircle2, Clock, Eye, Download, Trash2, Plus, ShieldCheck, Edit2, RefreshCcw } from 'lucide-react'
import { DataTable } from '@/components/ui/data-table'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge, Card } from '@/components/ui/primitives'
import { KpiCardCompact } from '@/components/shared/KpiCard'
import { toast, ConfirmDialog } from '@/components/ui/overlays'
import { api } from '@/lib/api'
import { formatDate, getDaysUntilExpiry, cn } from '@/lib/utils'
import { useDocuments, useDeleteDocument } from '@/hooks/useDocuments'
import { usePermissions } from '@/hooks/usePermissions'
import { useSearchFilters } from '@/hooks/useSearchFilters'
import { applyClientFilters, type FilterConfig } from '@/lib/filters'
import { DOC_CATEGORY_OPTIONS, DOC_STATUS_OPTIONS } from '@/lib/options'
import { EditDocumentDialog } from '@/components/shared/action-dialogs'
import { AddDocumentDialog } from '@/components/shared/AddDocumentDialog'
import { InitialsAvatar } from '@/components/shared/Avatar'
import { DocumentViewerDialog } from '@/components/shared/DocumentViewerDialog'
import { VerifyDocumentDialog } from '@/components/shared/VerifyDocumentDialog'
import type { Document, DocStatus } from '@/types'

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info'
const statusBadge: Record<DocStatus, { variant: BadgeVariant; label: string }> = {
  valid: { variant: 'success', label: 'Valid' },
  expiring_soon: { variant: 'warning', label: 'Expiring Soon' },
  expired: { variant: 'destructive', label: 'Expired' },
  pending_upload: { variant: 'secondary', label: 'Pending Upload' },
  under_review: { variant: 'info', label: 'Under Review' },
  rejected: { variant: 'destructive', label: 'Rejected' },
}

const DOCUMENT_FILTERS: FilterConfig[] = [
  { name: 'employeeName', label: 'Employee', type: 'text', field: 'employeeName' },
  { name: 'category', label: 'Category', type: 'select', field: 'category', options: DOC_CATEGORY_OPTIONS },
  { name: 'status', label: 'Status', type: 'select', field: 'status', options: DOC_STATUS_OPTIONS },
  { name: 'expiryDate', label: 'Expiry date', type: 'date_range', field: 'expiryDate' },
  { name: 'verified', label: 'Verified only', type: 'toggle', field: 'verified' },
]

const ExpiryCell = memo(function ExpiryCell({ date }: { date?: string }) {
  if (!date) return <span className="text-xs text-muted-foreground">—</span>
  const days = getDaysUntilExpiry(date)
  return (
    <div>
      <p className={cn('text-xs font-medium', days < 0 ? 'text-red-600' : days <= 30 ? 'text-red-500' : days <= 90 ? 'text-amber-600' : 'text-foreground')}>
        {days < 0 ? `Expired ${Math.abs(days)}d ago` : days <= 30 ? `${days}d left` : formatDate(date)}
      </p>
    </div>
  )
})

const columns = (
  onView: (d: Document) => void,
  onDelete: (d: Document) => void,
  onVerify: (d: Document) => void,
  onEdit: (d: Document) => void,
  onDownload: (d: Document) => void,
  canManage: boolean,
): ColumnDef<Document>[] => [
    {
      accessorKey: 'docType',
      header: 'Document',
      cell: ({ row: { original: d } }) => (
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
            <FileText className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-medium">{d.docType}</p>
            <p className="text-[10px] text-muted-foreground capitalize">{d.category}</p>
          </div>
        </div>
      ),
      size: 200,
    },
    {
      accessorKey: 'employeeName',
      header: 'Employee',
      cell: ({ row: { original: d } }) => {
        const name = d.employeeName || '—'
        return (
          <div className="flex items-center gap-2.5 min-w-0">
            <InitialsAvatar name={name} src={d.employeeAvatarUrl} size="sm" />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{name}</p>
              {(d.employeeNo || d.employeeDepartment) && (
                <p className="text-[11px] text-muted-foreground truncate">
                  {[d.employeeNo, d.employeeDepartment].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          </div>
        )
      },
      size: 220,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ getValue }) => {
        const s = getValue() as DocStatus
        const { variant, label } = statusBadge[s]
        return <Badge variant={variant} className="text-[11px]">{label}</Badge>
      },
    },
    {
      accessorKey: 'expiryDate',
      header: 'Expiry',
      cell: ({ getValue }) => <ExpiryCell date={getValue() as string | undefined} />,
    },
    {
      accessorKey: 'verified',
      header: 'Verified',
      cell: ({ getValue }) => getValue()
        ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        : <Clock className="h-4 w-4 text-amber-400" />,
      size: 80,
    },
    {
      accessorKey: 'uploadedAt',
      header: 'Uploaded',
      cell: ({ getValue, row }) => (
        <div>
          <p className="text-xs">{formatDate(getValue() as string)}</p>
          <p className="text-[10px] text-muted-foreground">by {row.original.uploadedBy}</p>
        </div>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row: { original: d } }) => (
        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="View / download document"
            onClick={() => onView(d)}
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Download document"
            onClick={() => onDownload(d)}
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
          {canManage && (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Edit document"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => onEdit(d)}
            >
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
          )}
          {canManage && (d.status === 'under_review' || d.status === 'pending_upload' || d.status === 'rejected') && (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Verify document"
              onClick={() => onVerify(d)}
            >
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            </Button>
          )}
          {canManage && (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Delete document"
              className="text-destructive hover:text-destructive"
              onClick={() => onDelete(d)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
      size: 110,
    },
  ]

export function DocumentsPage() {
  const { t } = useTranslation()
  const { can } = usePermissions()
  const canManage = can('manage_documents')
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const qpEmployee = searchParams.get('employeeId') ?? ''
  const qpCategory = searchParams.get('category') ?? ''
  const qpUpload = canManage && (searchParams.get('upload') === '1' || !!qpEmployee || !!qpCategory)
  const [uploadOpen, setUploadOpen] = useState(qpUpload)
  const [editTarget, setEditTarget] = useState<Document | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null)
  const [bulkArchiveTarget, setBulkArchiveTarget] = useState<Document[] | null>(null)
  const [viewTarget, setViewTarget] = useState<Document | null>(null)
  const [verifyTarget, setVerifyTarget] = useState<Document | null>(null)
  const { data: docsData, isLoading, isFetching, refetch } = useDocuments({ limit: 100 })
  const documents = useMemo<Document[]>(() => (docsData?.data as Document[]) ?? [], [docsData?.data])
  const expiring = documents.filter((d) => d.status === 'expiring_soon').length
  const expired = documents.filter((d) => d.status === 'expired').length
  const deleteDoc = useDeleteDocument()
  const search = useSearchFilters({
    storageKey: 'hrhub.documents.searchHistory',
    availableFilters: DOCUMENT_FILTERS,
  })
  const filteredDocuments = useMemo(
    () => applyClientFilters(documents as unknown as Record<string, unknown>[], {
      searchInput: search.searchInput,
      appliedFilters: search.appliedFilters,
      searchFields: ['employeeName', 'employeeNo', 'docType', 'fileName', 'category'],
    }) as unknown as Document[],
    [documents, search.appliedFilters, search.searchInput],
  )

  const handleView = (d: Document) => {
    setViewTarget(d)
  }

  const handleDownload = async (d: Document) => {
    try {
      const res = await api.get<{ data: { downloadUrl: string } }>(`/documents/${d.id}/download-url`)
      const a = document.createElement('a')
      a.href = res.data.downloadUrl
      a.download = d.fileName ?? d.docType ?? 'document'
      a.target = '_blank'
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch {
      toast.error('Download failed', 'Could not download this document.')
    }
  }

  const handleVerify = (d: Document) => {
    setVerifyTarget(d)
  }

  const handleDelete = () => {
    if (!deleteTarget) return
    deleteDoc.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success('Document archived', `${deleteTarget.docType} has been removed.`)
        setDeleteTarget(null)
      },
      onError: () => {
        toast.error('Delete failed', 'Could not archive this document.')
        setDeleteTarget(null)
      },
    })
  }

  // Build the table column definitions once per page mount. The handlers below
  // capture stable setState/mutation references, so we use an empty dep array
  // and silence the lint rule explicitly.
  const cols = useMemo(
    () => columns(handleView, (d) => setDeleteTarget(d), handleVerify, (d) => setEditTarget(d), handleDownload, canManage),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canManage],
  )

  return (
    <PageWrapper>
      <PageHeader
        title={t('documents.title')}
        description={t('documents.description')}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" leftIcon={<RefreshCcw className={isFetching ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />} onClick={() => refetch()} disabled={isFetching}>
              Refresh
            </Button>
            {canManage && (
              <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setUploadOpen(true)}>
                Upload Document
              </Button>
            )}
          </div>
        }
      />

      {/* Alert */}
      {(expiring + expired) > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">
            <span className="font-semibold">{expired} expired</span> and <span className="font-semibold">{expiring} expiring soon</span> — action required.
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-7 w-7 rounded-lg" />
              </div>
              <Skeleton className="h-7 w-10" />
            </div>
          ))
        ) : (
          <>
            <KpiCardCompact label="Total Documents" value={documents.length} icon={FileText} color="blue" />
            <KpiCardCompact label="Valid" value={documents.filter((d) => d.status === 'valid').length} icon={CheckCircle2} color="green" />
            <KpiCardCompact label="Expiring Soon" value={expiring} icon={AlertTriangle} color="amber" />
            <KpiCardCompact label="Under Review" value={documents.filter((d) => d.status === 'under_review').length} icon={Clock} color="purple" />
          </>
        )}
      </div>

      <Card className="p-5">
        <DataTable
          columns={cols}
          data={filteredDocuments}
          isLoading={isLoading}
          advancedFilter={{
            search,
            filters: DOCUMENT_FILTERS,
            placeholder: 'Search documents…',
          }}
          pageSize={8}
          enableSelection
          getRowId={(row) => String(row.id)}
          toolbar={
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Upload className="h-3.5 w-3.5" />}
              onClick={() => setUploadOpen(true)}
            >
              Bulk Upload
            </Button>
          }
          bulkActions={(selected) => (
            <>
              <Button variant="outline" size="sm" leftIcon={<Download className="h-3.5 w-3.5" />}
                onClick={async () => {
                  for (const row of selected as Document[]) {
                    try {
                      const res = await api.get<{ data: { downloadUrl: string } }>(`/documents/${row.id}/download-url`)
                      const a = document.createElement('a')
                      a.href = res.data.downloadUrl
                      a.download = row.fileName ?? row.docType ?? 'document'
                      a.target = '_blank'
                      a.rel = 'noopener'
                      document.body.appendChild(a)
                      a.click()
                      a.remove()
                    } catch {
                      // skip failures silently to avoid blocking the loop
                    }
                  }
                }}>
                Download
              </Button>
              <Button variant="destructive" size="sm" leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                onClick={() => setBulkArchiveTarget(selected as Document[])}>
                Archive
              </Button>
            </>
          )}
        />
      </Card>
      <AddDocumentDialog
        open={uploadOpen}
        onOpenChange={(o) => {
          setUploadOpen(o)
          if (!o && (qpEmployee || qpCategory || searchParams.get('upload'))) {
            const next = new URLSearchParams(searchParams)
            next.delete('employeeId')
            next.delete('category')
            next.delete('upload')
            setSearchParams(next, { replace: true })
          }
        }}
        employeeId={qpEmployee || undefined}
      />
      {editTarget && (
        <EditDocumentDialog
          open={!!editTarget}
          onOpenChange={(o) => !o && setEditTarget(null)}
          document={editTarget}
        />
      )}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Archive document?"
        description={`This will remove "${deleteTarget?.docType ?? ''}" from the system. This action cannot be undone.`}
        confirmLabel={deleteDoc.isPending ? 'Archiving…' : 'Archive'}
        variant="destructive"
        onConfirm={handleDelete}
      />
      <ConfirmDialog
        open={!!bulkArchiveTarget}
        onOpenChange={(o) => !o && setBulkArchiveTarget(null)}
        title={`Archive ${bulkArchiveTarget?.length ?? 0} document${(bulkArchiveTarget?.length ?? 0) === 1 ? '' : 's'}?`}
        description="These documents will be permanently removed from the system. This action cannot be undone."
        confirmLabel="Archive All"
        variant="destructive"
        onConfirm={() => {
          if (!bulkArchiveTarget) return
          const count = bulkArchiveTarget.length
          Promise.all(bulkArchiveTarget.map((row) => api.delete(`/documents/${row.id}`)))
            .then(() => toast.warning(`${count} document${count === 1 ? '' : 's'} archived`))
            .catch(() => toast.error('Some documents could not be archived'))
            .finally(() => {
              void qc.invalidateQueries({ queryKey: ['documents'] })
              setBulkArchiveTarget(null)
            })
        }}
      />
      <DocumentViewerDialog
        open={!!viewTarget}
        onOpenChange={(o) => !o && setViewTarget(null)}
        documentId={viewTarget?.id ?? null}
        fileName={viewTarget?.fileName ?? viewTarget?.docType}
      />
      <VerifyDocumentDialog
        open={!!verifyTarget}
        onOpenChange={(o) => !o && setVerifyTarget(null)}
        document={verifyTarget}
      />
    </PageWrapper>
  )
}
