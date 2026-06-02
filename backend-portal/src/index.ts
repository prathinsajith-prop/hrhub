import Fastify from 'fastify'
import compress from '@fastify/compress'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import { sql } from 'drizzle-orm'

import { loadEnv } from './env.js'
import { db } from './db/client.js'
import authenticatePlugin from './plugins/authenticate.js'

import authRoutes from './modules/auth/auth.routes.js'
import employeesRoutes from './modules/employees/employees.routes.js'
import payrollRoutes from './modules/payroll/payroll.routes.js'
import leaveRoutes from './modules/leave/leave.routes.js'
import attendanceRoutes from './modules/attendance/attendance.routes.js'
import teamsRoutes from './modules/teams/teams.routes.js'
import notificationsRoutes from './modules/notifications/notifications.routes.js'
import holidaysRoutes from './modules/holidays/holidays.routes.js'
import documentsRoutes from './modules/documents/documents.routes.js'
import assetsRoutes from './modules/assets/assets.routes.js'
import performanceRoutes from './modules/performance/performance.routes.js'
import profileChangesRoutes from './modules/profile-changes/profile-changes.routes.js'
import referralsRoutes from './modules/referrals/referrals.routes.js'
import announcementsRoutes from './modules/announcements/announcements.routes.js'
import recognitionRoutes from './modules/recognition/recognition.routes.js'

async function bootstrap() {
    const env = loadEnv()

    const app: any = (Fastify as any)({
        logger: {
            level: env.LOG_LEVEL ?? (env.NODE_ENV === 'production' ? 'info' : 'info'),
            ...(env.NODE_ENV !== 'production' && {
                transport: { target: 'pino-pretty', options: { colorize: true } },
            }),
        },
        connectionTimeout: 30_000,
        trustProxy: true,
    })

    // ─── Health & root probes — registered BEFORE every other plugin so they're
    // available even if a later plugin throws during startup. They MUST stay
    // dependency-free (no DB, no auth, no async) so Railway's LB always gets a 200.
    // Fastify auto-mounts HEAD for every GET route, so HEAD /health also works.
    app.get('/health', () => ({ status: 'ok', service: 'backend-portal', timestamp: new Date().toISOString() }))
    app.get('/', () => ({ status: 'ok', service: 'backend-portal' }))

    await app.register(helmet, {
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'none'"],
                objectSrc: ["'none'"],
                frameAncestors: ["'none'"],
                imgSrc: ["'self'", 'data:', env.S3_PUBLIC_URL],
                connectSrc: ["'self'"],
            },
        },
    })
    await app.register(rateLimit, { max: 200, timeWindow: '1 minute' })

    // Gzip every response > 1 KB. Cuts JSON payloads by 60-80% on the wire.
    await app.register(compress, { global: true, encodings: ['gzip', 'deflate'], threshold: 1024 })

    app.addHook('onRequest', async (request: any, reply: any) => {
        const reqId = (request.headers['x-request-id'] as string) || crypto.randomUUID()
        reply.header('X-Request-ID', reqId)
        request.requestId = reqId
    })

    await app.register(cors, {
        origin: env.CORS_ORIGINS === '*' ? true : env.CORS_ORIGINS.split(',').map((o) => o.trim()),
        credentials: true,
        methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma'],
    })

    await app.register(jwt, {
        secret: env.JWT_SECRET,
        sign: { expiresIn: env.JWT_EXPIRES_IN as never },
    })

    // Multipart for server-side file uploads (documents stream through the
    // backend → S3, so the browser never PUTs to S3 directly and no S3 bucket
    // CORS is required). 10 MB cap matches the main backend.
    await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } })

    await app.register(authenticatePlugin)

    app.setErrorHandler((error: any, _request: any, reply: any) => {
        const statusCode: number = error.statusCode ?? 500
        const message: string = statusCode >= 500 ? 'Internal server error' : error.message ?? 'Error'
        const name: string = statusCode >= 500 ? 'InternalServerError' : error.name ?? 'Error'

        if (statusCode >= 500) app.log.error(error)
        return reply.code(statusCode).send({
            statusCode,
            error: name,
            message,
            ...(error.validationErrors ? { validationErrors: error.validationErrors } : {}),
        })
    })

    await app.register(authRoutes, { prefix: '/api/v1/auth' })
    await app.register(employeesRoutes, { prefix: '/api/v1/employees' })
    await app.register(payrollRoutes, { prefix: '/api/v1/payroll' })
    await app.register(leaveRoutes, { prefix: '/api/v1/leave' })
    await app.register(attendanceRoutes, { prefix: '/api/v1/attendance' })
    await app.register(teamsRoutes, { prefix: '/api/v1/teams' })
    await app.register(notificationsRoutes, { prefix: '/api/v1/notifications' })
    await app.register(holidaysRoutes, { prefix: '/api/v1/holidays' })
    await app.register(documentsRoutes, { prefix: '/api/v1/documents' })
    await app.register(assetsRoutes, { prefix: '/api/v1/assets' })
    await app.register(performanceRoutes, { prefix: '/api/v1/performance' })
    await app.register(profileChangesRoutes, { prefix: '/api/v1/profile-changes' })
    await app.register(referralsRoutes, { prefix: '/api/v1/referrals' })
    await app.register(announcementsRoutes, { prefix: '/api/v1/announcements' })
    await app.register(recognitionRoutes, { prefix: '/api/v1/recognition' })

    // /health is registered at the top of bootstrap (before plugins) so probes never
    // depend on the rest of the stack. /health/detailed runs DB+S3 round-trips and
    // is only suitable for an SRE-facing dashboard, NOT for the Railway LB probe.
    app.get('/health/detailed', async (_req: any, reply: any) => {
        const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {}
        const dbStart = Date.now()
        try {
            await db.execute(sql`SELECT 1`)
            checks.database = { ok: true, latencyMs: Date.now() - dbStart }
        } catch (e: any) {
            checks.database = { ok: false, error: e.message }
        }
        const allOk = Object.values(checks).every((c) => c.ok)
        return reply.code(allOk ? 200 : 503).send({
            status: allOk ? 'ok' : 'degraded',
            timestamp: new Date().toISOString(),
            checks,
        })
    })

    await app.listen({ port: env.PORT, host: env.HOST })
    app.log.info(`HRHub Portal API listening on ${env.HOST}:${env.PORT}`)
    app.log.info(
        {
            nodeEnv: env.NODE_ENV,
            port: env.PORT,
            host: env.HOST,
            corsOrigins: env.CORS_ORIGINS,
            hasDatabaseUrl: !!env.DATABASE_URL,
            jwtSecretLength: env.JWT_SECRET?.length ?? 0,
            refreshSecretLength: env.REFRESH_TOKEN_SECRET?.length ?? 0,
            emailProvider: env.EMAIL_PROVIDER,
            appUrl: env.APP_URL,
        },
        '[boot] env summary (secrets redacted) — health probe at GET /health',
    )

    const shutdown = async (signal: string) => {
        app.log.info(`Received ${signal}, shutting down...`)
        try {
            await app.close()
        } catch (e) {
            app.log.error('Shutdown error: %s', e)
        }
        process.exit(0)
    }
    process.on('SIGTERM', () => void shutdown('SIGTERM'))
    process.on('SIGINT', () => void shutdown('SIGINT'))
}

bootstrap().catch((err) => {
    console.error('Fatal startup error:', err)
    process.exit(1)
})
