import React, { useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { FileText, Upload, AlertTriangle, CheckCircle2, Clock, Eye, Download, Trash2, Plus } from 'lucide-react'
import { DataTable } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge, Card } from '@/components/ui/primitives'
import { KpiCardCompact } from '@/components/ui/kpi-card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter, ConfirmDialog, toast } from '@/components/ui/overlays'
import { ImageUpload } from '@/components/ui/form-controls'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectLabel, SelectGroup } from '@/components/ui/form-controls'
import { Label, Input } from '@/components/ui/primitives'
import { formatDate, getDaysUntilExpiry, cn } from '@/lib/utils'
import { useDocuments } from '@/hooks/useDocuments'
import type { Document, DocStatus } from '@/types'

const statusBadge: Record<DocStatus, { variant: any; label: string }> = {
  valid: { variant: 'success', label: 'Valid' },
  expiring_soon: { variant: 'warning', label: 'Expiring Soon' },
  expired: { variant: 'destructive', label: 'Expired' },
  pending_upload: { variant: 'secondary', label: 'Pending Upload' },
  under_review: { variant: 'info', label: 'Under Review' },
}

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

function UploadDocumentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)

  const handleSave = () => {
    if (!uploadedFile) { toast.warning('No file selected', 'Please select a document to upload.'); return }
    toast.success('Document uploaded', `${uploadedFile.name} has been uploaded and is under review.`)
    onOpenChange(false)
    setUploadedFile(null)
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
              <Select>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="E001">Ahmed Al Mansouri</SelectItem>
                  <SelectItem value="E002">Sarah Johnson</SelectItem>
                  <SelectItem value="E003">Rahul Sharma</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Document Category</Label>
              <Select>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Identity</SelectLabel>
                    <SelectItem value="passport">Passport</SelectItem>
                    <SelectItem value="eid">Emirates ID</SelectItem>
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Visa</SelectLabel>
                    <SelectItem value="residence_visa">Residence Visa</SelectItem>
                    <SelectItem value="entry_permit">Entry Permit</SelectItem>
                    <SelectItem value="labour_card">Labour Card</SelectItem>
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Employment</SelectLabel>
                    <SelectItem value="contract">Employment Contract</SelectItem>
                    <SelectItem value="offer_letter">Offer Letter</SelectItem>
                    <SelectItem value="noc">NOC Letter</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Expiry Date (if applicable)</Label>
            <Input type="date" />
          </div>

          <div className="space-y-1.5">
            <Label>Document File</Label>
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
          <Button onClick={handleSave} leftIcon={<Upload className="h-3.5 w-3.5" />}>Upload Document</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const columns: ColumnDef<Document>[] = [
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
    cell: ({ getValue }) => <span className="text-sm">{getValue() as string || '—'}</span>,
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
    cell: () => (
      <div className="flex items-center gap-1">
        <Button size="icon-sm" variant="ghost"><Eye className="h-3.5 w-3.5" /></Button>
        <Button size="icon-sm" variant="ghost"><Download className="h-3.5 w-3.5" /></Button>
      </div>
    ),
    size: 70,
  },
]

export function DocumentsPage() {
  const [uploadOpen, setUploadOpen] = useState(false)
  const { data: docsData } = useDocuments({ limit: 100 })
  const documents: Document[] = (docsData?.data as Document[]) ?? []
  const expiring = documents.filter((d: any) => d.status === 'expiring_soon').length
  const expired = documents.filter((d: any) => d.status === 'expired').length

  return (
    <PageWrapper>
      <PageHeader
        title="Document Centre"
        description="Manage and track all company documents"
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
        <KpiCardCompact label="Total Documents" value={documents.length} icon={FileText} color="blue" />
        <KpiCardCompact label="Valid" value={documents.filter((d: any) => d.status === 'valid').length} icon={CheckCircle2} color="green" />
        <KpiCardCompact label="Expiring Soon" value={expiring} icon={AlertTriangle} color="amber" />
        <KpiCardCompact label="Under Review" value={documents.filter((d: any) => d.status === 'under_review').length} icon={Clock} color="purple" />
      </div>

      <Card className="p-5">
        <DataTable
          columns={columns}
          data={documents}
          searchKey="docType"
          searchPlaceholder="Search documents..."
          pageSize={8}
          enableSelection
          getRowId={(row: any) => String(row.id)}
          toolbar={
            <Button variant="outline" size="sm">Bulk Upload</Button>
          }
          bulkActions={(selected) => (
            <>
              <Button variant="outline" size="sm" leftIcon={<Download className="h-3.5 w-3.5" />}
                onClick={() => toast.success(`Downloading ${selected.length} documents`)}>
                Download
              </Button>
              <Button variant="destructive" size="sm" leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                onClick={() => toast.warning(`${selected.length} documents archived`)}>
                Archive
              </Button>
            </>
          )}
        />
      </Card>
      <UploadDocumentDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </PageWrapper>
  )
}
