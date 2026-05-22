import Fastify from 'fastify'
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
import websocket from '@fastify/websocket'

import { loadEnv } from './config/env.js'
import { db } from './db/index.js'
import { sql } from 'drizzle-orm'
import { eq } from 'drizzle-orm'
import { users } from './db/schema/index.js'
import authenticatePlugin from './plugins/authenticate.js'
import { cacheGet, cacheSet } from './lib/redis.js'
import { registerConnection, removeConnection } from './lib/ws-registry.js'
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
import biometricRoutes from './modules/attendance/biometric.routes.js'
import { auditRoutes } from './modules/audit/audit.routes.js'
import { notificationsRoutes } from './modules/notifications/notifications.routes.js'
import assetsRoutes from './modules/assets/assets.routes.js'
import tenantsRoutes from './modules/tenants/tenants.routes.js'
import appsRoutes from './modules/apps/apps.routes.js'
import profileChangesRoutes from './modules/profile-changes/profile-changes.routes.js'
import extRoutes from './modules/apps/ext.routes.js'
import publicHolidaysRoutes from './modules/hr/public-holidays.routes.js'
import salaryRevisionsRoutes from './modules/employees/salary-revisions.routes.js'
import transfersRoutes from './modules/employees/transfers.routes.js'
import employeeDependentsRoutes from './modules/employees/employee-dependents.routes.js'
import employeeNotesRoutes from './modules/employees/employee-notes.routes.js'
import employeeWarningsRoutes from './modules/employees/employee-warnings.routes.js'
import subscriptionRoutes from './modules/subscription/subscription.routes.js'
import { orgUnitsRoutes } from './modules/orgUnits/orgUnits.routes.js'
import { designationsRoutes } from './modules/designations/designations.routes.js'
import { salaryComponentsRoutes } from './modules/salary-components/salary-components.routes.js'
import { shiftsRoutes } from './modules/shifts/shifts.routes.js'
import { gradeLevelsRoutes } from './modules/gradeLevels/grade-levels.routes.js'
import { sponsoringEntitiesRoutes } from './modules/sponsoringEntities/sponsoring-entities.routes.js'
import calendarRoutes from './modules/calendar/calendar.routes.js'
import teamsModuleRoutes from './modules/teams/teams.routes.js'
import { complaintsRoutes } from './modules/complaints/complaints.routes.js'
import trainingRoutes from './modules/training/training.routes.js'
import travelRoutes from './modules/travel/travel.routes.js'
import loansRoutes from './modules/loans/loans.routes.js'
import { diagnosticsRoutes } from './modules/admin/diagnostics.routes.js'

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
                // 'self' covers http/https; ws: and wss: are needed for WebSocket upgrades
                connectSrc: ["'self'", 'ws:', 'wss:'],
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
        allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma', 'X-Socket-Id'],
    })

    // JWT
    await app.register(jwt, {
        secret: env.JWT_SECRET,
        sign: { expiresIn: env.JWT_EXPIRES_IN as never },
    })

    // API documentation — only enabled when ENABLE_API_DOCS=true.
    const docsEnabled = env.ENABLE_API_DOCS
    if (docsEnabled) {
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
        await app.register(swaggerUi, {
            routePrefix: '/api/docs',
            uiConfig: { docExpansion: 'list', persistAuthorization: true },
            staticCSP: true,
        })
    }

    // Auth plugin (adds fastify.authenticate + fastify.requireRole)
    await app.register(authenticatePlugin)

    // ── WebSocket ────────────────────────────────────────────────────────────
    // Register @fastify/websocket BEFORE any routes so the { websocket: true }
    // route option is available. Must be in the same (root) Fastify scope.
    await app.register(websocket)

    const STALE_THRESHOLD_MS = 60_000
    const STALE_CHECK_INTERVAL_MS = 30_000

    app.get('/api/v1/ws', { websocket: true }, async (socket: any, request: any) => {
        // ── Auth ─────────────────────────────────────────────────────────────
        const token = (request.query as Record<string, string>)?.token
        if (!token) { socket.close(4001, 'missing token'); return }

        let payload: any
        try { payload = app.jwt.verify(token) as any }
        catch { socket.close(4001, 'invalid or expired token'); return }

        if (!payload?.sub || !payload?.tenantId || !payload?.employeeId) {
            socket.close(4001, 'invalid token payload')
            return
        }

        const cacheKey = `user:active:${payload.sub}`
        let isActive = await cacheGet<boolean>(cacheKey)
        if (isActive === null) {
            const [row] = await db.select({ isActive: users.isActive }).from(users)
                .where(eq(users.id, payload.sub)).limit(1)
            isActive = row?.isActive ?? false
            await cacheSet(cacheKey, isActive, 300)
        }
        if (!isActive) { socket.close(4003, 'account deactivated'); return }

        const userId: string = payload.sub
        const tenantId: string = payload.tenantId

        // ── Register ─────────────────────────────────────────────────────────
        registerConnection(userId, tenantId, socket)
        app.log.debug({ userId, tenantId }, 'ws: connected')

        try { socket.send(JSON.stringify({ type: 'connected', payload: { userId } })) }
        catch { /* ignore */ }

        // ── Application-level ping/pong ───────────────────────────────────────
        let lastPingAt = Date.now()
        const staleCheck = setInterval(() => {
            if (Date.now() - lastPingAt > STALE_THRESHOLD_MS) {
                app.log.debug({ userId }, 'ws: stale socket — terminating')
                clearInterval(staleCheck)
                try { if (socket.terminate) socket.terminate(); else socket.close() } catch { /* ignore */ }
            }
        }, STALE_CHECK_INTERVAL_MS)

        socket.on('message', (raw: Buffer | string) => {
            try {
                const msg = JSON.parse(raw.toString()) as { type?: string }
                if (msg.type === 'ping') {
                    lastPingAt = Date.now()
                    socket.send(JSON.stringify({ type: 'pong' }))
                }
            } catch { /* ignore non-JSON */ }
        })

        // ── Cleanup ───────────────────────────────────────────────────────────
        let cleaned = false
        const cleanup = () => {
            if (cleaned) return
            cleaned = true
            clearInterval(staleCheck)
            removeConnection(userId, tenantId, socket)
            app.log.debug({ userId }, 'ws: disconnected')
        }
        socket.on('close', cleanup)
        socket.on('error', (err: Error) => { app.log.debug({ userId, err: err?.message }, 'ws: error'); cleanup() })
    })

    // Global error handler — must be registered BEFORE routes so all plugin scopes inherit it
    app.setErrorHandler((error: any, _request: any, reply: any) => {
        let statusCode: number = error.statusCode ?? 500
        let message: string = error.message ?? 'Internal server error'
        let name: string = error.name ?? 'Error'

        // PostgreSQL / Drizzle constraint violations → return user-friendly 400
        const pgCode: string | undefined = error?.cause?.code ?? error?.code
        let duplicateField: string | undefined
        if (pgCode && /^(22|23)/.test(pgCode)) {
            statusCode = 400
            name = 'ValidationError'
            if (pgCode === '23505') {
                // Extract columns + values from: "Key (col1, col2)=(val1, val2) already exists."
                const detail: string = error?.cause?.detail ?? error?.detail ?? ''
                const colMatch = detail.match(/Key \(([^)]+)\)=\(([^)]*)\)/)
                if (colMatch) {
                    const rawCols = colMatch[1]!.split(',').map(s => s.trim())
                    const rawVals = colMatch[2]!.split(',').map(s => s.trim())

                    // Strip internal/tenant columns that have no meaning to the user
                    const INTERNAL_COLS = new Set(['tenant_id', 'id', 'year_month'])
                    const visible = rawCols
                        .map((col, i) => ({ col, val: rawVals[i] ?? '' }))
                        .filter(({ col }) => !INTERNAL_COLS.has(col))

                    if (visible.length === 0) {
                        // All columns were internal — generic message
                        message = 'This record already exists.'
                    } else if (visible.length === 1) {
                        // Single meaningful field — keep existing field-level behaviour
                        const { col, val } = visible[0]!
                        const label = col.replace(/_/g, ' ')
                        duplicateField = col.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
                        message = `"${val}" is already in use for ${label}. Please use a different value.`
                    } else {
                        // Multi-column — build a friendly contextual message
                        const colSet = new Set(visible.map(v => v.col))
                        const valMap = Object.fromEntries(visible.map(({ col, val }) => [col, val]))

                        if (colSet.has('month') && colSet.has('year')) {
                            const MONTH_NAMES = ['January','February','March','April','May','June',
                                                 'July','August','September','October','November','December']
                            const monthName = MONTH_NAMES[(Number(valMap['month']) || 0) - 1] ?? valMap['month']
                            message = `A record for ${monthName} ${valMap['year']} already exists.`
                        } else if (colSet.has('employee_id') && colSet.has('year')) {
                            message = `A record for this employee in ${valMap['year']} already exists.`
                        } else if (colSet.has('employee_id') && colSet.has('leave_type')) {
                            message = `A leave balance for this employee and leave type already exists.`
                        } else {
                            // Fallback: list the visible fields without internal UUIDs
                            const parts = visible.map(({ col, val }) => `${col.replace(/_/g, ' ')}: "${val}"`)
                            message = `A record with ${parts.join(', ')} already exists.`
                        }
                    }
                } else {
                    message = 'This record already exists.'
                }
            }
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
            ...(duplicateField ? { field: duplicateField } : {}),
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
    await app.register(biometricRoutes, { prefix: '/api/v1/attendance' })
    await app.register(auditRoutes, { prefix: '/api/v1/audit' })
    await app.register(notificationsRoutes, { prefix: '/api/v1/notifications' })
    await app.register(assetsRoutes, { prefix: '/api/v1/assets' })
    await app.register(tenantsRoutes, { prefix: '/api/v1/tenants' })
    await app.register(appsRoutes, { prefix: '/api/v1/apps' })
    await app.register(profileChangesRoutes, { prefix: '/api/v1/profile-changes' })
    await app.register(extRoutes, { prefix: '/api/ext' })
    await app.register(publicHolidaysRoutes, { prefix: '/api/v1/hr' })
    await app.register(salaryRevisionsRoutes, { prefix: '/api/v1/employees' })
    await app.register(transfersRoutes, { prefix: '/api/v1/employees' })
    await app.register(employeeDependentsRoutes, { prefix: '/api/v1/employees' })
    await app.register(employeeNotesRoutes, { prefix: '/api/v1/employees' })
    await app.register(employeeWarningsRoutes, { prefix: '/api/v1/employees' })
    await app.register(subscriptionRoutes, { prefix: '/api/v1/subscription' })
    await app.register(orgUnitsRoutes, { prefix: '/api/v1' })
    await app.register(designationsRoutes, { prefix: '/api/v1' })
    await app.register(salaryComponentsRoutes, { prefix: '/api/v1' })
    await app.register(shiftsRoutes, { prefix: '/api/v1' })
    await app.register(gradeLevelsRoutes, { prefix: '/api/v1' })
    await app.register(sponsoringEntitiesRoutes, { prefix: '/api/v1' })
    await app.register(calendarRoutes, { prefix: '/api/v1' })
    await app.register(teamsModuleRoutes, { prefix: '/api/v1' })
    await app.register(complaintsRoutes, { prefix: '/api/v1' })
    await app.register(trainingRoutes, { prefix: '/api/v1/training' })
    await app.register(travelRoutes, { prefix: '/api/v1/travel' })
    await app.register(loansRoutes, { prefix: '/api/v1/loans' })
    await app.register(diagnosticsRoutes, { prefix: '/api/v1/admin/diagnostics' })

    // Meta — returns runtime capability flags so the frontend can adapt without
    // hardcoding env assumptions (e.g. whether to show the API docs link).
    app.get('/api/v1/meta', { schema: { tags: ['Meta'] } }, async (_req: any, reply: any) => {
        const host = env.HOST === '0.0.0.0' ? 'localhost' : env.HOST
        const baseUrl = `http://${host}:${env.PORT}`
        return reply.send({
            version: '1.0.0',
            docsEnabled,
            docsUrl: docsEnabled ? `${baseUrl}/api/docs` : null,
        })
    })

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
    if (docsEnabled) {
        app.log.info(`API docs at http://${env.HOST}:${env.PORT}/api/docs`)
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

    // Ensure S3 bucket exists and CORS policy is applied (non-fatal)
    try {
        const { ensureBucket } = await import('./plugins/s3.js')
        await ensureBucket()
        app.log.info('[S3] Bucket ready')
    } catch (e) {
        app.log.warn('[S3] Bucket check failed — file uploads/downloads may not work: %s', e)
    }

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
