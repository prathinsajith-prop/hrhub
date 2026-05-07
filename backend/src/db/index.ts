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
    // Kill runaway queries after 30 s — prevents pool exhaustion from slow reports.
    // Report/export routes override per-transaction with SET LOCAL statement_timeout.
    connection: {
        statement_timeout: 30_000,
    },
})

export const db = drizzle(queryClient, { schema, logger: env.NODE_ENV === 'development' })

type DrizzleTx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Run a block of DB operations with PostgreSQL RLS tenant context set.
 * SET LOCAL scopes the variable to the transaction and resets automatically on commit/rollback.
 */
export async function withTenantContext<T>(tenantId: string, fn: (tx: DrizzleTx) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL "app.current_tenant" = ${tenantId}`)
        return fn(tx)
    })
}

/**
 * Run a long-running query block (reports, exports, payroll) with an extended
 * 2-minute statement timeout instead of the pool-wide 30-second default.
 * SET LOCAL scopes the override to this transaction only — other concurrent
 * requests on the same connection are not affected.
 */
export async function withLongTimeout<T>(fn: (tx: DrizzleTx) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL statement_timeout = 120000`)
        return fn(tx)
    })
}

// Migration client — single connection, no pool
export function createMigrationClient() {
    return postgres(env.DATABASE_URL, { max: 1 })
}
