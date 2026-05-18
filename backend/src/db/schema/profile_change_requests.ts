import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { employees } from './employees.js'
import { users } from './users.js'

// Employee-initiated profile changes that require HR / manager review before
// being written onto the employees row. The proposed delta + current snapshot
// are stored as JSONB so the table doesn't need to grow a column every time a
// new field becomes editable from the portal.
//
// Lifecycle:
//   employee submits  → status='pending', proposed_changes + current_snapshot frozen
//   reviewer approves → status='approved', verified_fields list, UPDATE employees
//                       runs in the same transaction
//   reviewer rejects  → status='rejected', rejection_reason recorded
//
// `category` lets the same table cover bank, personal, contact etc. without
// adding new tables. Each category is just a known set of fields the portal
// allows in proposed_changes.
export const profileChangeRequests = pgTable('profile_change_requests', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    category: text('category').notNull().$type<'bank_details' | 'personal' | 'contact'>(),
    status: text('status').notNull().default('pending').$type<'pending' | 'approved' | 'rejected'>(),
    proposedChanges: jsonb('proposed_changes').notNull().$type<Record<string, string | null>>(),
    currentSnapshot: jsonb('current_snapshot').notNull().$type<Record<string, string | null>>(),
    verifiedFields: jsonb('verified_fields').$type<string[]>(),
    reviewerNotes: text('reviewer_notes'),
    rejectionReason: text('rejection_reason'),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    index('idx_pcr_tenant').on(t.tenantId),
    index('idx_pcr_employee').on(t.employeeId),
    index('idx_pcr_tenant_status').on(t.tenantId, t.status),
    index('idx_pcr_tenant_employee').on(t.tenantId, t.employeeId),
])

export const profileChangeRequestsRelations = relations(profileChangeRequests, ({ one }) => ({
    tenant: one(tenants, { fields: [profileChangeRequests.tenantId], references: [tenants.id] }),
    employee: one(employees, { fields: [profileChangeRequests.employeeId], references: [employees.id] }),
    requestedByUser: one(users, { fields: [profileChangeRequests.requestedBy], references: [users.id] }),
    reviewedByUser: one(users, { fields: [profileChangeRequests.reviewedBy], references: [users.id] }),
}))
