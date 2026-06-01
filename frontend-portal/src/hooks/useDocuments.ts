import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { apiBase } from '@/lib/apiBase'
import { useAuthStore } from '@/store/authStore'

export type DocumentCategory =
    | 'identity'
    | 'visa'
    | 'company'
    | 'employment'
    | 'insurance'
    | 'qualification'
    | 'financial'
    | 'compliance'

export type DocumentStatus =
    | 'valid'
    | 'expiring_soon'
    | 'expired'
    | 'pending_upload'
    | 'under_review'
    | 'rejected'

export interface MyDocument {
    id: string
    category: DocumentCategory
    docType: string
    fileName: string
    fileSize: number | null
    docNumber: string | null
    issueDate: string | null
    expiryDate: string | null
    notes: string | null
    status: DocumentStatus
    verified: boolean
    verifiedAt: string | null
    rejectionReason: string | null
    createdAt: string
    hasFile: boolean
}

export interface PendingDocument {
    id: string
    category: DocumentCategory
    docType: string
    fileName: string
    fileSize: number | null
    expiryDate: string | null
    notes: string | null
    status: DocumentStatus
    createdAt: string
    hasFile: boolean
    employeeId: string | null
    employeeName: string | null
    employeeNo: string | null
    employeeDepartment: string | null
}

export interface UploadDocumentInput {
    category: DocumentCategory
    docType: string
    file: File
    docNumber?: string
    issueDate?: string
    expiryDate?: string
    notes?: string
}

export function useMyDocuments() {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    return useQuery({
        queryKey: ['portal', 'my-documents', tenantId],
        queryFn: () => api.get<{ data: MyDocument[] }>('/documents/my').then((r) => r.data),
        enabled: !!tenantId,
    })
}

/**
 * Trigger a download for one of the current user's documents. The backend
 * returns a 302 redirect to a presigned S3 URL — `window.location.assign`
 * is the simplest way to invoke the browser's download flow because it
 * follows the redirect AND sends the Authorization header on the initial hop.
 *
 * We can't just put the URL in an <a href>, because we need to send the JWT
 * with the initial request. Instead we fetch the URL and follow the redirect
 * manually so the browser saves the file.
 */
export async function triggerDocumentDownload(id: string): Promise<void> {
    const token = useAuthStore.getState().accessToken
    if (!token) throw new Error('Not signed in')

    // First hop: ask the backend (with Authorization) for the presigned URL.
    // Use redirect: 'manual' so we can read the Location header ourselves.
    const res = await fetch(`${apiBase}/documents/${id}/download`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        redirect: 'follow',
    })

    if (res.ok && res.url) {
        // After fetch follows the 302, `res.url` is the final presigned URL.
        // Navigate to it — the Content-Disposition: attachment header makes
        // the browser save it instead of displaying.
        window.location.assign(res.url)
        return
    }
    const errBody = await res.json().catch(() => ({}))
    throw new Error((errBody as { message?: string })?.message ?? `Download failed (${res.status})`)
}

/**
 * Single-request upload: the file + metadata are sent as multipart/form-data to
 * the backend, which streams the bytes to S3 server-side and creates a
 * `documents` row in `under_review` state. The browser never PUTs to S3
 * directly, so no S3 bucket CORS is required. The backend forces the pending
 * status regardless of what the client sends — an employee cannot mark their
 * own document as `valid`.
 */
export function useUploadMyDocument() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (input: UploadDocumentInput) => {
            const { file, category, docType, docNumber, issueDate, expiryDate, notes } = input
            const fd = new FormData()
            fd.append('file', file)
            fd.append('category', category)
            fd.append('docType', docType)
            if (docNumber) fd.append('docNumber', docNumber)
            if (issueDate) fd.append('issueDate', issueDate)
            if (expiryDate) fd.append('expiryDate', expiryDate)
            if (notes) fd.append('notes', notes)
            return api.upload<{ data: MyDocument }>('/documents/upload', fd)
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['portal', 'my-documents'] }),
    })
}

export function usePendingDocuments() {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    return useQuery({
        queryKey: ['portal', 'pending-documents', tenantId],
        queryFn: () => api.get<{ data: PendingDocument[] }>('/documents/pending').then((r) => r.data),
        enabled: !!tenantId,
    })
}

export function useApproveDocument() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) =>
            api.post<{ data: MyDocument }>(`/documents/${id}/approve`, {}).then((r) => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['portal', 'pending-documents'] })
            qc.invalidateQueries({ queryKey: ['portal', 'my-documents'] })
        },
    })
}

export function useRejectDocument() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, reason }: { id: string; reason: string }) =>
            api.post<{ data: MyDocument }>(`/documents/${id}/reject`, { reason }).then((r) => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['portal', 'pending-documents'] })
            qc.invalidateQueries({ queryKey: ['portal', 'my-documents'] })
        },
    })
}
