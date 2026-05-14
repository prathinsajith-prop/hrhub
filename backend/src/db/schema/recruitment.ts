import { pgTable, uuid, text, integer, numeric, date, timestamp, jsonb, boolean, index, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { users } from './users.js'

export const recruitmentJobs = pgTable('recruitment_jobs', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
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
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    jobIdx: index('idx_applications_job').on(t.jobId),
    tenantIdx: index('idx_applications_tenant').on(t.tenantId),
    stageIdx: index('idx_applications_stage').on(t.stage),
    tenantStageIdx: index('idx_applications_tenant_stage').on(t.tenantId, t.stage),
    jobStageIdx: index('idx_applications_job_stage').on(t.jobId, t.stage),
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
