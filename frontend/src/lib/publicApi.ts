/**
 * Unauthenticated API client for the public careers portal.
 *
 * Deliberately separate from `lib/api.ts`: public pages must never attach a JWT,
 * trigger a token refresh, or call logout() on a 401. This keeps a visitor (or a
 * signed-in user who happens to open a /careers link) fully decoupled from auth
 * state. Same base URL + ApiError shape as the authenticated client.
 */
import { apiBase as BASE } from '@/lib/apiBase'
import { ApiError } from '@/lib/api'

async function parse<T>(res: Response): Promise<T> {
    if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new ApiError(res.status, (body as { message?: string })?.message ?? res.statusText, body)
    }
    if (res.status === 204) return undefined as T
    return res.json() as Promise<T>
}

export const publicApi = {
    get: async <T>(path: string): Promise<T> => {
        const res = await fetch(`${BASE}${path}`, { method: 'GET', cache: 'no-store' })
        return parse<T>(res)
    },
    /** POST multipart/form-data (browser sets the boundary automatically). */
    upload: async <T>(path: string, formData: FormData): Promise<T> => {
        const res = await fetch(`${BASE}${path}`, { method: 'POST', body: formData, cache: 'no-store' })
        return parse<T>(res)
    },
}
