import { pgTable, uuid, text, boolean, integer, timestamp, jsonb, index, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { onboardingSteps, onboardingChecklists } from './onboarding.js'
import { employees } from './employees.js'
import { users } from './users.js'
import { documents } from './documents.js'

// ─── Required documents per onboarding step ──────────────────────────────────
export const onboardingStepRequiredDocs = pgTable('onboarding_step_required_docs', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    stepId: uuid('step_id').notNull().references(() => onboardingSteps.id, { onDelete: 'cascade' }),
    category: text('category').notNull()
        .$type<'identity' | 'visa' | 'company' | 'employment' | 'insurance' | 'qualification' | 'financial' | 'compliance'>(),
    docType: text('doc_type').notNull(),
    expiryRequired: boolean('expiry_required').notNull().default(false),
    isMandatory: boolean('is_mandatory').notNull().default(true),
    hint: text('hint'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    stepIdx: index('idx_required_docs_step').on(t.stepId),
    tenantIdx: index('idx_required_docs_tenant').on(t.tenantId),
    uniq: unique('onboarding_required_docs_unique').on(t.stepId, t.category, t.docType),
}))

// ─── Revocable upload tokens ─────────────────────────────────────────────────
export const onboardingUploadTokens = pgTable('onboarding_upload_tokens', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    checklistId: uuid('checklist_id').notNull().references(() => onboardingChecklists.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    issuedBy: uuid('issued_by').references(() => users.id, { onDelete: 'set null' }),
    issuedToEmail: text('issued_to_email').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: uuid('revoked_by').references(() => users.id, { onDelete: 'set null' }),
    viewCount: integer('view_count').notNull().default(0),
    uploadCount: integer('upload_count').notNull().default(0),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    lastUsedIp: text('last_used_ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    checklistIdx: index('idx_upload_tokens_checklist').on(t.checklistId),
    tenantIdx: index('idx_upload_tokens_tenant').on(t.tenantId),
    activeIdx: index('idx_upload_tokens_active').on(t.checklistId, t.revokedAt, t.expiresAt),
}))

// ─── Document audit log ──────────────────────────────────────────────────────
export const documentAuditLog = pgTable('document_audit_log', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
    action: text('action').notNull()
        .$type<'uploaded' | 'viewed' | 'downloaded' | 'verified' | 'rejected' | 'deleted' | 'status_changed' | 'metadata_updated'>(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    actorLabel: text('actor_label'),
    details: jsonb('details'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    docIdx: index('idx_doc_audit_document').on(t.documentId, t.createdAt),
    tenantIdx: index('idx_doc_audit_tenant').on(t.tenantId, t.createdAt),
}))

// ─── Relations ───────────────────────────────────────────────────────────────
export const onboardingStepRequiredDocsRelations = relations(onboardingStepRequiredDocs, ({ one }) => ({
    tenant: one(tenants, { fields: [onboardingStepRequiredDocs.tenantId], references: [tenants.id] }),
    step: one(onboardingSteps, { fields: [onboardingStepRequiredDocs.stepId], references: [onboardingSteps.id] }),
}))

export const onboardingUploadTokensRelations = relations(onboardingUploadTokens, ({ one }) => ({
    tenant: one(tenants, { fields: [onboardingUploadTokens.tenantId], references: [tenants.id] }),
    checklist: one(onboardingChecklists, { fields: [onboardingUploadTokens.checklistId], references: [onboardingChecklists.id] }),
    employee: one(employees, { fields: [onboardingUploadTokens.employeeId], references: [employees.id] }),
    issuer: one(users, { fields: [onboardingUploadTokens.issuedBy], references: [users.id] }),
    revoker: one(users, { fields: [onboardingUploadTokens.revokedBy], references: [users.id] }),
}))

export const documentAuditLogRelations = relations(documentAuditLog, ({ one }) => ({
    tenant: one(tenants, { fields: [documentAuditLog.tenantId], references: [tenants.id] }),
    document: one(documents, { fields: [documentAuditLog.documentId], references: [documents.id] }),
    actor: one(users, { fields: [documentAuditLog.actorId], references: [users.id] }),
}))
