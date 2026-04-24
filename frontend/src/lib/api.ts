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

/**
 * Convert an ApiError with Zod validation issues into a flat field → message map.
 * Returns {} if the error has no field-level info.
 */
export function apiErrorToFieldMap(err: unknown): Record<string, string> {
    if (!(err instanceof ApiError)) return {}
    const data = err.data as { validationErrors?: Array<{ path?: (string | number)[]; message?: string }> } | undefined
    const issues = data?.validationErrors
    if (!Array.isArray(issues)) return {}
    const out: Record<string, string> = {}
    for (const i of issues) {
        const key = Array.isArray(i.path) && i.path.length > 0 ? i.path.join('.') : '_form'
        if (!out[key] && i.message) out[key] = i.message
    }
    return out
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
        ...(init.headers as Record<string, string>),
    }

    // Only set JSON Content-Type when actually sending a body — Fastify rejects
    // empty-body requests that declare application/json (e.g. DELETE without body).
    if (init.body != null && !headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json'
    }

    if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`
    }

    // Bypass the browser HTTP cache so server-side ETag/304 responses
    // never leave the JS layer with an empty body. React Query handles
    // caching for us at the application level.
    const res = await fetch(`${BASE}${path}`, { cache: 'no-store', ...init, headers })

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
    // 304 with no-store means Chrome still sent If-None-Match but we have no cached body —
    // throw so React Query retains the previous query data instead of replacing it with undefined.
    if (res.status === 304) throw new ApiError(304, 'Not Modified')
    return res.json() as Promise<T>
}

export const api = {
    get: <T>(path: string) => request<T>(path, { method: 'GET' }),
    post: <T>(path: string, body?: unknown) =>
        request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
    patch: <T>(path: string, body?: unknown) =>
        request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
    put: <T>(path: string, body?: unknown) =>
        request<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
    delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
    upload: async <T>(path: string, formData: FormData, retry = true): Promise<T> => {
        // Do NOT set Content-Type — browser must set it with the multipart boundary
        const { accessToken, refreshTokens } = useAuthStore.getState() as {
            accessToken: string | null
            refreshTokens: () => Promise<boolean>
        }
        const headers: Record<string, string> = {}
        if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`
        const res = await fetch(`${BASE}${path}`, { method: 'POST', body: formData, headers, cache: 'no-store' })
        if (res.status === 401 && retry) {
            const ok = await refreshTokens()
            if (ok) return api.upload<T>(path, formData, false)
            useAuthStore.getState().logout()
            throw new ApiError(401, 'Session expired')
        }
        if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            throw new ApiError(res.status, (body as any)?.message ?? res.statusText, body)
        }
        if (res.status === 204) return undefined as T
        return res.json() as Promise<T>
    },
}
