import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'

// Mock the auth store BEFORE importing api.ts so we don't pull in zustand-persist.
type AuthState = {
    accessToken: string | null
    refreshToken: string | null
    refreshTokens: () => Promise<boolean>
    logout: () => void
}
const authState: AuthState = {
    accessToken: null,
    refreshToken: null,
    refreshTokens: vi.fn().mockResolvedValue(false),
    logout: vi.fn(),
}
vi.mock('@/store/authStore', () => ({
    useAuthStore: {
        getState: () => authState,
        setState: (patch: Partial<AuthState>) => Object.assign(authState, patch),
    },
}))

const { ApiError, apiErrorToFieldMap, api } = await import('@/lib/api')

function jsonResponse(status: number, body: unknown, init: ResponseInit = {}): Response {
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
        ...init,
    })
}

function emptyResponse(status: number): Response {
    // 204/304 must be constructed with a null body.
    return new Response(null, { status })
}

function setAuth(patch: Partial<AuthState>) {
    Object.assign(authState, patch)
}

beforeEach(() => {
    vi.restoreAllMocks()
    // Reset auth state to a known baseline for each test.
    Object.assign(authState, {
        accessToken: null,
        refreshToken: null,
        refreshTokens: vi.fn().mockResolvedValue(false),
        logout: vi.fn(),
    })
})

describe('ApiError', () => {
    it('extends Error and exposes statusCode + data', () => {
        const err = new ApiError(422, 'bad', { foo: 'bar' })
        expect(err).toBeInstanceOf(Error)
        expect(err).toBeInstanceOf(ApiError)
        expect(err.name).toBe('ApiError')
        expect(err.statusCode).toBe(422)
        expect(err.message).toBe('bad')
        expect(err.data).toEqual({ foo: 'bar' })
    })
})

describe('apiErrorToFieldMap', () => {
    it('returns {} for non-ApiError input', () => {
        expect(apiErrorToFieldMap(new Error('plain'))).toEqual({})
        expect(apiErrorToFieldMap(null)).toEqual({})
        expect(apiErrorToFieldMap('boom')).toEqual({})
    })

    it('returns {} when ApiError has no validationErrors', () => {
        expect(apiErrorToFieldMap(new ApiError(400, 'x', {}))).toEqual({})
        expect(apiErrorToFieldMap(new ApiError(400, 'x', { validationErrors: 'not-array' }))).toEqual({})
    })

    it('flattens path arrays into dot-separated keys', () => {
        const err = new ApiError(422, 'invalid', {
            validationErrors: [
                { path: ['email'], message: 'required' },
                { path: ['address', 'city'], message: 'too short' },
            ],
        })
        expect(apiErrorToFieldMap(err)).toEqual({
            email: 'required',
            'address.city': 'too short',
        })
    })

    it('uses _form key when path is missing or empty', () => {
        const err = new ApiError(422, 'invalid', {
            validationErrors: [{ message: 'general failure' }],
        })
        expect(apiErrorToFieldMap(err)).toEqual({ _form: 'general failure' })
    })

    it('keeps the FIRST message per field when duplicates exist', () => {
        const err = new ApiError(422, 'invalid', {
            validationErrors: [
                { path: ['email'], message: 'first' },
                { path: ['email'], message: 'second' },
            ],
        })
        expect(apiErrorToFieldMap(err)).toEqual({ email: 'first' })
    })

    it('skips issues with no message', () => {
        const err = new ApiError(422, 'invalid', {
            validationErrors: [{ path: ['email'] }, { path: ['name'], message: 'required' }],
        })
        expect(apiErrorToFieldMap(err)).toEqual({ name: 'required' })
    })
})

