import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Dependent {
    id: string
    employeeId: string
    reference: string
    name: string
    birthDate: string | null
    relation: 'spouse' | 'child' | 'parent' | 'sibling' | 'other'
    nationality: string | null
    visaNumber: string | null
    medicalInsurance: string | null
    createdByName: string | null
    createdAt: string
    updatedAt: string
}

export interface EmployeeNote {
    id: string
    employeeId: string
    content: string
    createdByName: string | null
    createdAt: string
}

// ─── Dependents ───────────────────────────────────────────────────────────────

export function useDependents(employeeId: string) {
    const tenantId = useAuthStore(s => s.tenant?.id)
    return useQuery({
        queryKey: ['employee-dependents', tenantId, employeeId],
        queryFn: () => api.get<{ data: Dependent[] }>(`/employees/${employeeId}/dependents`).then(r => r.data),
        enabled: !!employeeId && !!tenantId,
        staleTime: 30_000,
    })
}

export function useCreateDependent(employeeId: string) {
    const tenantId = useAuthStore(s => s.tenant?.id)
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: Omit<Dependent, 'id' | 'employeeId' | 'reference' | 'createdByName' | 'createdAt' | 'updatedAt'>) =>
            api.post<{ data: Dependent }>(`/employees/${employeeId}/dependents`, data).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-dependents', tenantId, employeeId] }),
    })
}

export function useUpdateDependent(employeeId: string) {
    const tenantId = useAuthStore(s => s.tenant?.id)
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, ...data }: Partial<Dependent> & { id: string }) =>
            api.patch<{ data: Dependent }>(`/employees/${employeeId}/dependents/${id}`, data).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-dependents', tenantId, employeeId] }),
    })
}

export function useDeleteDependent(employeeId: string) {
    const tenantId = useAuthStore(s => s.tenant?.id)
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.delete(`/employees/${employeeId}/dependents/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-dependents', tenantId, employeeId] }),
    })
}

// ─── Notes ────────────────────────────────────────────────────────────────────

export function useEmployeeNotes(employeeId: string) {
    const tenantId = useAuthStore(s => s.tenant?.id)
    return useQuery({
        queryKey: ['employee-notes', tenantId, employeeId],
        queryFn: () => api.get<{ data: EmployeeNote[] }>(`/employees/${employeeId}/notes`).then(r => r.data),
        enabled: !!employeeId && !!tenantId,
        staleTime: 30_000,
    })
}

export function useAddEmployeeNote(employeeId: string) {
    const tenantId = useAuthStore(s => s.tenant?.id)
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (content: string) =>
            api.post<{ data: EmployeeNote }>(`/employees/${employeeId}/notes`, { content }).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-notes', tenantId, employeeId] }),
    })
}

export function useDeleteEmployeeNote(employeeId: string) {
    const tenantId = useAuthStore(s => s.tenant?.id)
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (noteId: string) => api.delete(`/employees/${employeeId}/notes/${noteId}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-notes', tenantId, employeeId] }),
    })
}
