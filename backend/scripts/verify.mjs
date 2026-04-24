import 'dotenv/config'
import postgres from 'postgres'
const sql = postgres(process.env.DATABASE_URL, { max: 1 })
const tables = await sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
console.log('Tables (' + tables.length + '):', tables.map(t => t.tablename).join(', '))
const policies = await sql`SELECT count(*)::int AS n FROM pg_policies WHERE schemaname = 'public'`
console.log('RLS policies:', policies[0].n)
const checks = await sql`SELECT count(*)::int AS n FROM pg_constraint WHERE contype = 'c' AND connamespace = 'public'::regnamespace`
console.log('CHECK constraints:', checks[0].n)
await sql.end()
