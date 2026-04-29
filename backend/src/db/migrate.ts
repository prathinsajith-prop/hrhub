/**
 * Custom migrator — runs each migration file in its own transaction.
 *
 * Drizzle's built-in `migrate()` wraps ALL pending migrations in a single
 * transaction, which causes PostgreSQL to reject ALTER TABLE statements on
 * tables that were modified by DML earlier in the same transaction
 * ("pending trigger events"). Running each file in its own BEGIN/COMMIT
 * eliminates that restriction.
 *
 * Uses the journal `when` timestamp as the identity key (matches the
 * `created_at` values Drizzle stored for already-applied migrations).
 */
import 'dotenv/config'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postgres from 'postgres'
import { loadEnv } from '../config/env.js'

interface JournalEntry {
    idx: number
    when: number
    tag: string
    breakpoints: boolean
}

interface Journal {
    entries: JournalEntry[]
}

async function runMigrations() {
    const env = loadEnv()
    const sql = postgres(env.DATABASE_URL, { max: 1 })

    try {
        console.log('Running migrations...')

        // Ensure Drizzle tracking schema and table exist (idempotent)
        await sql`CREATE SCHEMA IF NOT EXISTS drizzle`
        await sql`
            CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
                id         serial  PRIMARY KEY,
                hash       text    NOT NULL,
                created_at bigint
            )
        `

        // Read journal
        const journalPath = resolve('migrations/meta/_journal.json')
        const journal: Journal = JSON.parse(readFileSync(journalPath, 'utf8'))

        // Identify applied migrations by their journal `when` timestamp.
        // Drizzle stores this in created_at — using it as the identifier
        // avoids having to reproduce Drizzle's internal hash algorithm.
        const applied = await sql<{ created_at: string }[]>`
            SELECT created_at FROM drizzle.__drizzle_migrations
        `
        const appliedTimestamps = new Set(applied.map(r => String(r.created_at)))

        for (const entry of journal.entries) {
            if (appliedTimestamps.has(String(entry.when))) {
                console.log(`  skip  ${entry.tag}`)
                continue
            }

            const filePath = resolve(`migrations/${entry.tag}.sql`)
            const content = readFileSync(filePath, 'utf8')

            // Split on Drizzle's statement-breakpoint marker
            const statements = content
                .split('--> statement-breakpoint')
                .map(s => s.trim())
                .filter(Boolean)

            // Each migration gets its own transaction so DDL following DML
            // in a prior migration is not blocked by pending trigger events.
            await sql.begin(async tx => {
                for (const stmt of statements) {
                    await tx.unsafe(stmt)
                }
                // Record using the journal timestamp so future runs recognise it
                const hash = createHash('sha256').update(statements.join(';')).digest('hex')
                await tx`
                    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
                    VALUES (${hash}, ${entry.when})
                `
            })

            console.log(`  apply ${entry.tag}`)
        }

        console.log('Migrations complete.')
    } finally {
        await sql.end()
    }
}

runMigrations().catch(err => {
    console.error('Migration failed:', err)
    process.exit(1)
})
