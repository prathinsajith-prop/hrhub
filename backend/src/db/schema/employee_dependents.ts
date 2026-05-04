import { pgTable, uuid, text, date, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { employees } from './employees.js'
import { users } from './users.js'

export const employeeDependents = pgTable('employee_dependents', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    reference: text('reference').notNull(),
    name: text('name').notNull(),
    birthDate: date('birth_date'),
    relation: text('relation').notNull().$type<'spouse' | 'child' | 'parent' | 'sibling' | 'other'>(),
    nationality: text('nationality'),
    visaNumber: text('visa_number'),
    medicalInsurance: text('medical_insurance'),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdByName: text('created_by_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    uniqueIndex('idx_emp_dependents_reference').on(t.tenantId, t.reference),
    index('idx_emp_dependents_employee').on(t.employeeId),
    index('idx_emp_dependents_tenant').on(t.tenantId),
])

export const employeeDependentsRelations = relations(employeeDependents, ({ one }) => ({
    tenant: one(tenants, { fields: [employeeDependents.tenantId], references: [tenants.id] }),
    employee: one(employees, { fields: [employeeDependents.employeeId], references: [employees.id] }),
    createdBy: one(users, { fields: [employeeDependents.createdById], references: [users.id] }),
}))
