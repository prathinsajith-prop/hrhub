import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { useQueryClient } from '@tanstack/react-query'
import { FileText, Upload, AlertTriangle, CheckCircle2, Clock, Eye, Download, Trash2, Plus, ShieldCheck, Edit2 } from 'lucide-react'
import { DataTable } from '@/components/ui/data-table'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge, Card } from '@/components/ui/primitives'
import { KpiCardCompact } from '@/components/ui/kpi-card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter, toast, ConfirmDialog } from '@/components/ui/overlays'
import { ImageUpload } from '@/components/ui/form-controls'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectLabel, SelectGroup } from '@/components/ui/form-controls'
import { DatePicker } from '@/components/ui/date-picker'
import { Label } from '@/components/ui/primitives'
import { api } from '@/lib/api'
import { formatDate, getDaysUntilExpiry, cn } from '@/lib/utils'
import { useDocuments, useVerifyDocument, useDeleteDocument } from '@/hooks/useDocuments'
import { useEmployees } from '@/hooks/useEmployees'
import { useSearchFilters } from '@/hooks/useSearchFilters'
import { applyClientFilters, type FilterConfig } from '@/lib/filters'
import { EditDocumentDialog } from '@/components/shared/action-dialogs'
import { InitialsAvatar } from '@/components/shared/Avatar'
import { DocumentViewerDialog } from '@/components/shared/DocumentViewerDialog'
import type { Document, DocStatus } from '@/types'

const statusBadge: Record<DocStatus, { variant: any; label: string }> = {
  valid: { variant: 'success', label: 'Valid' },
  expiring_soon: { variant: 'warning', label: 'Expiring Soon' },
  expired: { variant: 'destructive', label: 'Expired' },
  pending_upload: { variant: 'secondary', label: 'Pending Upload' },
  under_review: { variant: 'info', label: 'Under Review' },
}

const DOCUMENT_FILTERS: FilterConfig[] = [
  { name: 'employeeName', label: 'Employee', type: 'text', field: 'employeeName' },
  {
    name: 'category', label: 'Category', type: 'select', field: 'category',
    options: [
      { value: 'identity', label: 'Identity' },
      { value: 'visa', label: 'Visa' },
      { value: 'employment', label: 'Employment' },
      { value: 'compliance', label: 'Compliance' },
      { value: 'financial', label: 'Financial' },
      { value: 'qualification', label: 'Qualification' },
    ],
  },
  {
    name: 'status', label: 'Status', type: 'select', field: 'status',
    options: [
      { value: 'valid', label: 'Valid' },
      { value: 'expiring_soon', label: 'Expiring soon' },
      { value: 'expired', label: 'Expired' },
      { value: 'under_review', label: 'Under review' },
      { value: 'pending_upload', label: 'Pending upload' },
    ],
  },
  { name: 'expiryDate', label: 'Expiry date', type: 'date_range', field: 'expiryDate' },
  { name: 'verified', label: 'Verified only', type: 'toggle', field: 'verified' },
]

function ExpiryCell({ date }: { date?: string }) {
  if (!date) return <span className="text-xs text-muted-foreground">—</span>
  const days = getDaysUntilExpiry(date)
  return (
    <div>
      <p className={cn('text-xs font-medium', days < 0 ? 'text-red-600' : days <= 30 ? 'text-red-500' : days <= 90 ? 'text-amber-600' : 'text-foreground')}>
        {days < 0 ? `Expired ${Math.abs(days)}d ago` : days <= 30 ? `${days}d left` : formatDate(date)}
      </p>
    </div>
  )
}