describe('api.get / request layer', () => {
    it('returns parsed JSON on 200', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: [1, 2] }))
        vi.stubGlobal('fetch', fetchMock)

        const result = await api.get<{ data: number[] }>('/things')

        expect(result).toEqual({ data: [1, 2] })
        expect(fetchMock).toHaveBeenCalledTimes(1)
        const [url, init] = fetchMock.mock.calls[0]
        expect(url).toContain('/things')
        expect((init as RequestInit).method).toBe('GET')
        expect((init as RequestInit).cache).toBe('no-store')
    })

    it('attaches Authorization header when an access token exists', async () => {
        setAuth({ accessToken: 'tok-123' })
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }))
        vi.stubGlobal('fetch', fetchMock)

        await api.get('/me')

        const init = fetchMock.mock.calls[0][1] as RequestInit
        const headers = init.headers as Record<string, string>
        expect(headers['Authorization']).toBe('Bearer tok-123')
    })

    it('sets Pragma + Cache-Control no-cache request headers', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}))
        vi.stubGlobal('fetch', fetchMock)

        await api.get('/x')

        const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>
        expect(headers['Pragma']).toBe('no-cache')
        expect(headers['Cache-Control']).toBe('no-cache')
    })

    it('returns undefined for 204 No Content', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(emptyResponse(204)))
        const result = await api.delete<undefined>('/things/1')
        expect(result).toBeUndefined()
    })

    it('throws ApiError with parsed body for non-2xx', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(400, { message: 'nope' })))

        await expect(api.get('/bad')).rejects.toMatchObject({
            name: 'ApiError',
            statusCode: 400,
            message: 'nope',
        })
    })

    it('falls back to statusText when error body has no message', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500, statusText: 'Internal Server Error' })))
        await expect(api.get('/boom')).rejects.toMatchObject({ statusCode: 500, message: 'Internal Server Error' })
    })

    it('retries with cache-buster when 200 body is empty (compress race symptom)', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response('', { status: 200 }))
            .mockResolvedValueOnce(jsonResponse(200, { data: [42] }))
        vi.stubGlobal('fetch', fetchMock)

        const result = await api.get<{ data: number[] }>('/leave')

        expect(result).toEqual({ data: [42] })
        expect(fetchMock).toHaveBeenCalledTimes(2)
        // Second call must include the cache-buster param.
        expect((fetchMock.mock.calls[1][0] as string)).toMatch(/[?&]_=\d+/)
    })

    it('throws an empty-response ApiError if the cache-buster retry is also empty', async () => {
        // Each fetch call returns a fresh Response so the body isn't consumed twice.
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('', { status: 200 }))))
        await expect(api.get('/leave')).rejects.toMatchObject({
            statusCode: 200,
            message: expect.stringContaining('Empty response'),
        })
    })

    it('refreshes the token on 401, retries the original request, and shares the refresh promise', async () => {
        const refreshMock = vi.fn().mockResolvedValue(true)
        setAuth({ accessToken: 'old', refreshToken: 'rtok', refreshTokens: refreshMock as unknown as () => Promise<boolean> })

        const fetchMock = vi.fn()
            // First call → 401
            .mockResolvedValueOnce(jsonResponse(401, { message: 'expired' }))
            // Concurrent call → also 401
            .mockResolvedValueOnce(jsonResponse(401, { message: 'expired' }))
            // Retries (after refresh) → 200
            .mockResolvedValueOnce(jsonResponse(200, { data: 'ok-1' }))
            .mockResolvedValueOnce(jsonResponse(200, { data: 'ok-2' }))
        vi.stubGlobal('fetch', fetchMock)

        const [a, b] = await Promise.all([api.get<{ data: string }>('/a'), api.get<{ data: string }>('/b')])

        expect(a.data).toBe('ok-1')
        expect(b.data).toBe('ok-2')
        // Two concurrent 401s must share ONE refresh call.
        expect(refreshMock).toHaveBeenCalledTimes(1)
    })

    it('logs the user out and throws when refresh fails on 401', async () => {
        const logoutMock = vi.fn()
        setAuth({
            accessToken: 'old',
            refreshTokens: vi.fn().mockResolvedValue(false) as unknown as () => Promise<boolean>,
            logout: logoutMock as unknown as () => void,
        })
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { message: 'expired' })))

        await expect(api.get('/private')).rejects.toMatchObject({ statusCode: 401, message: 'Session expired' })
        expect(logoutMock).toHaveBeenCalledTimes(1)
    })
})

describe('api.post / mutations', () => {
    it('serializes body as JSON and sets Content-Type when body is provided', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { data: { id: 1 } }))
        vi.stubGlobal('fetch', fetchMock)

        await api.post('/things', { name: 'x' })

        const init = fetchMock.mock.calls[0][1] as RequestInit
        const headers = init.headers as Record<string, string>
        expect(init.method).toBe('POST')
        expect(headers['Content-Type']).toBe('application/json')
        expect(init.body).toBe(JSON.stringify({ name: 'x' }))
    })

    it('sends an empty JSON object when no body is provided', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}))
        vi.stubGlobal('fetch', fetchMock)

        await api.post('/things')

        const init = fetchMock.mock.calls[0][1] as RequestInit
        expect(init.body).toBe('{}')
    })
})

describe('api.upload', () => {
    it('does NOT set Content-Type so the browser can add the multipart boundary', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: { ok: true } })) as Mock
        vi.stubGlobal('fetch', fetchMock)
        setAuth({ accessToken: 'tok' })

        const fd = new FormData()
        fd.append('file', new Blob(['hi']), 'a.txt')
        await api.upload('/upload', fd)

        const init = fetchMock.mock.calls[0][1] as RequestInit
        const headers = init.headers as Record<string, string>
        expect(headers['Content-Type']).toBeUndefined()
        expect(headers['Authorization']).toBe('Bearer tok')
        expect(init.body).toBe(fd)
    })
})
