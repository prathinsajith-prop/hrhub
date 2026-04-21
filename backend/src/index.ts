import Fastify from 'fastify'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { } from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { createReadStream, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

import { loadEnv } from './config/env.js'
import authenticatePlugin from './plugins/authenticate.js'

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

async function bootstrap() {
    const env = loadEnv()

    // Ensure uploads directory exists
    const uploadsDir = join(process.cwd(), 'uploads')
    if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const app: any = (Fastify as any)({
        logger: {
            level: env.NODE_ENV === 'production' ? 'warn' : 'info',
            ...(env.NODE_ENV !== 'production' && {
                transport: { target: 'pino-pretty', options: { colorize: true } },
            }),
        },
    })

    // Security
    await app.register(helmet, { contentSecurityPolicy: false })
    await app.register(rateLimit, { max: 200, timeWindow: '1 minute' })

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

    // Health check
    app.get('/health', { schema: { tags: ['Health'] } }, async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

    // File download route for uploaded documents
    app.get('/uploads/:filename', {
        preHandler: [app.authenticate],
    }, async (request: any, reply: any) => {
        const { filename } = request.params as { filename: string }
        // Prevent path traversal attacks
        if (filename.includes('..') || filename.includes('/')) {
            return reply.code(400).send({ error: 'Invalid filename' })
        }
        const filePath = join(uploadsDir, filename)
        if (!existsSync(filePath)) {
            return reply.code(404).send({ error: 'File not found' })
        }
        const stream = createReadStream(filePath)
        return reply.send(stream)
    })

    // Global error handler
    app.setErrorHandler((error, _request, reply) => {
        app.log.error(error)
        const statusCode = error.statusCode ?? 500
        reply.code(statusCode).send({
            statusCode,
            error: error.name ?? 'Internal Server Error',
            message: statusCode < 500 ? error.message : 'Internal server error',
        })
    })

    await app.listen({ port: env.PORT, host: env.HOST })
    app.log.info(`HRHub API running on http://${env.HOST}:${env.PORT}`)
    if (env.NODE_ENV !== 'production') {
        app.log.info(`Swagger docs at http://${env.HOST}:${env.PORT}/docs`)
    }
}

bootstrap().catch((err) => {
    console.error('Fatal startup error:', err)
    process.exit(1)
})
