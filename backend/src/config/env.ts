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
    }

    return cached
}
