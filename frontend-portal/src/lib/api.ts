/**
 * Typed API client for the portal — attaches JWT, handles 401 token refresh,
 * consistent error shape. Mirrors frontend/src/lib/api.ts but without the
 * WebSocket (X-Socket-Id) header — the portal does not use WebSockets in v1.
 */
import { useAuthStore } from '@/store/authStore'
import { apiBase as BASE } from '@/lib/apiBase'

export class ApiError extends Error {
    statusCode: number
    data?: unknown
    constructor(statusCode: number, message: string, data?: unknown) {
        super(message)
        this.statusCode = statusCode
        this.data = data
        this.name = 'ApiError'
    }
    get field(): string | undefined {
        return (this.data as { field?: string } | undefined)?.field
    }
}

let _refreshPromise: Promise<boolean> | null = null
function sharedRefresh(): Promise<boolean> {
    if (!_refreshPromise) {
        _refreshPromise = useAuthStore
            .getState()
            .refreshTokens()
            .finally(() => { _refreshPromise = null })
    }
    return _refreshPromise
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
    const { accessToken } = useAuthStore.getState() as { accessToken: string | null }

    const headers: Record<string, string> = { ...(init.headers as Record<string, string>) }
    // For FormData, let the browser set the multipart Content-Type (with boundary).
    const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData
    if (init.body != null && !isFormData && !headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json'
    }
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`
    if (!headers['Pragma']) headers['Pragma'] = 'no-cache'
    if (!headers['Cache-Control']) headers['Cache-Control'] = 'no-cache'

    const res = await fetch(`${BASE}${path}`, { ...init, headers, cache: 'no-store' })

    if (res.status === 401 && retry) {
        const ok = await sharedRefresh()
        if (ok) return request<T>(path, init, false)
        useAuthStore.getState().logout()
        throw new ApiError(401, 'Session expired')
    }

    if (!res.ok) {
        const errText = await res.text().catch(() => '')
        let errBody: Record<string, unknown> = {}
        try { errBody = errText ? JSON.parse(errText) : {} } catch { /* ignore */ }
        throw new ApiError(res.status, (errBody as { message?: string })?.message ?? res.statusText, errBody)
    }

    if (res.status === 204) return undefined as T
    const text = await res.text()
    if (!text || text.trim() === '') return undefined as T
    return JSON.parse(text) as T
}

export const api = {
    get: <T>(path: string) => request<T>(path, { method: 'GET' }),
    post: <T>(path: string, body?: unknown) =>
        request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
    upload: <T>(path: string, formData: FormData) =>
        request<T>(path, { method: 'POST', body: formData }),
    patch: <T>(path: string, body?: unknown) =>
        request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
    put: <T>(path: string, body?: unknown) =>
        request<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
    delete: <T>(path: string, body?: unknown) =>
        request<T>(path, body !== undefined ? { method: 'DELETE', body: JSON.stringify(body) } : { method: 'DELETE' }),
}
