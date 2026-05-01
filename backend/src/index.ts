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
import rawBody from 'fastify-raw-body'

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
import assetsRoutes from './modules/assets/assets.routes.js'
import tenantsRoutes from './modules/tenants/tenants.routes.js'
import appsRoutes from './modules/apps/apps.routes.js'
import extRoutes from './modules/apps/ext.routes.js'
import publicHolidaysRoutes from './modules/hr/public-holidays.routes.js'
import salaryRevisionsRoutes from './modules/employees/salary-revisions.routes.js'
import subscriptionRoutes from './modules/subscription/subscription.routes.js'
import { orgUnitsRoutes } from './modules/orgUnits/orgUnits.routes.js'
import { designationsRoutes } from './modules/designations/designations.routes.js'
import calendarRoutes from './modules/calendar/calendar.routes.js'
import teamsModuleRoutes from './modules/teams/teams.routes.js'
import { complaintsRoutes } from './modules/complaints/complaints.routes.js'
import trainingRoutes from './modules/training/training.routes.js'
import loansRoutes from './modules/loans/loans.routes.js'

async function bootstrap() {
    const env = loadEnv()

    // Sentry — optional. Initialized as early as possible so instrumentation
    // sees route handlers and background workers.
    if (env.SENTRY_DSN) {
        try {
            const Sentry = await import('@sentry/node')
            Sentry.init({
                dsn: env.SENTRY_DSN,
                environment: env.NODE_ENV,
                tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 0,
            })
                ; (globalThis as any).Sentry = Sentry
        } catch (e) {
            console.warn('Sentry init skipped:', (e as Error).message)
        }
    }

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
        // Trust the X-Forwarded-For header from the reverse proxy so request.ip is accurate
        trustProxy: true,
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
        // Skip the Stripe webhook route — it sends application/json but needs raw body
        if (request.url?.includes('/subscription/webhook')) return
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

    // Raw body capture (used by Stripe webhook signature verification)
    await app.register(rawBody, { global: false, encoding: false, runFirst: true })

    // Multipart (file uploads — max 10 MB)
    await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } })

    // CORS
    await app.register(cors, {
        origin: env.CORS_ORIGINS === '*' ? true : env.CORS_ORIGINS.split(',').map(o => o.trim()),
        credentials: true,
        methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma'],
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
            // Forward 5xx to Sentry when configured
            if (env.SENTRY_DSN) {
                const Sentry = (globalThis as any).Sentry
                try { Sentry?.captureException?.(error) } catch { /* ignore */ }
            }
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
    await app.register(assetsRoutes, { prefix: '/api/v1/assets' })
    await app.register(tenantsRoutes, { prefix: '/api/v1/tenants' })
    await app.register(appsRoutes, { prefix: '/api/v1/apps' })
    await app.register(extRoutes, { prefix: '/api/ext' })
    await app.register(publicHolidaysRoutes, { prefix: '/api/v1/hr' })
    await app.register(salaryRevisionsRoutes, { prefix: '/api/v1/employees' })
    await app.register(subscriptionRoutes, { prefix: '/api/v1/subscription' })
    await app.register(orgUnitsRoutes, { prefix: '/api/v1' })
    await app.register(designationsRoutes, { prefix: '/api/v1' })
    await app.register(calendarRoutes, { prefix: '/api/v1' })
    await app.register(teamsModuleRoutes, { prefix: '/api/v1' })
    await app.register(complaintsRoutes, { prefix: '/api/v1' })
    await app.register(trainingRoutes, { prefix: '/api/v1/training' })
    await app.register(loansRoutes, { prefix: '/api/v1/loans' })

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

        // S3/MinIO check (P0-08)
        const s3Start = Date.now()
        try {
            const { getS3Client } = await import('./plugins/s3.js')
            const { HeadBucketCommand } = await import('@aws-sdk/client-s3')
            const { loadEnv: _loadEnv } = await import('./config/env.js')
            const _env = _loadEnv()
            await getS3Client().send(new HeadBucketCommand({ Bucket: _env.S3_BUCKET }))
            checks.s3 = { ok: true, latencyMs: Date.now() - s3Start }
        } catch (e: any) {
            checks.s3 = { ok: false, error: e.message }
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

    // Verify mail transport is reachable (non-fatal — emails will retry per send)
    try {
        const { verifyEmailConfig } = await import('./plugins/email.js')
        const mailStatus = await verifyEmailConfig()
        if (mailStatus.ok) {
            app.log.info(`[email] Connected: ${mailStatus.provider} via ${mailStatus.host} (from: ${mailStatus.from})`)
        } else {
            app.log.warn(`[email] Transport check FAILED — ${mailStatus.provider}@${mailStatus.host}: ${mailStatus.error}`)
            if (env.NODE_ENV === 'production') {
                app.log.warn('[email] Outbound emails will fail until configuration is fixed.')
            }
        }
    } catch (e) {
        app.log.error('[email] verifyEmailConfig threw: %s', e)
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

    // Graceful shutdown — flush in-flight requests, close DB/Redis connections
    const shutdown = async (signal: string) => {
        app.log.info(`Received ${signal}, shutting down gracefully...`)
        try {
            await app.close()
            app.log.info('HTTP server closed')
        } catch (e) {
            app.log.error('Error during shutdown: %s', e)
        }
        process.exit(0)
    }
    process.on('SIGTERM', () => { void shutdown('SIGTERM') })
    process.on('SIGINT', () => { void shutdown('SIGINT') })
}

bootstrap().catch((err) => {
    console.error('Fatal startup error:', err)
    process.exit(1)
})
