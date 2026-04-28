import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from '@/components/ui/overlays'

interface DocParams { employeeId?: string; category?: string; status?: string; from?: string; to?: string; limit?: number; offset?: number }

function toQS(params: Record<string, string | number | undefined>) {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => v !== undefined && q.set(k, String(v)))
    return q.toString()
}

export function useDocuments(params: DocParams = {}) {
    const { employeeId, category, status, from, to, limit = 20, offset = 0 } = params
    return useQuery({
        queryKey: ['documents', employeeId, category, status, from, to, limit, offset],
        queryFn: () => api.get<{ data: unknown[]; total: number }>(`/documents?${toQS({ employeeId, category, status, from, to, limit, offset })}`),
        staleTime: 30_000,
    })
}

export function useExpiringDocuments(days = 90) {
    return useQuery({
        queryKey: ['documents', 'expiring', days],
        queryFn: () => api.get<{ data: unknown[] }>(`/documents/expiring?days=${days}`).then(r => r.data),
    })
}

export function useCreateDocument() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: unknown) => api.post('/documents', data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
        onError: (err: Error) => toast.error('Failed to create document', err?.message ?? 'Please try again.'),
    })
}

export function useUploadDocument() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (input: { file: File; employeeId?: string; category: string; docType?: string; expiryDate?: string }) => {
            const fd = new FormData()
            fd.append('file', input.file)
            if (input.employeeId) fd.append('employeeId', input.employeeId)
            fd.append('category', input.category)
            if (input.docType) fd.append('docType', input.docType)
            if (input.expiryDate) fd.append('expiryDate', input.expiryDate)
            return api.upload<{ data: unknown }>(`/documents/upload`, fd)
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
        onError: (err: Error) => toast.error('Upload failed', err?.message ?? 'Could not upload document.'),
    })
}

export function useUpdateDocument(id: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: Record<string, unknown>) => api.patch(`/documents/${id}`, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
        onError: (err: Error) => toast.error('Update failed', err?.message ?? 'Could not update document.'),
    })
}

export function useVerifyDocument() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.post(`/documents/${id}/verify`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
        onError: (err: Error) => toast.error('Verification failed', err?.message ?? 'Could not verify document.'),
    })
}

export function useDeleteDocument() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.delete(`/documents/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
        onError: (err: Error) => toast.error('Delete failed', err?.message ?? 'Could not delete document.'),
    })
}

export function useRejectDocument() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (input: { id: string; reason: string }) =>
            api.post(`/documents/${input.id}/reject`, { reason: input.reason }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
        onError: (err: Error) => toast.error('Rejection failed', err?.message ?? 'Could not reject document.'),
    })
}

export interface DocumentAuditEntry {
    id: string
    action: string
    actorId: string | null
    actorLabel: string | null
    details: Record<string, unknown> | null
    ipAddress: string | null
    userAgent: string | null
    createdAt: string
}

export function useDocumentAuditLog(id: string | null | undefined) {
    return useQuery({
        queryKey: ['document-audit', id],
        queryFn: () => api.get<{ data: DocumentAuditEntry[] }>(`/documents/${id}/audit-log`).then(r => r.data),
        enabled: !!id,
    })
}
