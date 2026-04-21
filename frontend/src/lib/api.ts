/**
 * Typed API client — attaches JWT, handles 401 token refresh, consistent error shape.
 */
import { useAuthStore } from '@/store/authStore'

const BASE = '/api/v1'

export class ApiError extends Error {
    statusCode: number
    data?: unknown
    constructor(statusCode: number, message: string, data?: unknown) {
        super(message)
        this.statusCode = statusCode
        this.data = data
        this.name = 'ApiError'
    }
}

async function request<T>(
    path: string,
    init: RequestInit = {},
    retry = true,
): Promise<T> {
    const { accessToken, refreshTokens } = useAuthStore.getState() as {
        accessToken: string | null
        refreshTokens: () => Promise<boolean>
    }

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(init.headers as Record<string, string>),
    }

    if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`
    }

    const res = await fetch(`${BASE}${path}`, { ...init, headers })

    if (res.status === 401 && retry) {
        // Try to refresh the token once
        const ok = await refreshTokens()
        if (ok) return request<T>(path, init, false)
        useAuthStore.getState().logout()
        throw new ApiError(401, 'Session expired')
    }

    if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new ApiError(res.status, body?.message ?? res.statusText, body)
    }

    if (res.status === 204) return undefined as T
    return res.json() as Promise<T>
}

export const api = {
    get: <T>(path: string) => request<T>(path, { method: 'GET' }),
    post: <T>(path: string, body?: unknown) =>
        request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
    patch: <T>(path: string, body?: unknown) =>
        request<T>(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }),
    delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
    upload: <T>(path: string, formData: FormData) => {
        // Do NOT set Content-Type — browser must set it with the multipart boundary
        const { accessToken } = useAuthStore.getState() as { accessToken: string | null }
        const headers: Record<string, string> = {}
        if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`
        return fetch(`${BASE}${path}`, { method: 'POST', body: formData, headers }).then(async (res) => {
            if (!res.ok) {
                const body = await res.json().catch(() => ({}))
                throw new ApiError(res.status, body?.message ?? res.statusText, body)
            }
            return res.json() as Promise<T>
        })
    },
}
