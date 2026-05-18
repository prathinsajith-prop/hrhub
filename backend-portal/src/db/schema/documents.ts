// ⚠ DUPLICATED from backend/src/db/schema/documents.ts
// Keep this in sync with the main backend whenever the schema changes.
// Migrations live in backend/migrations/ only — do not generate migrations here.
//
// NOTE: the main backend's schema has a FK on `stepId → onboardingSteps.id`.
// The portal doesn't mirror the `onboardingSteps` table (the onboarding module
// isn't in the portal's curated surface), so we drop the FK here and keep
// the column as a plain uuid. PostgreSQL still has the FK at the DB level
// — Drizzle just doesn't enforce it at the type layer in this service.

import { pgTable, uuid, text, boolean, bigint, date, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { employees } from './employees.js'
import { users } from './users.js'

export const documents = pgTable('documents', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').references(() => employees.id, { onDelete: 'set null' }),
    // Onboarding-step FK exists in the DB; not modelled here (portal has no onboarding module).
    stepId: uuid('step_id'),
    category: text('category').notNull()
        .$type<'identity' | 'visa' | 'company' | 'employment' | 'insurance' | 'qualification' | 'financial' | 'compliance'>(),
    docType: text('doc_type').notNull(),
    fileName: text('file_name').notNull(),
    s3Key: text('s3_key'),
    fileSize: bigint('file_size', { mode: 'number' }),
    docNumber: text('doc_number'),
    issueDate: date('issue_date'),
    expiryDate: date('expiry_date'),
    notes: text('notes'),
    status: text('status').notNull().default('pending_upload')
        .$type<'valid' | 'expiring_soon' | 'expired' | 'pending_upload' | 'under_review' | 'rejected'>(),
    verified: boolean('verified').notNull().default(false),
    verifiedBy: uuid('verified_by').references(() => users.id),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    rejectedBy: uuid('rejected_by').references(() => users.id),
    uploadedBy: uuid('uploaded_by').references(() => users.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    tenantIdx: index('idx_documents_tenant').on(t.tenantId),
    employeeIdx: index('idx_documents_employee').on(t.employeeId),
    expiryIdx: index('idx_documents_expiry').on(t.expiryDate),
    statusIdx: index('idx_documents_status').on(t.status),
    tenantCategoryIdx: index('idx_documents_tenant_category').on(t.tenantId, t.category),
    tenantStatusIdx: index('idx_documents_tenant_status').on(t.tenantId, t.status),
    tenantEmployeeIdx: index('idx_documents_tenant_employee').on(t.tenantId, t.employeeId),
}))

export const documentsRelations = relations(documents, ({ one }) => ({
    tenant: one(tenants, { fields: [documents.tenantId], references: [tenants.id] }),
    employee: one(employees, { fields: [documents.employeeId], references: [employees.id] }),
    verifiedByUser: one(users, { fields: [documents.verifiedBy], references: [users.id] }),
}))
