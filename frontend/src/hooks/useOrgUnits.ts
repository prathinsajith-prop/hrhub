import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type OrgUnitType = 'division' | 'department' | 'branch'

export interface OrgUnit {
    id: string
    tenantId: string
    name: string
    code: string | null
    type: OrgUnitType
    parentId: string | null
    headEmployeeId: string | null
    headEmployeeName: string | null
    description: string | null
    isActive: boolean
    sortOrder: number
    createdAt: string
    updatedAt: string
}

export interface OrgUnitNode extends OrgUnit {
    children: OrgUnitNode[]
}

export interface OrgUnitInput {
    name: string
    code?: string
    type: OrgUnitType
    parentId?: string | null
    headEmployeeId?: string | null
    description?: string
    isActive?: boolean
    sortOrder?: number
}

export function useOrgUnits() {
    return useQuery({
        queryKey: ['org-units'],
        queryFn: () => api.get<{ data: OrgUnit[] }>('/org-units').then(r => r.data ?? []),
    })
}

export function useOrgUnitTree() {
    return useQuery({
        queryKey: ['org-units', 'tree'],
        queryFn: () => api.get<{ data: OrgUnitNode[] }>('/org-units/tree').then(r => r.data ?? []),
    })
}

export function useOrgUnitStats() {
    return useQuery({
        queryKey: ['org-units', 'stats'],
        queryFn: () => api.get<{ data: { divisions: number; departments: number; branches: number } }>('/org-units/stats').then(r => r.data),
    })
}

export function useCreateOrgUnit() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: OrgUnitInput) => api.post<{ data: OrgUnit }>('/org-units', data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['org-units'] }),
    })
}

export function useUpdateOrgUnit() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<OrgUnitInput> }) =>
            api.patch<{ data: OrgUnit }>(`/org-units/${id}`, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['org-units'] }),
    })
}

export function useDeleteOrgUnit() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.delete(`/org-units/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['org-units'] }),
    })
}
