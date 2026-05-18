import 'dotenv/config'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema/index.js'
import { loadEnv } from '../env.js'

const env = loadEnv()

const queryClient = postgres(env.DATABASE_URL, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    // Kill runaway queries after 30s so a slow report can't starve the pool.
    connection: { statement_timeout: 30_000 },
    // Keep the noisy notice channel quiet — postgres-js logs raise()/notify() by default.
    onnotice: () => {},
})

// Query logging is OFF by default (it doubles request latency and floods stdout in dev).
// Set LOG_LEVEL=debug to turn it on when diagnosing a slow query.
export const db = drizzle(queryClient, {
    schema,
    logger: env.LOG_LEVEL === 'debug',
})
