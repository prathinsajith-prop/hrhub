import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { employees } from './employees.js'
import { users } from './users.js'

export const employeeNotes = pgTable('employee_notes', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdByName: text('created_by_name'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    index('idx_emp_notes_tenant').on(t.tenantId),
    index('idx_emp_notes_employee').on(t.employeeId),
    index('idx_emp_notes_tenant_employee').on(t.tenantId, t.employeeId),
])

export const employeeNotesRelations = relations(employeeNotes, ({ one }) => ({
    tenant: one(tenants, { fields: [employeeNotes.tenantId], references: [tenants.id] }),
    employee: one(employees, { fields: [employeeNotes.employeeId], references: [employees.id] }),
    createdBy: one(users, { fields: [employeeNotes.createdById], references: [users.id] }),
}))
