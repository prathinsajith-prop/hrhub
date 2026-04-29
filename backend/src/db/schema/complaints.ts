import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { employees } from './employees.js'
import { users } from './users.js'

export const complaints = pgTable('complaints', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    submittedByEmployeeId: uuid('submitted_by_employee_id').references(() => employees.id, { onDelete: 'set null' }),
    subjectEmployeeId: uuid('subject_employee_id').references(() => employees.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    category: text('category').notNull()
        .$type<'harassment' | 'pay_dispute' | 'leave_dispute' | 'working_conditions' | 'discrimination' | 'other'>(),
    severity: text('severity').notNull()
        .$type<'low' | 'medium' | 'high' | 'critical'>(),
    confidentiality: text('confidentiality').notNull().default('confidential')
        .$type<'anonymous' | 'named' | 'confidential'>(),
    description: text('description').notNull(),
    status: text('status').notNull().default('draft')
        .$type<'draft' | 'submitted' | 'under_review' | 'escalated' | 'resolved'>(),
    assignedToId: uuid('assigned_to_id').references(() => users.id, { onDelete: 'set null' }),
    resolutionNotes: text('resolution_notes'),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    slaDueAt: timestamp('sla_due_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    index('idx_complaints_tenant').on(t.tenantId),
    index('idx_complaints_submitted_by').on(t.submittedByEmployeeId),
    index('idx_complaints_status').on(t.tenantId, t.status),
    index('idx_complaints_severity').on(t.tenantId, t.severity),
])

export const complaintsRelations = relations(complaints, ({ one }) => ({
    tenant: one(tenants, { fields: [complaints.tenantId], references: [tenants.id] }),
    submittedByEmployee: one(employees, { fields: [complaints.submittedByEmployeeId], references: [employees.id], relationName: 'complaint_submitter' }),
    subjectEmployee: one(employees, { fields: [complaints.subjectEmployeeId], references: [employees.id], relationName: 'complaint_subject' }),
    assignedTo: one(users, { fields: [complaints.assignedToId], references: [users.id] }),
}))
