/**
 * Typed Fastify instance alias.
 *
 * Import `type AppInstance` instead of using `any` in every route file.
 * This ensures full type inference for authenticate, requireRole, jwt, log, etc.
 *
 * Usage:
 *   export default async function routes(app: AppInstance) { ... }
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AppInstance = import('fastify').FastifyInstance<any, any, any, any, any>
