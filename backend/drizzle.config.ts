import type { Config } from 'drizzle-kit'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(__dirname, '.env') })

export default {
    schema: './src/db/schema/*.ts',
    out: './migrations',
    dialect: 'postgresql',
    dbCredentials: {
        url: process.env.DATABASE_URL!,
    },
    verbose: true,
    strict: true,
} satisfies Config
