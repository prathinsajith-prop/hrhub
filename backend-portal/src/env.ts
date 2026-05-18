import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(4001),
    HOST: z.string().default('0.0.0.0'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

    // MUST match the main backend so tokens are interchangeable across both services.
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_EXPIRES_IN: z.string().default('15m'),
    REFRESH_TOKEN_SECRET: z.string().min(32, 'REFRESH_TOKEN_SECRET must be at least 32 characters'),
    REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),

    CORS_ORIGINS: z.string().default('http://localhost:5175'),

    S3_ENDPOINT: z.string().default('http://localhost:9000'),
    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z.string().default('hrhub'),
    S3_ACCESS_KEY: z.string().default('hrhub_minio'),
    S3_SECRET_KEY: z.string().default('hrhub_minio_secret'),
    S3_PUBLIC_URL: z.string().default('http://localhost:9000/hrhub'),

    // Email — used for password-reset delivery. Same vars + defaults as the main backend.
    EMAIL_PROVIDER: z.enum(['smtp', 'resend', 'gmail']).default('smtp'),
    EMAIL_FROM: z.string().email().default('noreply@hrhub.ae'),
    EMAIL_FROM_NAME: z.string().default('HRHub Portal'),
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().default(1025),
    SMTP_USER: z.string().default(''),
    SMTP_PASS: z.string().default(''),
    RESEND_API_KEY: z.string().default(''),
    GMAIL_USER: z.string().default(''),
    GMAIL_APP_PASSWORD: z.string().default(''),
    // When true (and not in production), email send failures don't bubble up — useful
    // so the password-reset flow keeps working when SMTP/Gmail isn't reachable in dev.
    EMAIL_DEV_FALLBACK: z.coerce.boolean().default(false),

    // Public portal URL used to build links inside password-reset emails.
    APP_URL: z.string().url().default('http://localhost:5175'),

    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).optional(),
})

export type Env = z.infer<typeof envSchema>

let cached: Env | null = null

export function loadEnv(): Env {
    if (cached) return cached
    const result = envSchema.safeParse(process.env)
    if (!result.success) {
        const issues = result.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n')
        throw new Error(`Environment configuration errors:\n${issues}`)
    }
    cached = result.data
    return cached
}
