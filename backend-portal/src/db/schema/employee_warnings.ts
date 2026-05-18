// ⚠ DUPLICATED from backend/src/db/schema/employee_warnings.ts
// Keep this in sync with the main backend whenever the schema changes.
// Migrations live in backend/migrations/ only — do not generate migrations here.
//
// Portal only reads from this table (employee viewing own warnings, manager
// viewing a team member's warnings). No writes.

import { pgTable, uuid, text, date, timestamp, index } from 'drizzle-orm/pg-core'
import { tenants } from './tenants.js'
import { employees } from './employees.js'
import { users } from './users.js'

export const employeeWarnings = pgTable('employee_warnings', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    issueDate: date('issue_date').notNull(),
    expiryDate: date('expiry_date'),
    reason: text('reason'),
    documentS3Key: text('document_s3_key'),
    documentFileName: text('document_file_name'),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdByName: text('created_by_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    index('idx_emp_warnings_tenant').on(t.tenantId),
    index('idx_emp_warnings_employee').on(t.employeeId),
    index('idx_emp_warnings_tenant_employee').on(t.tenantId, t.employeeId),
])
