/**
 * One-shot backfill: seed default salary components into any tenant that
 * doesn't have any yet. Idempotent thanks to the WHERE NOT EXISTS guard —
 * safe to re-run.
 *
 *   pnpm exec tsx scripts/backfill-salary-components.ts
 */
import { sql } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { tenants, salaryComponents } from '../src/db/schema/index.js'
import { buildDefaultSalaryComponentRows } from '../src/modules/salary-components/salary-components.defaults.js'

async function main() {
    const rows = await db
        .select({ id: tenants.id, name: tenants.name })
        .from(tenants)
        .where(sql`NOT EXISTS (SELECT 1 FROM salary_components sc WHERE sc.tenant_id = ${tenants.id})`)

    if (rows.length === 0) {
        console.log('No tenants need backfilling.')
        return
    }
    for (const t of rows) {
        const defaults = buildDefaultSalaryComponentRows(t.id)
        await db.insert(salaryComponents).values(defaults)
        console.log(`Seeded ${defaults.length} components for ${t.name} (${t.id})`)
    }
    console.log(`Done — backfilled ${rows.length} tenants.`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
