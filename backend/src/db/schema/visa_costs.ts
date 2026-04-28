import { pgTable, uuid, text, numeric, date, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
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
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    tenantIdx: index('idx_visa_costs_tenant').on(t.tenantId),
    visaIdx: index('idx_visa_costs_visa').on(t.visaApplicationId),
    employeeIdx: index('idx_visa_costs_employee').on(t.employeeId),
    paidDateIdx: index('idx_visa_costs_paid_date').on(t.paidDate),
}))

export const visaCostsRelations = relations(visaCosts, ({ one }) => ({
    tenant: one(tenants, { fields: [visaCosts.tenantId], references: [tenants.id] }),
    visaApplication: one(visaApplications, { fields: [visaCosts.visaApplicationId], references: [visaApplications.id] }),
    employee: one(employees, { fields: [visaCosts.employeeId], references: [employees.id] }),
    createdByUser: one(users, { fields: [visaCosts.createdBy], references: [users.id] }),
}))