function UploadDocumentDialog({ open, onOpenChange, defaultEmployeeId, defaultCategory }: { open: boolean; onOpenChange: (o: boolean) => void; defaultEmployeeId?: string; defaultCategory?: string }) {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [employeeId, setEmployeeId] = useState(defaultEmployeeId ?? '')
  const [category, setCategory] = useState(defaultCategory ?? '')
  const [expiryDate, setExpiryDate] = useState('')
  const [saving, setSaving] = useState(false)
  const { data: empData } = useEmployees({ limit: 1000 })
  const employees = (empData?.data as any[]) ?? []
  const qc = useQueryClient()

  // Sync defaults when reopened with new query params
  useEffect(() => {
    if (open) {
      if (defaultEmployeeId) setEmployeeId(defaultEmployeeId)
      if (defaultCategory) setCategory(defaultCategory)
    }
  }, [open, defaultEmployeeId, defaultCategory])

  const handleSave = async () => {
    if (!employeeId) { toast.warning('Employee required', 'Please select an employee.'); return }
    if (!uploadedFile) { toast.warning('No file selected', 'Please select a document to upload.'); return }
    if (!category) { toast.warning('Category required', 'Please select a document category.'); return }

    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('file', uploadedFile)
      fd.append('employeeId', employeeId)
      fd.append('category', category)
      fd.append('docType', uploadedFile.name)
      if (expiryDate) fd.append('expiryDate', expiryDate)

      await api.upload('/documents/upload', fd)
      await qc.invalidateQueries({ queryKey: ['documents'] })
      toast.success('Document uploaded', `${uploadedFile.name} is under review.`)
      onOpenChange(false)
      setUploadedFile(null)
      setEmployeeId('')
      setCategory('')
      setExpiryDate('')
    } catch {
      toast.error('Upload failed', 'Could not upload the document. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Employee</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees.length === 0 ? (
                    <SelectItem value="__none" disabled>No employees found</SelectItem>
                  ) : (
                    employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.fullName ?? `${e.firstName} ${e.lastName}`}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Document Category *</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Identity</SelectLabel>
                    <SelectItem value="identity">Passport / EID</SelectItem>
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Visa</SelectLabel>
                    <SelectItem value="visa">Residence Visa / Entry Permit</SelectItem>
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Employment</SelectLabel>
                    <SelectItem value="employment">Contract / Offer Letter / NOC</SelectItem>
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Other</SelectLabel>
                    <SelectItem value="compliance">Compliance</SelectItem>
                    <SelectItem value="financial">Financial</SelectItem>
                    <SelectItem value="qualification">Qualification</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Expiry Date (if applicable)</Label>
            <DatePicker value={expiryDate} min={new Date().toISOString().split('T')[0]} onChange={setExpiryDate} />
          </div>

          <div className="space-y-1.5">
            <Label>Document File *</Label>
            <ImageUpload
              variant="document"
              accept=".pdf,.jpg,.jpeg,.png"
              maxSizeMB={10}
              label="Upload Document (PDF, JPG, PNG)"
              hint="Max file size: 10MB. Supported formats: PDF, JPG, PNG"
              onChange={(file) => setUploadedFile(file)}
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} loading={saving} leftIcon={<Upload className="h-3.5 w-3.5" />}>Upload Document</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const columns = (
  onView: (d: Document) => void,
  onDelete: (d: Document) => void,
  onVerify: (d: Document) => void,
  onEdit: (d: Document) => void,
  onDownload: (d: Document) => void,
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
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Edit document"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => onEdit(d)}
          >
            <Edit2 className="h-3.5 w-3.5" />
          </Button>
          {(d.status === 'under_review' || d.status === 'pending_upload') && (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Verify document"
              onClick={() => onVerify(d)}
            >
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            </Button>
          )}
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Delete document"
            className="text-destructive hover:text-destructive"
            onClick={() => onDelete(d)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
      size: 110,
    },
  ]

export function DocumentsPage() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const qpEmployee = searchParams.get('employeeId') ?? ''
  const qpCategory = searchParams.get('category') ?? ''
  const qpUpload = searchParams.get('upload') === '1' || !!qpEmployee || !!qpCategory
  const [uploadOpen, setUploadOpen] = useState(qpUpload)
  const [editTarget, setEditTarget] = useState<Document | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null)
  const [viewTarget, setViewTarget] = useState<Document | null>(null)
  const { data: docsData, isLoading } = useDocuments({ limit: 100 })
  const documents: Document[] = (docsData?.data as Document[]) ?? []
  const expiring = documents.filter((d: any) => d.status === 'expiring_soon').length
  const expired = documents.filter((d: any) => d.status === 'expired').length
  const verifyDoc = useVerifyDocument()
  const deleteDoc = useDeleteDocument()
  const search = useSearchFilters({
    storageKey: 'hrhub.documents.searchHistory',
    availableFilters: DOCUMENT_FILTERS,
  })
  const filteredDocuments = useMemo(
    () => applyClientFilters(documents as any[], {
      searchInput: search.searchInput,
      appliedFilters: search.appliedFilters,
      searchFields: ['employeeName', 'employeeNo', 'docType', 'fileName', 'category'],
    }),
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
      a.download = (d as any).fileName ?? d.docType ?? 'document'
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
    verifyDoc.mutate(d.id, {
      onSuccess: () => toast.success('Document verified', `${d.docType} has been marked as valid.`),
      onError: () => toast.error('Verification failed', 'Could not verify this document.'),
    })
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
    () => columns(handleView, (d) => setDeleteTarget(d), handleVerify, (d) => setEditTarget(d), handleDownload),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  return (
    <PageWrapper>
      <PageHeader
        title={t('documents.title')}
        description={t('documents.description')}
        actions={
          <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setUploadOpen(true)}>
            Upload Document
          </Button>
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
            <KpiCardCompact label="Valid" value={documents.filter((d: any) => d.status === 'valid').length} icon={CheckCircle2} color="green" />
            <KpiCardCompact label="Expiring Soon" value={expiring} icon={AlertTriangle} color="amber" />
            <KpiCardCompact label="Under Review" value={documents.filter((d: any) => d.status === 'under_review').length} icon={Clock} color="purple" />
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
          getRowId={(row: any) => String(row.id)}
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
                  for (const row of selected as any[]) {
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
                onClick={() => {
                  Promise.all(selected.map((row: any) => api.delete(`/documents/${row.id}`))).then(() => {
                    toast.warning(`${selected.length} document${selected.length === 1 ? '' : 's'} archived`)
                  })
                }}>
                Archive
              </Button>
            </>
          )}
        />
      </Card>
      <UploadDocumentDialog
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
        defaultEmployeeId={qpEmployee || undefined}
        defaultCategory={qpCategory || undefined}
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
      <DocumentViewerDialog
        open={!!viewTarget}
        onOpenChange={(o) => !o && setViewTarget(null)}
        documentId={viewTarget?.id ?? null}
        fileName={(viewTarget as any)?.fileName ?? viewTarget?.docType}
      />
    </PageWrapper>
  )
}
