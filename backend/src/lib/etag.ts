import { createHash } from 'node:crypto'

/**
 * Generate a strong ETag from a JSON-serialisable response body.
 * Uses the first 16 hex chars of a SHA-1 digest — collision-resistant enough
 * for cache validation without the overhead of SHA-256.
 */
export function generateETag(body: unknown): string {
    return '"' + createHash('sha1').update(JSON.stringify(body)).digest('hex').slice(0, 16) + '"'
}

/**
 * Set ETag + Cache-Control headers and return 304 Not Modified when the
 * client's If-None-Match matches.  Otherwise send the body normally.
 *
 * IMPORTANT: returns the reply so async handlers can `return sendWithETag(...)`.
 * Without this, Fastify's async reply pipeline races with @fastify/compress
 * and emits an empty gzipped body (content-encoding: gzip, content-length: 0).
 *
 * Usage (in a Fastify route):
 *   return sendWithETag(reply, request, result)
 */
export function sendWithETag(reply: any, request: any, body: unknown): any {
    const etag = generateETag(body)
    reply.header('ETag', etag)
    reply.header('Cache-Control', 'private, no-cache')
    if (request.headers['if-none-match'] === etag) {
        return reply.code(304).send()
    }
    return reply.send(body)
}
