// ⚠ DUPLICATED from backend/src/db/schema/recruitment.ts
// Keep this in sync with the main backend whenever the schema changes.
// Migrations live in backend/migrations/ only — do not generate migrations here.

import { pgTable, uuid, text, integer, numeric, date, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { users } from './users.js'
import { employees } from './employees.js'

export const recruitmentJobs = pgTable('recruitment_jobs', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    jobNo: text('job_no'),
    title: text('title').notNull(),
    department: text('department'),
    location: text('location'),
    // Employment-contract type. The DB column is plain text — the union is a
    // TypeScript hint only — so widening the union doesn't need a migration.
    type: text('type').notNull().default('full_time')
        .$type<'full_time' | 'part_time' | 'contract' | 'internship' | 'temporary' | 'freelance'>(),
    // Where the work happens. Independent of employment-contract type.
    workplaceType: text('workplace_type').notNull().default('on_site')
        .$type<'on_site' | 'hybrid' | 'remote'>(),
    status: text('status').notNull().default('draft')
        .$type<'draft' | 'open' | 'closed' | 'on_hold'>(),
    openings: integer('openings').notNull().default(1),
    minSalary: numeric('min_salary', { precision: 12, scale: 2 }),
    maxSalary: numeric('max_salary', { precision: 12, scale: 2 }),
    industry: text('industry'),
    description: text('description'),
    requirements: jsonb('requirements').default([]),
    // Free-text skill tags. Stored as a jsonb string[].
    skills: jsonb('skills').$type<string[]>().notNull().default([]),
    // Qualification bullets. Same shape as skills; distinct semantic.
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
    // Serves the jobs list: WHERE tenant ORDER BY created_at DESC.
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
    // Migration 0081 — keep in sync with backend/src/db/schema/recruitment.ts.
    address: text('address'),
    gender: text('gender').$type<'male' | 'female' | 'other' | 'prefer_not_to_say' | null>(),
    stage: text('stage').notNull().default('received'),
    score: integer('score').default(0),
    experience: integer('experience'),
    expectedSalary: numeric('expected_salary', { precision: 12, scale: 2 }),
    currentSalary: numeric('current_salary', { precision: 12, scale: 2 }),
    /** Schools attended (jsonb string[] of structured entries). */
    educationHistory: jsonb('education_history')
        .$type<Array<{ school: string; degree?: string; fieldOfStudy?: string; startDate?: string; endDate?: string; current?: boolean; summary?: string }>>()
        .notNull().default([]),
    /** Past job roles (jsonb string[] of structured entries). */
    experienceHistory: jsonb('experience_history')
        .$type<Array<{ title: string; company?: string; industry?: string; summary?: string; startDate?: string; endDate?: string; current?: boolean }>>()
        .notNull().default([]),
    /** Candidate skill tags (jsonb string[]) — migration 0086. */
    skills: jsonb('skills').$type<string[]>().notNull().default([]),
    resumeUrl: text('resume_url'),
    // Candidate photo (S3 key) — auto-extracted from the résumé on referral/apply.
    avatarUrl: text('avatar_url'),
    notes: text('notes'),
    appliedDate: date('applied_date').notNull().defaultNow(),
    source: text('source').notNull().default('direct').$type<'direct' | 'referral' | 'careers'>(),
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
    // Serves the candidates list: WHERE tenant ORDER BY created_at DESC.
    tenantCreatedIdx: index('idx_applications_tenant_created').on(t.tenantId, t.createdAt),
}))

// Employee referrals — see backend/src/db/schema/recruitment.ts for full docs.
export const referrals = pgTable('referrals', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id').notNull().references(() => recruitmentJobs.id, { onDelete: 'cascade' }),
    referredByEmployeeId: uuid('referred_by_employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
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
