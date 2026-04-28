import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import type { Employee } from '@/types'

interface ListParams {
    search?: string
    status?: string
    department?: string
    limit?: number
    offset?: number
}

interface PaginatedResult<T> {
    data: T[]
    total: number
    limit: number
    offset: number
    hasMore: boolean
    nextCursor?: string
}

export function useEmployees(params: ListParams = {}) {
    const tenantId = useAuthStore(s => s.tenant?.id)
    const { search, status, department, limit = 20, offset = 0 } = params
    const query = new URLSearchParams()
    if (search) query.set('search', search)
    if (status) query.set('status', status)
    if (department) query.set('department', department)
    query.set('limit', String(limit))
    query.set('offset', String(offset))

    return useQuery({
        queryKey: ['employees', tenantId, search, status, department, limit, offset],
        queryFn: () => api.get<PaginatedResult<Employee>>(`/employees?${query}`),
        enabled: !!tenantId,
        staleTime: 30_000,
    })
}

export function useInfiniteEmployees(params: Omit<ListParams, 'offset'> = {}) {
    const tenantId = useAuthStore(s => s.tenant?.id)
    return useInfiniteQuery({
        queryKey: ['employees', tenantId, 'infinite', params],
        queryFn: ({ pageParam }) => {
            const query = new URLSearchParams()
            if (params.search) query.set('search', params.search)
            if (params.status) query.set('status', params.status)
            if (params.department) query.set('department', params.department)
            query.set('limit', String(params.limit ?? 20))
            if (pageParam) query.set('after', pageParam as string)
            return api.get<PaginatedResult<Employee>>(`/employees?${query}`)
        },
        getNextPageParam: (last) => last.nextCursor ?? undefined,
        initialPageParam: undefined as string | undefined,
    })
}

export function useEmployee(id: string) {
    const tenantId = useAuthStore(s => s.tenant?.id)
    return useQuery({
        queryKey: ['employees', tenantId, id],
        queryFn: () => api.get<{ data: Employee }>(`/employees/${id}`).then(r => r.data),
        enabled: !!id && !!tenantId,
    })
}

export function useCreateEmployee() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: Partial<Employee>) => api.post<{ data: Employee }>('/employees', data).then(r => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['employees'] })
            qc.invalidateQueries({ queryKey: ['org-chart'] })
        },
    })
}

export function useUpdateEmployee(id: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: Partial<Employee>) => api.patch<{ data: Employee }>(`/employees/${id}`, data).then(r => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['employees'] })
            qc.invalidateQueries({ queryKey: ['employees', id] })
            qc.invalidateQueries({ queryKey: ['org-chart'] })
        },
    })
}

export function useArchiveEmployee() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.delete(`/employees/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['employees'] }),
    })
}

export interface SalaryRevision {
    id: string
    employeeId: string
    effectiveDate: string
    revisionType: 'increment' | 'decrement' | 'promotion' | 'annual_review' | 'probation_completion' | 'correction'
    previousBasicSalary: string | null
    newBasicSalary: string
    previousTotalSalary: string | null
    newTotalSalary: string | null
    reason: string | null
    approvedBy: string | null
    createdAt: string
}

export function useSalaryHistory(employeeId: string) {
    return useQuery({
        queryKey: ['salary-history', employeeId],
        queryFn: () => api.get<{ data: SalaryRevision[] }>(`/employees/${employeeId}/salary-history`).then(r => r.data),
        enabled: !!employeeId,
    })
}

export function useRecordSalaryRevision(employeeId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: {
            effectiveDate: string
            revisionType: string
            newBasicSalary: string | number
            newTotalSalary?: string | number
            reason?: string
        }) => api.post<{ data: SalaryRevision }>(`/employees/${employeeId}/salary-revision`, data).then(r => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['salary-history', employeeId] })
            qc.invalidateQueries({ queryKey: ['employees', employeeId] })
        },
    })
}

export function useUploadEmployeeAvatar(id: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (file: File) => {
            const fd = new FormData()
            fd.append('file', file)
            return api.upload<{ data: { avatarUrl: string } }>(`/employees/${id}/avatar`, fd)
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['employees'] })
            qc.invalidateQueries({ queryKey: ['employees', id] })
        },
    })
}

// ─── Employee Login Account ───────────────────────────────────────────────────

export interface EmployeeAccount {
    hasAccount: boolean
    account: {
        id: string
        email: string
        isActive: boolean
        lastLoginAt: string | null
        createdAt: string
    } | null
}

export function useEmployeeAccount(employeeId: string | undefined) {
    return useQuery({
        queryKey: ['employees', employeeId, 'account'],
        queryFn: () =>
            api.get<{ data: EmployeeAccount }>(`/employees/${employeeId}/account`).then(r => r.data),
        enabled: !!employeeId,
        staleTime: 30_000,
    })
}

export function useInviteEmployee() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ employeeId, email, name }: { employeeId: string; email?: string; name?: string }) =>
            api.post<{ message: string }>(`/employees/${employeeId}/invite`, { email, name }),
        onSuccess: (_data, variables) => {
            qc.invalidateQueries({ queryKey: ['employees', variables.employeeId, 'account'] })
        },
    })
}

export function useResendInvite() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ employeeId }: { employeeId: string }) =>
            api.post<{ message: string }>(`/employees/${employeeId}/resend-invite`),
        onSuccess: (_data, variables) => {
            qc.invalidateQueries({ queryKey: ['employees', variables.employeeId, 'account'] })
        },
    })
}
