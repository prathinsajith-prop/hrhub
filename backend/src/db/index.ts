import 'dotenv/config'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema/index.js'
import { loadEnv } from '../config/env.js'

const env = loadEnv()

// Connection pool for API server (not for migrations)
const queryClient = postgres(env.DATABASE_URL, {
    max: 20,
    idle_timeout: 20,
    connect_timeout: 10,
})

export const db = drizzle(queryClient, { schema, logger: env.NODE_ENV === 'development' })

// Migration client — single connection, no pool
export function createMigrationClient() {
    return postgres(env.DATABASE_URL, { max: 1 })
}
