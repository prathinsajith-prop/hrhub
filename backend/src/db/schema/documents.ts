import { pgTable, uuid, text, boolean, bigint, date, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants'
import { employees } from './employees'
import { users } from './users'

export const documents = pgTable('documents', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').references(() => employees.id, { onDelete: 'set null' }),
    category: text('category').notNull()
        .$type<'identity' | 'visa' | 'company' | 'employment' | 'insurance' | 'qualification' | 'financial' | 'compliance'>(),
    docType: text('doc_type').notNull(),
    fileName: text('file_name').notNull(),
    s3Key: text('s3_key'),
    fileSize: bigint('file_size', { mode: 'number' }),
    expiryDate: date('expiry_date'),
    status: text('status').notNull().default('pending_upload')
        .$type<'valid' | 'expiring_soon' | 'expired' | 'pending_upload' | 'under_review'>(),
    verified: boolean('verified').notNull().default(false),
    verifiedBy: uuid('verified_by').references(() => users.id),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    uploadedBy: uuid('uploaded_by').references(() => users.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    tenantIdx: index('idx_documents_tenant').on(t.tenantId),
    employeeIdx: index('idx_documents_employee').on(t.employeeId),
    expiryIdx: index('idx_documents_expiry').on(t.expiryDate),
    statusIdx: index('idx_documents_status').on(t.status),
}))

export const documentsRelations = relations(documents, ({ one }) => ({
    tenant: one(tenants, { fields: [documents.tenantId], references: [tenants.id] }),
    employee: one(employees, { fields: [documents.employeeId], references: [employees.id] }),
    verifiedByUser: one(users, { fields: [documents.verifiedBy], references: [users.id] }),
}))
