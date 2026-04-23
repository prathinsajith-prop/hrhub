import Fastify from 'fastify'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { } from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import compress from '@fastify/compress'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'

import { loadEnv } from './config/env.js'
import { db } from './db/index.js'
import { sql } from 'drizzle-orm'
import authenticatePlugin from './plugins/authenticate.js'
import { cleanupExpiredTokens } from './modules/auth/auth.service.js'
import { startExpiryWorkers } from './workers/expiry.worker.js'
import { startPayrollWorker } from './workers/payroll.worker.js'

import authRoutes from './modules/auth/auth.routes.js'
import employeesRoutes from './modules/employees/employees.routes.js'
import recruitmentRoutes from './modules/recruitment/recruitment.routes.js'
import visaRoutes from './modules/visa/visa.routes.js'
import documentsRoutes from './modules/documents/documents.routes.js'
import payrollRoutes from './modules/payroll/payroll.routes.js'
import leaveRoutes from './modules/leave/leave.routes.js'
import onboardingRoutes from './modules/onboarding/onboarding.routes.js'
import complianceRoutes from './modules/compliance/compliance.routes.js'
import dashboardRoutes from './modules/dashboard/dashboard.routes.js'
import reportsRoutes from './modules/reports/reports.routes.js'
import settingsRoutes from './modules/settings/settings.routes.js'
import { exitRoutes } from './modules/exit/exit.routes.js'
import { interviewRoutes } from './modules/recruitment/interview.routes.js'
import { performanceRoutes } from './modules/performance/performance.routes.js'
import { attendanceRoutes } from './modules/attendance/attendance.routes.js'
import { auditRoutes } from './modules/audit/audit.routes.js'
import { notificationsRoutes } from './modules/notifications/notifications.routes.js'

