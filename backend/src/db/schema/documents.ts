import { pgTable, uuid, text, boolean, bigint, date, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { employees } from './employees.js'
import { users } from './users.js'
import { onboardingSteps } from './onboarding.js'

export const documents = pgTable('documents', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').references(() => employees.id, { onDelete: 'set null' }),
    // Optional link to an onboarding step (set when uploaded via magic link or step-upload UI)
    stepId: uuid('step_id').references(() => onboardingSteps.id, { onDelete: 'set null' }),
    category: text('category').notNull()
        .$type<'identity' | 'visa' | 'company' | 'employment' | 'insurance' | 'qualification' | 'financial' | 'compliance'>(),
    docType: text('doc_type').notNull(),
    fileName: text('file_name').notNull(),
    s3Key: text('s3_key'),
    fileSize: bigint('file_size', { mode: 'number' }),
    expiryDate: date('expiry_date'),
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
    stepIdx: index('idx_documents_step').on(t.stepId),
    expiryIdx: index('idx_documents_expiry').on(t.expiryDate),
    statusIdx: index('idx_documents_status').on(t.status),
}))

export const documentsRelations = relations(documents, ({ one }) => ({
    tenant: one(tenants, { fields: [documents.tenantId], references: [tenants.id] }),
    employee: one(employees, { fields: [documents.employeeId], references: [employees.id] }),
    step: one(onboardingSteps, { fields: [documents.stepId], references: [onboardingSteps.id] }),
    verifiedByUser: one(users, { fields: [documents.verifiedBy], references: [users.id] }),
}))
