import { pgTable, uuid, text, integer, numeric, date, timestamp, jsonb, boolean, index, unique, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { users } from './users.js'
import { employees } from './employees.js'

export const recruitmentJobs = pgTable('recruitment_jobs', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    // Human-readable per-tenant requisition number, e.g. "JOB-0001". Generated
    // sequentially on create; shown in the admin listing and the portal referral
    // job picker. Unique per tenant (partial index below).
    jobNo: text('job_no'),
    title: text('title').notNull(),
    department: text('department'),
    location: text('location'),
    type: text('type').notNull().default('full_time')
        .$type<'full_time' | 'part_time' | 'contract'>(),
    status: text('status').notNull().default('draft')
        .$type<'draft' | 'open' | 'closed' | 'on_hold'>(),
    openings: integer('openings').notNull().default(1),
    minSalary: numeric('min_salary', { precision: 12, scale: 2 }),
    maxSalary: numeric('max_salary', { precision: 12, scale: 2 }),
    industry: text('industry'),
    description: text('description'),
    requirements: jsonb('requirements').default([]),
    closingDate: date('closing_date'),
    postedBy: uuid('posted_by').references(() => users.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    tenantIdx: index('idx_jobs_tenant').on(t.tenantId),
    statusIdx: index('idx_jobs_status').on(t.status),
    tenantStatusIdx: index('idx_jobs_tenant_status').on(t.tenantId, t.status),
    jobNoUniq: uniqueIndex('idx_jobs_tenant_no_uniq').on(t.tenantId, t.jobNo).where(sql`${t.jobNo} IS NOT NULL`),
}))

export const jobApplications = pgTable('job_applications', {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id').notNull().references(() => recruitmentJobs.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    nationality: text('nationality'),
    // Stage keys are per-tenant — admins can add/rename them in Organization
    // Settings → Recruitment Stages. Typed as plain string so user-defined
    // keys are accepted; the seven default keys are seeded for every tenant.
    stage: text('stage').notNull().default('received'),
    score: integer('score').default(0),
    experience: integer('experience'),
    expectedSalary: numeric('expected_salary', { precision: 12, scale: 2 }),
    currentSalary: numeric('current_salary', { precision: 12, scale: 2 }),
    resumeUrl: text('resume_url'),
    notes: text('notes'),
    appliedDate: date('applied_date').notNull().defaultNow(),
    // Origin of the candidate. 'direct' = added manually by HR; 'careers' =
    // applied through the public careers portal; 'referral' = submitted by an
    // employee through the portal referral flow.
    source: text('source').notNull().default('direct').$type<'direct' | 'referral' | 'careers'>(),
    // When source='referral', the employee who referred this candidate. Kept
    // denormalized on the application so the recruitment listing/kanban can
    // show a "Referred by" badge without joining the referrals table.
    referredByEmployeeId: uuid('referred_by_employee_id').references(() => employees.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    jobIdx: index('idx_applications_job').on(t.jobId),
    tenantIdx: index('idx_applications_tenant').on(t.tenantId),
    stageIdx: index('idx_applications_stage').on(t.stage),
    tenantStageIdx: index('idx_applications_tenant_stage').on(t.tenantId, t.stage),
    jobStageIdx: index('idx_applications_job_stage').on(t.jobId, t.stage),
    referrerIdx: index('idx_applications_referrer').on(t.referredByEmployeeId),
}))

export const recruitmentJobsRelations = relations(recruitmentJobs, ({ one, many }) => ({
    tenant: one(tenants, { fields: [recruitmentJobs.tenantId], references: [tenants.id] }),
    applications: many(jobApplications),
}))

export const jobApplicationsRelations = relations(jobApplications, ({ one }) => ({
    job: one(recruitmentJobs, { fields: [jobApplications.jobId], references: [recruitmentJobs.id] }),
    tenant: one(tenants, { fields: [jobApplications.tenantId], references: [tenants.id] }),
}))

// Per-tenant customisation of the recruitment pipeline stages.
//
// Stage keys are fixed (must match the `jobApplications.stage` union — adding /
// renaming keys would break candidate.stage references). What tenants customise
// is the user-facing label, the colour, and the display order. Terminal stages
// (e.g. rejected) are filtered out of the kanban board on the client.
export const recruitmentStages = pgTable('recruitment_stages', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    stageKey: text('stage_key').notNull(),
    label: text('label').notNull(),
    colorKey: text('color_key').notNull().default('slate'),
    stageOrder: integer('stage_order').notNull(),
    isTerminal: boolean('is_terminal').notNull().default(false),
    isFirst: boolean('is_first').notNull().default(false),
    isFinal: boolean('is_final').notNull().default(false),
    showInKanban: boolean('show_in_kanban').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    tenantStageKeyUniq: unique('recruitment_stages_tenant_key_unique').on(t.tenantId, t.stageKey),
    tenantIdx: index('idx_recruitment_stages_tenant').on(t.tenantId),
    tenantOrderIdx: index('idx_recruitment_stages_tenant_order').on(t.tenantId, t.stageOrder),
}))

export const recruitmentStagesRelations = relations(recruitmentStages, ({ one }) => ({
    tenant: one(tenants, { fields: [recruitmentStages.tenantId], references: [tenants.id] }),
}))

// Employee referrals — submitted from the employee portal against an open job.
// The portal's source of truth for "who referred whom". On submission we also
// create a `job_applications` row (tagged source='referral') so the candidate
// enters the normal recruitment pipeline immediately; `jobApplicationId` links
// the two so the employee can track the live stage of their referral.
export const referrals = pgTable('referrals', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id').notNull().references(() => recruitmentJobs.id, { onDelete: 'cascade' }),
    referredByEmployeeId: uuid('referred_by_employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    // The candidate created in the pipeline for this referral (1:1). Nullable +
    // set null so a deleted application doesn't erase the referral history.
    jobApplicationId: uuid('job_application_id').references(() => jobApplications.id, { onDelete: 'set null' }),
    candidateName: text('candidate_name').notNull(),
    candidateEmail: text('candidate_email').notNull(),
    candidatePhone: text('candidate_phone'),
    relationship: text('relationship'),
    notes: text('notes'),
    resumeUrl: text('resume_url'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    tenantIdx: index('idx_referrals_tenant').on(t.tenantId),
    referrerIdx: index('idx_referrals_referrer').on(t.referredByEmployeeId),
    jobIdx: index('idx_referrals_job').on(t.jobId),
    applicationIdx: index('idx_referrals_application').on(t.jobApplicationId),
    // No duplicate referrals: one live referral per (tenant, job, candidate
    // email). Partial — soft-deleted rows are excluded so a candidate can be
    // re-referred after a prior referral is removed. Emails are stored
    // lowercased by the route, so a plain-column index is case-correct.
    candidateUniq: uniqueIndex('idx_referrals_candidate_uniq')
        .on(t.tenantId, t.jobId, t.candidateEmail)
        .where(sql`${t.deletedAt} IS NULL`),
}))

export const referralsRelations = relations(referrals, ({ one }) => ({
    tenant: one(tenants, { fields: [referrals.tenantId], references: [tenants.id] }),
    job: one(recruitmentJobs, { fields: [referrals.jobId], references: [recruitmentJobs.id] }),
    referrer: one(employees, { fields: [referrals.referredByEmployeeId], references: [employees.id] }),
    application: one(jobApplications, { fields: [referrals.jobApplicationId], references: [jobApplications.id] }),
}))
