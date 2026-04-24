import { pgTable, uuid, text, date, numeric, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { employees } from './employees.js'
import { users } from './users.js'

/**
 * salary_revisions — immutable salary change log per employee.
 * Written whenever an employee's basic or total salary is updated,
 * providing a full audit trail for labour-law compliance and reporting.
 */
export const salaryRevisions = pgTable('salary_revisions', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    effectiveDate: date('effective_date').notNull(),
    revisionType: text('revision_type').notNull().default('increment')
        .$type<'increment' | 'decrement' | 'promotion' | 'annual_review' | 'probation_completion' | 'correction'>(),
    previousBasicSalary: numeric('previous_basic_salary', { precision: 12, scale: 2 }),
    newBasicSalary: numeric('new_basic_salary', { precision: 12, scale: 2 }).notNull(),
    previousTotalSalary: numeric('previous_total_salary', { precision: 12, scale: 2 }),
    newTotalSalary: numeric('new_total_salary', { precision: 12, scale: 2 }),
    reason: text('reason'),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    tenantIdx: index('idx_salary_revisions_tenant').on(t.tenantId),
    employeeIdx: index('idx_salary_revisions_employee').on(t.employeeId),
    effectiveDateIdx: index('idx_salary_revisions_effective').on(t.employeeId, t.effectiveDate),
}))

export const salaryRevisionsRelations = relations(salaryRevisions, ({ one }) => ({
    tenant: one(tenants, { fields: [salaryRevisions.tenantId], references: [tenants.id] }),
    employee: one(employees, { fields: [salaryRevisions.employeeId], references: [employees.id] }),
    approvedByUser: one(users, { fields: [salaryRevisions.approvedBy], references: [users.id] }),
}))
