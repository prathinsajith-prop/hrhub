import { pgTable, uuid, text, integer, boolean, timestamp, date, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { users } from './users.js'
import { exitRequests } from './exit.js'
import { documentTemplates } from './document_templates.js'

// ─── 1. Preferences (singleton per tenant) ──────────────────────────────────
export const offboardingFlowSettings = pgTable('offboarding_flow_settings', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    noticePeriodEnabled: boolean('notice_period_enabled').notNull().default(true),
    noticePeriodValue: integer('notice_period_value').notNull().default(30),
    noticePeriodUnit: text('notice_period_unit').notNull().default('days').$type<'days' | 'months'>(),
    /** Array of user IDs serving as HR partners for offboarding. */
    hrPartnerUserIds: jsonb('hr_partner_user_ids').$type<string[]>().notNull().default([]),
    approvalReportingLevels: integer('approval_reporting_levels').notNull().default(1),
    approvalRequireHrPartner: boolean('approval_require_hr_partner').notNull().default(true),
    interviewIntroMessage: text('interview_intro_message'),
    interviewThankYouMessage: text('interview_thank_you_message'),
    workflowTrigger: text('workflow_trigger').notNull().default('on_request_added')
        .$type<'on_request_added' | 'on_approved' | 'on_relieving_date'>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
    tenantUnique: uniqueIndex('offboarding_flow_settings_tenant_id_key').on(t.tenantId),
}))

// ─── 2. Clearance templates ─────────────────────────────────────────────────
export const offboardingClearanceTemplates = pgTable('offboarding_clearance_templates', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    ownerType: text('owner_type').notNull().default('hr_partner')
        .$type<'hr_partner' | 'reporting_manager' | 'specific_user'>(),
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** Positive = days BEFORE relieving date. 0 = on relieving date. */
    startOffsetDays: integer('start_offset_days').notNull().default(30),
    endOffsetDays: integer('end_offset_days').notNull().default(0),
    position: integer('position').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
    tenantIdx: index('idx_offboarding_clearance_templates_tenant').on(t.tenantId, t.position),
}))

// ─── 3. Per-exit clearance instances ────────────────────────────────────────
export const exitClearanceItems = pgTable('exit_clearance_items', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    exitRequestId: uuid('exit_request_id').notNull().references(() => exitRequests.id, { onDelete: 'cascade' }),
    templateId: uuid('template_id').references(() => offboardingClearanceTemplates.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    description: text('description'),
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
    startDate: date('start_date'),
    dueDate: date('due_date'),
    status: text('status').notNull().default('pending')
        .$type<'pending' | 'in_progress' | 'completed' | 'waived'>(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    completedBy: uuid('completed_by').references(() => users.id, { onDelete: 'set null' }),
    notes: text('notes'),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
    tenantExitIdx: index('idx_exit_clearance_items_tenant_exit').on(t.tenantId, t.exitRequestId, t.position),
}))

// ─── 4. Exit-interview question catalog ─────────────────────────────────────
export const offboardingInterviewQuestions = pgTable('offboarding_interview_questions', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    questionText: text('question_text').notNull(),
    questionType: text('question_type').notNull().default('long_text')
        .$type<'short_text' | 'long_text' | 'rating' | 'single_choice' | 'multi_choice' | 'yes_no'>(),
    options: jsonb('options').$type<string[] | null>(),
    required: boolean('required').notNull().default(false),
    position: integer('position').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
    tenantIdx: index('idx_offboarding_interview_questions_tenant').on(t.tenantId, t.position),
}))

// ─── 5. Per-exit interview responses ────────────────────────────────────────
export const exitInterviewResponses = pgTable('exit_interview_responses', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    exitRequestId: uuid('exit_request_id').notNull().references(() => exitRequests.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id').references(() => offboardingInterviewQuestions.id, { onDelete: 'set null' }),
    questionSnapshot: text('question_snapshot').notNull(),
    answerText: text('answer_text'),
    answerValue: jsonb('answer_value'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
    exitIdx: index('idx_exit_interview_responses_exit').on(t.tenantId, t.exitRequestId),
}))

// ─── 6. Exit-document catalog ───────────────────────────────────────────────
export const offboardingExitDocuments = pgTable('offboarding_exit_documents', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /**
     * Per-document HTML body. Rendered through the same {{var}} substitution
     * pass used for workflow emails — see expandVariables() in
     * offboarding.service.ts. Optional so admins can keep just a name and
     * fill the body later.
     */
    bodyTemplate: text('body_template'),
    documentTemplateId: uuid('document_template_id').references(() => documentTemplates.id, { onDelete: 'set null' }),
    autoGenerate: boolean('auto_generate').notNull().default(false),
    required: boolean('required').notNull().default(false),
    position: integer('position').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
    tenantIdx: index('idx_offboarding_exit_documents_tenant').on(t.tenantId, t.position),
}))

// ─── 7. Workflow triggers (email + notification fan-out) ─────────────────
//
// `actions` carries the set of action types the workflow fans out into when
// its trigger fires. The 2026-05-25 migration 0071 introduced this array
// shape and dropped the legacy single-valued custom_function action — the
// sandboxed code runner was never finished and the column was kept only as
// a "stored, not executed" placeholder, so removing it simplifies the data
// model without losing real functionality.
//
// `actionType` stays as a backwards-compatibility shim that mirrors
// `actions[0]`. Reads/writes go through `actions`; `actionType` is kept
// populated so any straggling query still works while the new column is
// adopted.
export const offboardingWorkflows = pgTable('offboarding_workflows', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    trigger: text('trigger').notNull()
        .$type<'on_request_added' | 'on_approved' | 'on_rejected' | 'on_clearance_complete' | 'on_settlement_paid' | 'on_relieving_date'>(),
    // `actionType` retains the full historical union (incl. custom_function)
    // so legacy rows still type-narrow correctly. Only email_alert and
    // notification are exposed in the UI now — custom_function is hidden,
    // not removed, so any pre-existing rows continue to be readable.
    actionType: text('action_type').notNull()
        .$type<'email_alert' | 'notification' | 'custom_function'>(),
    actions: text('actions').array().notNull().default(sql`ARRAY['email_alert']::text[]`)
        .$type<('email_alert' | 'notification' | 'custom_function')[]>(),
    config: jsonb('config').$type<{
        recipients?: ('employee' | 'reporting_manager' | 'hr_partner' | 'custom')[]
        customEmails?: string[]
        subject?: string
        body?: string
        message?: string
        actionUrl?: string
    }>().notNull().default({}),
    enabled: boolean('enabled').notNull().default(true),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
    tenantTriggerIdx: index('idx_offboarding_workflows_tenant_trigger').on(t.tenantId, t.trigger),
}))
