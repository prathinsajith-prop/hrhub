import { describe, it, expect, vi } from 'vitest'
import { generateETag, sendWithETag } from '../lib/etag.js'

describe('generateETag', () => {
    it('produces a deterministic, quoted, 16-hex-char tag', () => {
        const tag = generateETag({ a: 1 })
        expect(tag).toMatch(/^"[0-9a-f]{16}"$/)
    })

    it('returns the same etag for identical bodies', () => {
        const a = generateETag({ data: [1, 2, 3], total: 3 })
        const b = generateETag({ data: [1, 2, 3], total: 3 })
        expect(a).toBe(b)
    })

    it('returns different etags for different bodies', () => {
        expect(generateETag({ a: 1 })).not.toBe(generateETag({ a: 2 }))
    })

    it('handles arrays, nulls and nested objects', () => {
        expect(generateETag([])).toMatch(/^"[0-9a-f]{16}"$/)
        expect(generateETag(null)).toMatch(/^"[0-9a-f]{16}"$/)
        expect(generateETag({ x: { y: { z: 1 } } })).toMatch(/^"[0-9a-f]{16}"$/)
    })
})

function makeReply() {
    const headers: Record<string, string> = {}
    const reply = {
        statusCode: 200,
        body: undefined as unknown,
        header: vi.fn((k: string, v: string) => { headers[k] = v; return reply }),
        code: vi.fn((c: number) => { reply.statusCode = c; return reply }),
        send: vi.fn((b?: unknown) => { reply.body = b; return reply }),
        _headers: headers,
    }
    return reply
}

describe('sendWithETag', () => {
    it('sets ETag and Cache-Control headers and sends body on cache miss', () => {
        const reply = makeReply()
        const request = { headers: {} as Record<string, string> }
        const body = { data: [{ id: 1 }] }

        const result = sendWithETag(reply, request, body)

        expect(reply.header).toHaveBeenCalledWith('ETag', expect.stringMatching(/^"[0-9a-f]{16}"$/))
        expect(reply.header).toHaveBeenCalledWith('Cache-Control', 'private, no-cache')
        expect(reply.send).toHaveBeenCalledWith(body)
        expect(reply.code).not.toHaveBeenCalled()
        // Returned value MUST be the reply (not undefined) — protects against
        // the @fastify/compress empty-gzip-body race condition.
        expect(result).toBe(reply)
    })

    it('returns 304 with empty body when If-None-Match matches', () => {
        const body = { data: [{ id: 1 }] }
        const etag = generateETag(body)
        const reply = makeReply()
        const request = { headers: { 'if-none-match': etag } }

        const result = sendWithETag(reply, request, body)

        expect(reply.code).toHaveBeenCalledWith(304)
        expect(reply.send).toHaveBeenCalledWith()
        expect(result).toBe(reply)
    })

    it('returns 200 with body when If-None-Match is stale', () => {
        const reply = makeReply()
        const request = { headers: { 'if-none-match': '"deadbeefdeadbeef"' } }
        const body = { data: [] }

        sendWithETag(reply, request, body)

        expect(reply.code).not.toHaveBeenCalled()
        expect(reply.send).toHaveBeenCalledWith(body)
    })
})
