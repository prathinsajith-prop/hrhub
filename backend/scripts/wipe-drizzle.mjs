import 'dotenv/config'
import postgres from 'postgres'
const sql = postgres(process.env.DATABASE_URL, { max: 1 })
await sql.unsafe('DROP TABLE IF EXISTS drizzle.__drizzle_migrations CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE;')
console.log('drizzle tracking wiped')
const tables = await sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
console.log('public tables:', tables.length)
await sql.end()
