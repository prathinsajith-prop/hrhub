import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import type { Employee } from '@/types'

export function useMyEmployee() {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    return useQuery({
        queryKey: ['portal', 'me', tenantId],
        queryFn: () => api.get<{ data: Employee }>('/employees/me').then((r) => r.data),
        enabled: !!tenantId,
    })
}

export interface UpdateMyProfileBody {
    phone?: string
    mobileNo?: string
    personalEmail?: string
    emergencyContact?: string
    emergencyContactName?: string
    emergencyContactPhone?: string
    homeCountryAddress?: string
}

export function useUpdateMyProfile() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (body: UpdateMyProfileBody) =>
            api.patch<{ data: Employee }>('/employees/me', body).then((r) => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['portal', 'me'] })
        },
    })
}
