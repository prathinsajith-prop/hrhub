import 'dotenv/config'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { sql } from 'drizzle-orm'
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

/**
 * Run a block of DB operations with PostgreSQL RLS tenant context set.
 * Usage: withTenantContext(tenantId, () => db.select()...)
 * This issues SET LOCAL app.current_tenant = '<id>' within the same transaction,
 * satisfying the RLS policy on all tenant-scoped tables.
 */
export async function withTenantContext<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL "app.current_tenant" = ${tenantId}`)
        return fn()
    })
}

// Migration client — single connection, no pool
export function createMigrationClient() {
    return postgres(env.DATABASE_URL, { max: 1 })
}
