/**
 * Tests for the dual-auth preHandler that fronts
 * POST /api/v1/attendance/external-punch.
 *
 * Two halves:
 *   1. `ipInList`           — pure helper, exercised in isolation.
 *   2. `buildAppOrJwtAuth`  — exercised with a mocked DB module so we don't
 *      need a real Postgres for the cases that matter: invalid key, revoked
 *      app, wrong secret, missing scope, IP-allowlist deny, and the happy
 *      path (request.appCtx attached, downstream handler can proceed).
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import bcrypt from 'bcrypt'

beforeAll(() => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'ci-test-secret-at-least-32-characters-long'
})

// ── DB mock: every db.select().from().where().limit() chain returns whatever
//    rows we set on the singleton state below. db.update() is a noop.
type AppRow = {
    id: string
    tenantId: string
    name: string
    appKey: string
    secretHash: string
    scopes: string[]
    ipAllowlist: string[]
    status: 'active' | 'revoked'
    createdBy: string | null
}

const state: { app: AppRow | null } = { app: null }

vi.mock('../db/index.js', () => {
    const chain = {
        from: () => chain,
        where: () => chain,
        limit: () => Promise.resolve(state.app ? [state.app] : []),
        set: () => chain,
        catch: () => Promise.resolve(),
    }
    return {
        db: {
            select: () => chain,
            update: () => ({
                set: () => ({
                    where: () => ({ catch: () => Promise.resolve() }),
                }),
            }),
        },
    }
})

// Schema import is required by the auth module but we never read the columns
// in the mock above, so an empty object is fine.
vi.mock('../db/schema/index.js', () => ({
    connectedApps: {},
}))

const { buildAppOrJwtAuth, ipInList } = await import('../modules/attendance/external-auth.js')

// ── Test doubles for Fastify request/reply ───────────────────────────────────

interface FakeReply {
    code: (n: number) => FakeReply
    send: (body: unknown) => FakeReply
    _status: number | null
    _body: unknown
}
function makeReply(): FakeReply {
    const r: FakeReply = {
        _status: null,
        _body: null,
        code(n) { this._status = n; return this },
        send(body) { this._body = body; return this },
    }
    return r
}

interface FakeRequest {
    headers: Record<string, string | undefined>
    ip: string
    user?: unknown
    appCtx?: unknown
}
function makeReq(headers: Record<string, string | undefined>, ip = '203.0.113.7'): FakeRequest {
    return { headers, ip }
}

// Stub fastify with just the authenticate hook the preHandler may delegate to.
const fakeFastify = {
    authenticate: vi.fn(async (_req: FakeRequest, reply: FakeReply) => {
        reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'No JWT' })
    }),
}

const SECRET = 'sk_24-byte-vendor-secret-1234567890ab'
const APP_BASE: AppRow = {
    id: 'app-uuid',
    tenantId: 'tenant-1',
    name: 'Reception clock',
    appKey: 'app_live_abc123',
    secretHash: '',
    scopes: ['attendance:write'],
    ipAllowlist: [],
    status: 'active',
    createdBy: 'user-1',
}

beforeEach(async () => {
    fakeFastify.authenticate.mockClear()
    state.app = { ...APP_BASE, secretHash: await bcrypt.hash(SECRET, 4) }
})

// ── ipInList ────────────────────────────────────────────────────────────────

describe('ipInList', () => {
    it('matches exact IPs', () => {
        expect(ipInList('1.2.3.4', ['1.2.3.4'])).toBe(true)
        expect(ipInList('1.2.3.4', ['9.9.9.9'])).toBe(false)
    })

    it('matches /24 CIDR', () => {
        expect(ipInList('10.0.5.99', ['10.0.5.0/24'])).toBe(true)
        expect(ipInList('10.0.6.99', ['10.0.5.0/24'])).toBe(false)
    })

    it('matches /16 CIDR', () => {
        expect(ipInList('10.0.99.5', ['10.0.0.0/16'])).toBe(true)
        expect(ipInList('10.1.99.5', ['10.0.0.0/16'])).toBe(false)
    })

    it('returns false on empty list', () => {
        expect(ipInList('1.2.3.4', [])).toBe(false)
    })
})

// ── buildAppOrJwtAuth ───────────────────────────────────────────────────────

describe('buildAppOrJwtAuth', () => {
    it('falls through to JWT when no X-App-Key header is present', async () => {
        const preHandler = buildAppOrJwtAuth(fakeFastify, 'attendance:write')
        const req = makeReq({})
        const reply = makeReply()
        await preHandler(req, reply)
        expect(fakeFastify.authenticate).toHaveBeenCalledOnce()
        expect(req.appCtx).toBeUndefined()
    })

    it('rejects an X-App-Key that does not start with app_', async () => {
        const preHandler = buildAppOrJwtAuth(fakeFastify, 'attendance:write')
        const req = makeReq({ 'x-app-key': 'wrong_prefix_abc' })
        const reply = makeReply()
        await preHandler(req, reply)
        expect(reply._status).toBe(401)
        expect((reply._body as { message: string }).message).toMatch(/app_live_/)
    })

    it('rejects when no secret is supplied', async () => {
        const preHandler = buildAppOrJwtAuth(fakeFastify, 'attendance:write')
        const req = makeReq({ 'x-app-key': 'app_live_abc123' })
        const reply = makeReply()
        await preHandler(req, reply)
        expect(reply._status).toBe(401)
        expect((reply._body as { message: string }).message).toMatch(/secret/i)
    })

    it('rejects an unknown app key', async () => {
        state.app = null
        const preHandler = buildAppOrJwtAuth(fakeFastify, 'attendance:write')
        const req = makeReq({ 'x-app-key': 'app_live_missing', 'x-api-secret': SECRET })
        const reply = makeReply()
        await preHandler(req, reply)
        expect(reply._status).toBe(401)
        expect((reply._body as { message: string }).message).toBe('Invalid app key')
    })

    it('rejects a revoked app with 403', async () => {
        state.app = { ...state.app!, status: 'revoked' }
        const preHandler = buildAppOrJwtAuth(fakeFastify, 'attendance:write')
        const req = makeReq({ 'x-app-key': 'app_live_abc123', 'x-api-secret': SECRET })
        const reply = makeReply()
        await preHandler(req, reply)
        expect(reply._status).toBe(403)
        expect((reply._body as { message: string }).message).toMatch(/revoked/)
    })

    it('rejects a wrong secret with 401', async () => {
        const preHandler = buildAppOrJwtAuth(fakeFastify, 'attendance:write')
        const req = makeReq({ 'x-app-key': 'app_live_abc123', 'x-api-secret': 'sk_wrong' })
        const reply = makeReply()
        await preHandler(req, reply)
        expect(reply._status).toBe(401)
        expect((reply._body as { message: string }).message).toBe('Invalid app secret')
    })

    it('rejects an app missing the required scope with 403', async () => {
        state.app = { ...state.app!, scopes: ['employees:read'] }
        const preHandler = buildAppOrJwtAuth(fakeFastify, 'attendance:write')
        const req = makeReq({ 'x-app-key': 'app_live_abc123', 'x-api-secret': SECRET })
        const reply = makeReply()
        await preHandler(req, reply)
        expect(reply._status).toBe(403)
        expect((reply._body as { message: string }).message).toMatch(/'attendance:write'/)
    })

    it('rejects when the request IP is outside the allowlist with 403', async () => {
        state.app = { ...state.app!, ipAllowlist: ['10.0.0.0/24'] }
        const preHandler = buildAppOrJwtAuth(fakeFastify, 'attendance:write')
        const req = makeReq({ 'x-app-key': 'app_live_abc123', 'x-api-secret': SECRET }, '203.0.113.7')
        const reply = makeReply()
        await preHandler(req, reply)
        expect(reply._status).toBe(403)
        expect((reply._body as { message: string }).message).toMatch(/allowlist/)
    })

    it('attaches request.appCtx and request.user on the happy path', async () => {
        const preHandler = buildAppOrJwtAuth(fakeFastify, 'attendance:write')
        const req = makeReq({ 'x-app-key': 'app_live_abc123', 'x-api-secret': SECRET })
        const reply = makeReply()
        await preHandler(req, reply)
        expect(reply._status).toBeNull() // never replied
        expect(req.appCtx).toEqual({
            appId: 'app-uuid',
            tenantId: 'tenant-1',
            name: 'Reception clock',
            scopes: ['attendance:write'],
        })
        expect((req.user as { tenantId: string }).tenantId).toBe('tenant-1')
    })

    it('also accepts Authorization: Bearer sk_… as the secret carrier', async () => {
        const preHandler = buildAppOrJwtAuth(fakeFastify, 'attendance:write')
        const req = makeReq({ 'x-app-key': 'app_live_abc123', authorization: `Bearer ${SECRET}` })
        const reply = makeReply()
        await preHandler(req, reply)
        expect(reply._status).toBeNull()
        expect((req.appCtx as { appId: string }).appId).toBe('app-uuid')
    })
})
