import { pgTable, uuid, text, integer, primaryKey } from 'drizzle-orm/pg-core'
import { tenants } from './tenants.js'

export const employeeNoSequences = pgTable('employee_no_sequences', {
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    yearMonth: text('year_month').notNull(),
    lastSeq: integer('last_seq').notNull().default(0),
}, (t) => [
    primaryKey({ columns: [t.tenantId, t.yearMonth] }),
])
