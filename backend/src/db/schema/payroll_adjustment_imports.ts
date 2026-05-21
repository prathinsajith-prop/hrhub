import { pgTable, uuid, text, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { users } from './users.js'

/**
 * payroll_adjustment_imports — audit + recovery trail for bulk Excel uploads
 * to payroll_adjustments. One row per successful batch.
 *
 * Why we keep the original file:
 *  - HR can re-download to confirm exactly what was imported (auditor needs).
 *  - Disputes ("did this bonus row come from a spreadsheet I uploaded?") can
 *    be answered by hashing the questioned file against the stored hash.
 *  - If a future schema migration changes how rows are interpreted, we can
 *    replay the original sheet.
 *
 * Dedupe: the unique index on (tenantId, periodYear, periodMonth, fileHash)
 * means re-uploading the same file inside the same period is rejected with
 * a 409 at the route layer. Different periods or a re-saved file (different
 * bytes ⇒ different hash) are allowed through.
 */
export const payrollAdjustmentImports = pgTable('payroll_adjustment_imports', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    periodYear: integer('period_year').notNull(),
    periodMonth: integer('period_month').notNull(),
    category: text('category').notNull(),
    rowsCreated: integer('rows_created').notNull(),
    fileName: text('file_name').notNull(),
    fileSize: integer('file_size').notNull(),
    fileMime: text('file_mime').notNull(),
    fileS3Key: text('file_s3_key').notNull(),
    fileHash: text('file_hash').notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    tenantPeriodIdx: index('idx_payroll_adj_imports_tenant_period').on(t.tenantId, t.periodYear, t.periodMonth),
    tenantCreatedIdx: index('idx_payroll_adj_imports_tenant_created').on(t.tenantId, t.createdAt),
    dedupeUniq: uniqueIndex('uq_payroll_adj_imports_dedupe')
        .on(t.tenantId, t.periodYear, t.periodMonth, t.fileHash),
}))

export const payrollAdjustmentImportsRelations = relations(payrollAdjustmentImports, ({ one }) => ({
    tenant: one(tenants, { fields: [payrollAdjustmentImports.tenantId], references: [tenants.id] }),
    creator: one(users, { fields: [payrollAdjustmentImports.createdBy], references: [users.id] }),
}))
