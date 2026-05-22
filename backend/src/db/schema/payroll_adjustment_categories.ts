import { pgTable, uuid, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { users } from './users.js'

/**
 * payroll_adjustment_categories — per-tenant custom labels that augment the
 * 8 built-in categories. Built-ins (overtime, commission, bonus, manual, etc.)
 * stay in code because runPayroll's totals math switches on their names.
 * Custom categories pool into the generic addition / deduction buckets per
 * their `kind` field.
 */
export const payrollAdjustmentCategories = pgTable('payroll_adjustment_categories', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    value: text('value').notNull(),
    label: text('label').notNull(),
    kind: text('kind').notNull().$type<'addition' | 'deduction'>(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    tenantIdx: index('idx_payroll_adj_categories_tenant').on(t.tenantId),
    tenantValueUniq: uniqueIndex('uq_payroll_adj_categories_tenant_value').on(t.tenantId, t.value),
}))

export const payrollAdjustmentCategoriesRelations = relations(payrollAdjustmentCategories, ({ one }) => ({
    tenant: one(tenants, { fields: [payrollAdjustmentCategories.tenantId], references: [tenants.id] }),
    creator: one(users, { fields: [payrollAdjustmentCategories.createdBy], references: [users.id] }),
}))
