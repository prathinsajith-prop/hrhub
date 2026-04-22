import 'dotenv/config'

interface Env {
    NODE_ENV: string
    PORT: number
    HOST: string
    DATABASE_URL: string
    JWT_SECRET: string
    JWT_EXPIRES_IN: string
    REFRESH_TOKEN_SECRET: string
    REFRESH_TOKEN_EXPIRES_IN: string
    CORS_ORIGINS: string
    // S3 / MinIO
    S3_ENDPOINT: string
    S3_REGION: string
    S3_BUCKET: string
    S3_ACCESS_KEY: string
    S3_SECRET_KEY: string
    S3_PUBLIC_URL: string
    // Email
    EMAIL_PROVIDER: 'smtp' | 'resend'
    EMAIL_FROM: string
    EMAIL_FROM_NAME: string
    SMTP_HOST: string
    SMTP_PORT: number
    SMTP_USER: string
    SMTP_PASS: string
    RESEND_API_KEY: string
    // Redis / BullMQ
    REDIS_URL: string
    // App
    APP_URL: string
}

let cached: Env | null = null

export function loadEnv(): Env {
    if (cached) return cached

    const required = [
        'DATABASE_URL',
        'JWT_SECRET',
        'REFRESH_TOKEN_SECRET',
    ]

    const missing = required.filter((k) => !process.env[k])
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
    }

    cached = {
        NODE_ENV: process.env.NODE_ENV ?? 'development',
        PORT: Number(process.env.PORT ?? 4000),
        HOST: process.env.HOST ?? '0.0.0.0',
        DATABASE_URL: process.env.DATABASE_URL!,
        JWT_SECRET: process.env.JWT_SECRET!,
        JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? '15m',
        REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET!,
        REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN ?? '7d',
        CORS_ORIGINS: process.env.CORS_ORIGINS ?? 'http://localhost:5173',
        // S3 / MinIO
        S3_ENDPOINT: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
        S3_REGION: process.env.S3_REGION ?? 'us-east-1',
        S3_BUCKET: process.env.S3_BUCKET ?? 'hrhub',
        S3_ACCESS_KEY: process.env.S3_ACCESS_KEY ?? process.env.AWS_ACCESS_KEY_ID ?? 'hrhub_minio',
        S3_SECRET_KEY: process.env.S3_SECRET_KEY ?? process.env.AWS_SECRET_ACCESS_KEY ?? 'hrhub_minio_secret',
        S3_PUBLIC_URL: process.env.S3_PUBLIC_URL ?? 'http://localhost:9000/hrhub',
        // Email
        EMAIL_PROVIDER: (process.env.EMAIL_PROVIDER as 'smtp' | 'resend') ?? 'smtp',
        EMAIL_FROM: process.env.EMAIL_FROM ?? 'noreply@hrhub.ae',
        EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME ?? 'HRHub',
        SMTP_HOST: process.env.SMTP_HOST ?? 'localhost',
        SMTP_PORT: Number(process.env.SMTP_PORT ?? 1025),
        SMTP_USER: process.env.SMTP_USER ?? '',
        SMTP_PASS: process.env.SMTP_PASS ?? '',
        RESEND_API_KEY: process.env.RESEND_API_KEY ?? '',
        // Redis
        REDIS_URL: process.env.REDIS_URL ?? 'redis://:hrhub_redis_secret@localhost:6379',
        // App
        APP_URL: process.env.APP_URL ?? 'http://localhost:5174',
    }

    return cached
}
