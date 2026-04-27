import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(4000),
    HOST: z.string().default('0.0.0.0'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_EXPIRES_IN: z.string().default('15m'),
    REFRESH_TOKEN_SECRET: z.string().min(32, 'REFRESH_TOKEN_SECRET must be at least 32 characters'),
    REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),
    // Use '*' to allow all origins (Railway default) or comma-separated URLs for production
    CORS_ORIGINS: z.string().default('*'),
    // S3 / MinIO
    S3_ENDPOINT: z.string().default('http://localhost:9000'),
    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z.string().default('hrhub'),
    S3_ACCESS_KEY: z.string().default('hrhub_minio'),
    S3_SECRET_KEY: z.string().default('hrhub_minio_secret'),
    S3_PUBLIC_URL: z.string().default('http://localhost:9000/hrhub'),
    // Email
    EMAIL_PROVIDER: z.enum(['smtp', 'resend', 'gmail']).default('smtp'),
    EMAIL_FROM: z.string().email().default('noreply@hrhub.ae'),
    EMAIL_FROM_NAME: z.string().default('HRHub'),
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().default(1025),
    SMTP_USER: z.string().default(''),
    SMTP_PASS: z.string().default(''),
    RESEND_API_KEY: z.string().default(''),
    GMAIL_USER: z.string().default(''),
    GMAIL_APP_PASSWORD: z.string().default(''),
    // When true, in development a transport error logs the message and returns ok
    // instead of failing — useful when SMTP is unreachable but you still want UX flows to proceed.
    EMAIL_DEV_FALLBACK: z.coerce.boolean().default(false),
    // Redis — leave empty to disable BullMQ workers (payroll runs synchronously,
    // expiry alert schedulers are skipped). Set to redis://… to enable.
    REDIS_URL: z.string().default(''),
    // App
    APP_URL: z.string().url().default('http://localhost:5174'),
    // Sales / subscription
    SALES_EMAIL: z.string().email().default('sales@hrhub.ae'),
    // Stripe — leave empty to disable self-service checkout (falls back to email request flow)
    STRIPE_SECRET_KEY: z.string().default(''),
    STRIPE_WEBHOOK_SECRET: z.string().default(''),
    // Observability (optional). If SENTRY_DSN is set, the error handler
    // will forward 5xx errors — requires `@sentry/node` package.
    SENTRY_DSN: z.string().default(''),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).optional(),
})

export type Env = z.infer<typeof envSchema>

let cached: Env | null = null

export function loadEnv(): Env {
    if (cached) return cached

    const result = envSchema.safeParse(process.env)
    if (!result.success) {
        const issues = result.error.issues
            .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
            .join('\n')
        const hint = '\n\nRequired env vars: DATABASE_URL, JWT_SECRET (≥32 chars), REFRESH_TOKEN_SECRET (≥32 chars)'
        throw new Error(`Environment configuration errors:\n${issues}${hint}`)
    }

    cached = result.data
    return cached
}
