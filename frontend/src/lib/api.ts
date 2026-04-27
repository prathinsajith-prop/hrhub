/**
 * Typed API client — attaches JWT, handles 401 token refresh, consistent error shape.
 */
import { useAuthStore } from '@/store/authStore'

// API base URL.
//   • In local dev → defaults to '/api/v1' (proxied by Vite to the backend).
//   • In production (Vercel/Netlify) → set VITE_API_URL at build time, e.g.
//     VITE_API_URL=https://your-backend.up.railway.app/api/v1
// Trailing slashes are stripped so callers can keep using `/auth/login` etc.
const ENV_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '')
const BASE = ENV_BASE && ENV_BASE.length > 0 ? ENV_BASE : '/api/v1'

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

    // Always bypass the browser HTTP cache so we never receive a cached
    // empty-body response. If-None-Match/304 is handled server-side for
    // optimisation; the browser does not need to store anything here.
    const res = await fetch(`${BASE}${path}`, { ...init, headers, cache: 'no-store' })

    if (res.status === 401 && retry) {
        // Try to refresh the token once
        const ok = await refreshTokens()
        if (ok) return request<T>(path, init, false)
        useAuthStore.getState().logout()
        throw new ApiError(401, 'Session expired')
    }

    // Defensive: 304 should never arrive with cache:'no-store', but browser
    // extensions, service workers, or the old cached JS bundle can still
    // inject If-None-Match. Retry once with 'reload' to force a full 200.
    if (res.status === 304) {
        const fresh = await fetch(`${BASE}${path}`, { ...init, headers, cache: 'reload' })
        if (fresh.status === 401 && retry) {
            const ok = await refreshTokens()
            if (ok) return request<T>(path, init, false)
            useAuthStore.getState().logout()
            throw new ApiError(401, 'Session expired')
        }
        if (!fresh.ok) {
            const errText = await fresh.text().catch(() => '')
            let errBody: Record<string, unknown> = {}
            try { errBody = errText ? JSON.parse(errText) : {} } catch { /* ignore */ }
            throw new ApiError(fresh.status, (errBody as { message?: string })?.message ?? fresh.statusText, errBody)
        }
        if (fresh.status === 204) return undefined as T
        const freshText = await fresh.text()
        return (freshText ? JSON.parse(freshText) : undefined) as T
    }

    if (!res.ok) {
        const errText = await res.text().catch(() => '')
        let errBody: Record<string, unknown> = {}
        try { errBody = errText ? JSON.parse(errText) : {} } catch { /* ignore */ }
        throw new ApiError(res.status, (errBody as { message?: string })?.message ?? res.statusText, errBody)
    }

    if (res.status === 204) return undefined as T

    // Use text() → JSON.parse so an empty body produces a clear error message
    // instead of the cryptic "Unexpected end of JSON input".
    const text = await res.text()
    if (!text || text.trim() === '') {
        throw new ApiError(res.status, `Empty response from ${path}`)
    }
    try {
        return JSON.parse(text) as T
    } catch (e) {
        throw new ApiError(res.status, `Invalid JSON from ${path}: ${(e as Error).message}`)
    }
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
            throw new ApiError(res.status, (body as { message?: string })?.message ?? res.statusText, body)
        }
        if (res.status === 204) return undefined as T
        return res.json() as Promise<T>
    },
}
