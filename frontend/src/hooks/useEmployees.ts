import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
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
    const query = new URLSearchParams()
    if (params.search) query.set('search', params.search)
    if (params.status) query.set('status', params.status)
    if (params.department) query.set('department', params.department)
    query.set('limit', String(params.limit ?? 20))
    query.set('offset', String(params.offset ?? 0))

    return useQuery({
        queryKey: ['employees', params],
        queryFn: () => api.get<PaginatedResult<Employee>>(`/employees?${query}`),
    })
}

export function useInfiniteEmployees(params: Omit<ListParams, 'offset'> = {}) {
    return useInfiniteQuery({
        queryKey: ['employees', 'infinite', params],
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
    return useQuery({
        queryKey: ['employees', id],
        queryFn: () => api.get<{ data: Employee }>(`/employees/${id}`).then(r => r.data),
        enabled: !!id,
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
