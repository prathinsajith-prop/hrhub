import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface ChangePasswordBody {
    currentPassword: string
    newPassword: string
}

export function useChangePassword() {
    return useMutation({
        mutationFn: (body: ChangePasswordBody) =>
            api.post<{ data: { ok: boolean } }>('/auth/change-password', body),
    })
}
