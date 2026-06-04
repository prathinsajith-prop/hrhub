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
    // Employment-contract type. The DB column is plain text — the union is a
    // TypeScript hint only — so widening the union doesn't need a migration.
    // Internship/temporary/freelance were added with migration 0078.
    type: text('type').notNull().default('full_time')
        .$type<'full_time' | 'part_time' | 'contract' | 'internship' | 'temporary' | 'freelance'>(),
    // Where the work happens. Independent of employment-contract type.
    workplaceType: text('workplace_type').notNull().default('on_site')
        .$type<'on_site' | 'hybrid' | 'remote'>(),
    status: text('status').notNull().default('draft')
        .$type<'draft' | 'open' | 'closed' | 'on_hold'>(),
    openings: integer('openings').notNull().default(1),
    // Minimum years of professional experience the role expects. Optional —
    // null means HR hasn't set a floor. Surfaced in the admin job detail page
    // and the public careers detail page so applicants self-screen.
    experienceYears: integer('experience_years'),
    minSalary: numeric('min_salary', { precision: 12, scale: 2 }),
    maxSalary: numeric('max_salary', { precision: 12, scale: 2 }),
    industry: text('industry'),
    description: text('description'),
    requirements: jsonb('requirements').default([]),
    // Free-text skill tags (e.g. "TypeScript", "Negotiation"). Stored as a
    // jsonb string[] — searchable via @> for facet queries.
    skills: jsonb('skills').$type<string[]>().notNull().default([]),
    // Qualification bullets (e.g. "Bachelor's in CS", "PMP certified"). Same
    // shape as skills — distinct semantic, separate UI section.
    qualifications: jsonb('qualifications').$type<string[]>().notNull().default([]),
    closingDate: date('closing_date'),
    postedBy: uuid('posted_by').references(() => users.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    tenantIdx: index('idx_jobs_tenant').on(t.tenantId),
    statusIdx: index('idx_jobs_status').on(t.status),
    tenantStatusIdx: index('idx_jobs_tenant_status').on(t.tenantId, t.status),
    workplaceIdx: index('idx_jobs_workplace').on(t.tenantId, t.workplaceType),
    jobNoUniq: uniqueIndex('idx_jobs_tenant_no_uniq').on(t.tenantId, t.jobNo).where(sql`${t.jobNo} IS NOT NULL`),
    // Serves the jobs list: WHERE tenant ORDER BY created_at DESC (backward scan).
    tenantCreatedIdx: index('idx_jobs_tenant_created').on(t.tenantId, t.createdAt),
}))

export const jobApplications = pgTable('job_applications', {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id').notNull().references(() => recruitmentJobs.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    nationality: text('nationality'),
    // Address + gender added with migration 0081 for richer applicant profiles.
    address: text('address'),
    gender: text('gender').$type<'male' | 'female' | 'other' | 'prefer_not_to_say' | null>(),
    // Stage keys are per-tenant — admins can add/rename them in Organization
    // Settings → Recruitment Stages. Typed as plain string so user-defined
    // keys are accepted; the seven default keys are seeded for every tenant.
    stage: text('stage').notNull().default('received'),
    score: integer('score').default(0),
    /** Total years of experience (integer). The detailed role-by-role history
     *  lives in `experienceHistory` (jsonb) — keep both, they answer different
     *  questions (years for filtering vs entries for the profile timeline). */
    experience: integer('experience'),
    expectedSalary: numeric('expected_salary', { precision: 12, scale: 2 }),
    currentSalary: numeric('current_salary', { precision: 12, scale: 2 }),
    /** Schools/degrees attended. Each entry: { school, degree?, fieldOfStudy?,
     *  startDate?, endDate?, current?, summary? }. */
    educationHistory: jsonb('education_history')
        .$type<Array<{ school: string; degree?: string; fieldOfStudy?: string; startDate?: string; endDate?: string; current?: boolean; summary?: string }>>()
        .notNull().default([]),
    /** Past job roles. Each entry: { title, company?, industry?, summary?,
     *  startDate?, endDate?, current? }. */
    experienceHistory: jsonb('experience_history')
        .$type<Array<{ title: string; company?: string; industry?: string; summary?: string; startDate?: string; endDate?: string; current?: boolean }>>()
        .notNull().default([]),
    /** Candidate skill tags (e.g. ["TypeScript", "Negotiation"]). Captured from
     *  the apply form / HR dialog / referral, or auto-extracted from the résumé.
     *  Mirrors recruitmentJobs.skills but describes the applicant, not the role. */
    skills: jsonb('skills').$type<string[]>().notNull().default([]),
    resumeUrl: text('resume_url'),
    // Candidate photo (S3 key) — auto-extracted from the résumé on apply, or
    // uploaded manually. Served as a presigned `avatar` URL by the service.
    avatarUrl: text('avatar_url'),
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
    // Serves the candidates list: WHERE tenant ORDER BY created_at DESC (backward scan).
    tenantCreatedIdx: index('idx_applications_tenant_created').on(t.tenantId, t.createdAt),
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

// ─── Recruitment tag catalogs (skills / qualifications) ───────────────────────
// Per-tenant vocabulary powering the type-ahead suggestions in the job
// create/edit dialogs and every résumé-upload area. Curated ONLY from the job
// screens (the upsert runs in createJob/updateJob); candidate/referral/careers
// forms read these but never add to them. Case-insensitively unique per tenant
// (see the uq_* indexes in migration 0088) which double as the upsert conflict
// target — kept as separate tables so each catalog is independently queryable.
export const recruitmentSkills = pgTable('recruitment_skills', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    tenantNameIdx: index('idx_recruitment_skills_tenant_name').on(t.tenantId, t.name),
    tenantNameUniq: uniqueIndex('uq_recruitment_skills_tenant_name').on(t.tenantId, sql`lower(${t.name})`),
}))

export const recruitmentQualifications = pgTable('recruitment_qualifications', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    tenantNameIdx: index('idx_recruitment_qualifications_tenant_name').on(t.tenantId, t.name),
    tenantNameUniq: uniqueIndex('uq_recruitment_qualifications_tenant_name').on(t.tenantId, sql`lower(${t.name})`),
}))

export const recruitmentSkillsRelations = relations(recruitmentSkills, ({ one }) => ({
    tenant: one(tenants, { fields: [recruitmentSkills.tenantId], references: [tenants.id] }),
}))

export const recruitmentQualificationsRelations = relations(recruitmentQualifications, ({ one }) => ({
    tenant: one(tenants, { fields: [recruitmentQualifications.tenantId], references: [tenants.id] }),
}))
