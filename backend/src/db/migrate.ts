import 'dotenv/config'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { drizzle } from 'drizzle-orm/postgres-js'
import { createMigrationClient } from './index.js'

async function runMigrations() {
    const sql = createMigrationClient()
    const db = drizzle(sql)

    console.log('Running migrations...')
    await migrate(db, { migrationsFolder: './migrations' })
    console.log('Migrations complete.')

    await sql.end()
}

runMigrations().catch((err) => {
    console.error('Migration failed:', err)
    process.exit(1)
})