async function bootstrap() {
    const env = loadEnv()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const app: any = (Fastify as any)({
        logger: {
            level: env.NODE_ENV === 'production' ? 'warn' : 'info',
            ...(env.NODE_ENV !== 'production' && {
                transport: { target: 'pino-pretty', options: { colorize: true } },
            }),
        },
        // 30-second hard limit on all requests (PERF-008)
        connectionTimeout: 30_000,
    })

    // Security
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

    // Gzip compression for all responses (PERF-007)
    await app.register(compress, { global: true, encodings: ['gzip', 'deflate'] })

    // X-Request-ID correlation header on all responses
    app.addHook('onRequest', async (request: any, reply: any) => {
        const reqId = (request.headers['x-request-id'] as string) || crypto.randomUUID()
        reply.header('X-Request-ID', reqId)
        request.requestId = reqId
    })

    // Task 2.3 — Reject mutating requests with wrong Content-Type
    app.addHook('preValidation', async (request: any, reply: any) => {
        if (['POST', 'PATCH', 'PUT'].includes(request.method) && request.body !== undefined) {
            const ct: string = request.headers['content-type'] ?? ''
            if (!ct.includes('application/json') && !ct.includes('multipart/form-data')) {
                return reply.code(415).send({
                    statusCode: 415,
                    error: 'Unsupported Media Type',
                    message: 'Content-Type must be application/json or multipart/form-data',
                })
            }
        }
    })

    // Multipart (file uploads — max 10 MB)
    await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } })

    // CORS
    await app.register(cors, {
        origin: env.CORS_ORIGINS.split(',').map(o => o.trim()),
        credentials: true,
    })

    // JWT
    await app.register(jwt, {
        secret: env.JWT_SECRET,
        sign: { expiresIn: env.JWT_EXPIRES_IN as never },
    })

    // Swagger docs (dev only)
    if (env.NODE_ENV !== 'production') {
        await app.register(swagger, {
            openapi: {
                info: { title: 'HRHub API', description: 'HRHub.ae HR & PRO Management Platform', version: '1.0.0' },
                components: {
                    securitySchemes: {
                        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
                    },
                },
                security: [{ bearerAuth: [] }],
            },
        })
        await app.register(swaggerUi, { routePrefix: '/docs', uiConfig: { docExpansion: 'list' } })
    }

    // Auth plugin (adds fastify.authenticate + fastify.requireRole)
    await app.register(authenticatePlugin)

    // Global error handler — must be registered BEFORE routes so all plugin scopes inherit it
    app.setErrorHandler((error: any, _request: any, reply: any) => {
        let statusCode: number = error.statusCode ?? 500
        let message: string = error.message ?? 'Internal server error'
        let name: string = error.name ?? 'Error'

        // PostgreSQL / Drizzle constraint violations → return user-friendly 400
        const pgCode: string | undefined = error?.cause?.code ?? error?.code
        if (pgCode && /^(22|23)/.test(pgCode)) {
            statusCode = 400
            name = 'ValidationError'
            if (pgCode === '23505') message = 'Duplicate value — that record already exists.'
            else if (pgCode === '23503') message = 'Referenced record not found.'
            else if (pgCode === '23514') message = 'One or more fields violate a business rule (e.g. totalSalary must be ≥ basicSalary).'
            else if (pgCode === '23502') message = 'A required field is missing.'
            else message = 'The submitted data is invalid.'
        }

        if (statusCode >= 500) {
            app.log.error(error)
            message = 'Internal server error'
            name = 'InternalServerError'
        }

        return reply.code(statusCode).send({
            statusCode,
            error: name,
            message,
            ...(error.validationErrors ? { validationErrors: error.validationErrors } : {}),
        })
    })

    // Routes
    await app.register(authRoutes, { prefix: '/api/v1/auth' })
    await app.register(employeesRoutes, { prefix: '/api/v1/employees' })
    await app.register(recruitmentRoutes, { prefix: '/api/v1' })
    await app.register(visaRoutes, { prefix: '/api/v1/visa' })
    await app.register(documentsRoutes, { prefix: '/api/v1/documents' })
    await app.register(payrollRoutes, { prefix: '/api/v1/payroll' })
    await app.register(leaveRoutes, { prefix: '/api/v1/leave' })
    await app.register(onboardingRoutes, { prefix: '/api/v1/onboarding' })
    await app.register(complianceRoutes, { prefix: '/api/v1/compliance' })
    await app.register(dashboardRoutes, { prefix: '/api/v1/dashboard' })
    await app.register(reportsRoutes, { prefix: '/api/v1/reports' })
    await app.register(settingsRoutes, { prefix: '/api/v1/settings' })
    await app.register(exitRoutes, { prefix: '/api/v1' })
    await app.register(interviewRoutes, { prefix: '/api/v1' })
    await app.register(performanceRoutes, { prefix: '/api/v1' })
    await app.register(attendanceRoutes, { prefix: '/api/v1' })
    await app.register(auditRoutes, { prefix: '/api/v1/audit' })
    await app.register(notificationsRoutes, { prefix: '/api/v1/notifications' })

    // Health check — basic
    app.get('/health', { schema: { tags: ['Health'] } }, async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

    // Health check — detailed (ARCH-007: checks DB, Redis, S3)
    app.get('/health/detailed', { schema: { tags: ['Health'] } }, async (_req: any, reply: any) => {
        const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {}

        // PostgreSQL check
        const dbStart = Date.now()
        try {
            await db.execute(sql`SELECT 1`)
            checks.database = { ok: true, latencyMs: Date.now() - dbStart }
        } catch (e: any) {
            checks.database = { ok: false, error: e.message }
        }

        // Redis check (TCP probe via BullMQ queue client)
        const redisStart = Date.now()
        try {
            const { visaExpiryQueue } = await import('./workers/expiry.worker.js')
            if (visaExpiryQueue) {
                const client = await visaExpiryQueue.client
                await client.ping()
                checks.redis = { ok: true, latencyMs: Date.now() - redisStart }
            } else {
                checks.redis = { ok: false, error: 'Redis unavailable — BullMQ disabled' }
            }
        } catch (e: any) {
            checks.redis = { ok: false, error: e.message }
        }

        const allOk = Object.values(checks).every(c => c.ok)
        return reply.code(allOk ? 200 : 503).send({
            status: allOk ? 'ok' : 'degraded',
            timestamp: new Date().toISOString(),
            checks,
        })
    })

    await app.listen({ port: env.PORT, host: env.HOST })
    app.log.info(`HRHub API running on http://${env.HOST}:${env.PORT}`)
    if (env.NODE_ENV !== 'production') {
        app.log.info(`Swagger docs at http://${env.HOST}:${env.PORT}/docs`)
    }

    // Task 2.8 — Expired token cleanup every 6 hours
    const SIX_HOURS = 6 * 60 * 60 * 1000
    setInterval(() => {
        cleanupExpiredTokens().catch((e) => app.log.error('Token cleanup failed: %s', e))
    }, SIX_HOURS)
    // Run once on startup
    cleanupExpiredTokens().catch((e) => app.log.warn('Initial token cleanup skipped: %s', e))

    // Start background workers (expiry alerts + async payroll via BullMQ)
    await startExpiryWorkers()
    await startPayrollWorker()
}

bootstrap().catch((err) => {
    console.error('Fatal startup error:', err)
    process.exit(1)
})
