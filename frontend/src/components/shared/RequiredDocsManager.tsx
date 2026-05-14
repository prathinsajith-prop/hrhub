import { useState } from 'react'
import { FileText, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/form-controls'
import { ConfirmDialog, toast } from '@/components/ui/overlays'
import { DOC_TYPE_CATALOG, CATEGORY_LABELS, type DocCategory } from '@/lib/docTypes'
import type { StepRequiredDoc } from '@/hooks/useOnboarding'

/**
 * Shared required-docs editor. Renders the list + inline add form + per-row
 * delete affordance. Used by:
 *   - OnboardingDetailPage (per-employee instance steps)
 *   - OnboardingTemplateTab (per-tenant template steps)
 *
 * Presentational: the parent injects the data and the add/delete callbacks,
 * which decide which API to hit. That keeps this component free of any
 * coupling to either the instance- or template-level routes.
 */

export interface RequiredDocsManagerProps {
    requiredDocs: StepRequiredDoc[]
    isLoading?: boolean
    isAdding?: boolean
    isDeleting?: boolean
    /** Returns a promise that resolves when the add succeeded. */
    onAdd: (input: { category: DocCategory; docType: string; isMandatory: boolean; expiryRequired: boolean }) => Promise<void>
    /** Returns a promise that resolves when the delete succeeded. */
    onDelete: (id: string) => Promise<void>
    /** Optional shorter empty-state hint. */
    emptyHint?: string
}

export function RequiredDocsManager({
    requiredDocs,
    isLoading = false,
    isAdding = false,
    isDeleting = false,
    onAdd,
    onDelete,
    emptyHint = 'No required documents configured yet.',
}: RequiredDocsManagerProps) {
    const [addOpen, setAddOpen] = useState(false)
    const [category, setCategory] = useState<DocCategory | ''>('')
    const [docType, setDocType] = useState('')
    const [isMandatory, setIsMandatory] = useState(true)
    const [expiryRequired, setExpiryRequired] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState<StepRequiredDoc | null>(null)

    const categoryDocs = category ? DOC_TYPE_CATALOG[category] : []

    function resetForm() {
        setCategory('')
        setDocType('')
        setIsMandatory(true)
        setExpiryRequired(false)
    }

    async function handleAdd() {
        if (!category || !docType) {
            toast.warning('Incomplete', 'Select a category and document type.')
            return
        }
        try {
            await onAdd({ category, docType, isMandatory, expiryRequired })
            toast.success('Required doc added', `${docType} added.`)
            setAddOpen(false)
            resetForm()
        } catch {
            // Error toast is shown by the global MutationCache with the
            // actual server message — don't double-up here.
        }
    }

    async function handleDelete(doc: StepRequiredDoc) {
        try {
            await onDelete(doc.id)
            toast.success('Removed', `${doc.docType} removed.`)
            setConfirmDelete(null)
        } catch {
            // See handleAdd — global MutationCache handles the error toast.
        }
    }

    return (
        <div className="space-y-4">
            {isLoading ? (
                <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}</div>
            ) : requiredDocs.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2 text-center">{emptyHint}</p>
            ) : (
                <div className="space-y-1.5">
                    {requiredDocs.map((doc) => (
                        <div key={doc.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-card">
                            <FileText className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold truncate">{doc.docType}</p>
                                <p className="text-[10px] text-muted-foreground truncate">
                                    {CATEGORY_LABELS[doc.category as DocCategory] ?? doc.category}
                                    {doc.isMandatory ? ' · Mandatory' : ' · Optional'}
                                    {doc.expiryRequired ? ' · Expiry required' : ''}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setConfirmDelete(doc)}
                                className="p-1 rounded hover:bg-destructive/10 text-destructive shrink-0 disabled:opacity-50"
                                aria-label="Remove"
                                disabled={isDeleting}
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {addOpen ? (
                <div className="border rounded-xl p-3.5 space-y-3 bg-muted/30">
                    <p className="text-xs font-semibold">Add required document</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="space-y-1">
                            <label className="text-[11px] font-medium text-muted-foreground">Category *</label>
                            <Select
                                value={category || undefined}
                                onValueChange={(v) => { setCategory(v as DocCategory); setDocType('') }}
                            >
                                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
                                <SelectContent>
                                    {(Object.entries(CATEGORY_LABELS) as [DocCategory, string][]).map(([k, l]) => (
                                        <SelectItem key={k} value={k} className="text-xs">{l}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[11px] font-medium text-muted-foreground">Document type *</label>
                            <Select value={docType || undefined} onValueChange={setDocType} disabled={!category}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
                                <SelectContent>
                                    {categoryDocs.map(d => (
                                        <SelectItem key={d.docType} value={d.docType} className="text-xs">{d.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                            <input
                                type="checkbox"
                                checked={isMandatory}
                                onChange={(e) => setIsMandatory(e.target.checked)}
                                className="rounded"
                            />
                            Mandatory
                        </label>
                        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                            <input
                                type="checkbox"
                                checked={expiryRequired}
                                onChange={(e) => setExpiryRequired(e.target.checked)}
                                className="rounded"
                            />
                            Expiry required
                        </label>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button size="sm" loading={isAdding} onClick={handleAdd}>Add</Button>
                        <Button size="sm" variant="ghost" onClick={() => { setAddOpen(false); resetForm() }}>Cancel</Button>
                    </div>
                </div>
            ) : (
                <Button size="sm" variant="outline" leftIcon={<Plus className="h-3 w-3" />} onClick={() => setAddOpen(true)}>
                    Add required document
                </Button>
            )}

            <ConfirmDialog
                open={!!confirmDelete}
                onOpenChange={(o) => { if (!o) setConfirmDelete(null) }}
                title="Remove required document?"
                description={`Remove "${confirmDelete?.docType}" from required docs?`}
                confirmLabel="Remove"
                variant="destructive"
                onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
            />
        </div>
    )
}
