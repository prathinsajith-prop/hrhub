import { pgTable, uuid, text, integer, numeric, date, timestamp, index, check } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { employees } from './employees.js'
import { visaApplications } from './visa.js'
import { users } from './users.js'

export const visaCosts = pgTable('visa_costs', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    visaApplicationId: uuid('visa_application_id').references(() => visaApplications.id, { onDelete: 'set null' }),
    employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    category: text('category').notNull().$type<'govt_fee' | 'medical' | 'typing' | 'translation' | 'other'>(),
    description: text('description'),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').notNull().default('AED'),
    paidDate: date('paid_date').notNull(),
    receiptRef: text('receipt_ref'),
    /**
     * Stage of the visa workflow this cost belongs to (1-based step index at
     * the moment the cost was recorded). Nullable for legacy rows captured
     * before stage tracking was introduced.
     */
    stepNumber: integer('step_number'),
    /** Human-readable step label snapshot, e.g. "Medical Fitness Test". */
    stepLabel: text('step_label'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
    index('idx_visa_costs_tenant').on(t.tenantId),
    index('idx_visa_costs_visa').on(t.visaApplicationId),
    index('idx_visa_costs_employee').on(t.employeeId),
    index('idx_visa_costs_paid_date').on(t.paidDate),
    index('idx_visa_costs_step').on(t.visaApplicationId, t.stepNumber),
    check('chk_visa_costs_amount_positive', sql`${t.amount} > 0`),
])

export const visaCostsRelations = relations(visaCosts, ({ one }) => ({
    tenant: one(tenants, { fields: [visaCosts.tenantId], references: [tenants.id] }),
    visaApplication: one(visaApplications, { fields: [visaCosts.visaApplicationId], references: [visaApplications.id] }),
    employee: one(employees, { fields: [visaCosts.employeeId], references: [employees.id] }),
    createdByUser: one(users, { fields: [visaCosts.createdBy], references: [users.id] }),
}))
