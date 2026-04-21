// Global Fastify augmentation — applied to all files in the project
declare module 'fastify' {
    interface FastifyRequest {
        user: import('./index.js').RequestUser
    }
    interface FastifyInstance {
        authenticate: (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>
        requireRole: (...roles: import('./index.js').UserRole[]) => (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>
    }
    interface FastifySchema {
        tags?: string[]
    }
}
