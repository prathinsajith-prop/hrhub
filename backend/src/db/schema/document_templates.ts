import { pgTable, uuid, text, integer, boolean, timestamp, index, jsonb } from 'drizzle-orm/pg-core'
import { tenants } from './tenants.js'
import { documents } from './documents.js'
import { users } from './users.js'

/**
 * Version history for each document — every upload creates a new version.
 */
export const documentVersions = pgTable('document_versions', {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull().default(1),
    s3Key: text('s3_key').notNull(),
    fileName: text('file_name').notNull(),
    fileSize: integer('file_size'),
    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    documentIdx: index('idx_doc_versions_document').on(t.documentId),
    tenantIdx: index('idx_doc_versions_tenant').on(t.tenantId),
}))

/**
 * Document template engine — templates with variable placeholders for generating PDF documents.
 */
export const documentTemplates = pgTable('document_templates', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    templateType: text('template_type').notNull()
        .$type<'offer_letter' | 'salary_certificate' | 'noc_letter' | 'experience_letter' | 'warning_letter' | 'termination_letter' | 'custom'>(),
    /** HTML/text body with {{variable}} placeholders */
    body: text('body').notNull(),
    /** JSON metadata: available variables, required fields, etc. */
    variables: jsonb('variables').$type<string[]>(),
    isActive: boolean('is_active').notNull().default(true),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    tenantIdx: index('idx_doc_templates_tenant').on(t.tenantId),
    typeIdx: index('idx_doc_templates_type').on(t.templateType),
}))
