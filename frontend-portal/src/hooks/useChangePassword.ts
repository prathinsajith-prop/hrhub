import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface ChangePasswordBody {
    currentPassword: string
    newPassword: string
}

export function useChangePassword() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (body: ChangePasswordBody) =>
            api.post<{ data: { ok: boolean } }>('/auth/change-password', body),
        // Drop any cached account-shape data so the next render re-fetches.
        // No specific cache to mutate — invalidate 'me' as a defensive flush.
        onSuccess: () => qc.invalidateQueries({ queryKey: ['portal', 'me'] }),
    })
}
