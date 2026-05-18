// ⚠ DUPLICATED from backend/src/db/schema/profile_change_requests.ts
// Keep this in sync with the main backend whenever the schema changes.
// Migrations live in backend/migrations/ only — do not generate migrations here.

import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core'
import { tenants } from './tenants.js'
import { employees } from './employees.js'
import { users } from './users.js'

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
