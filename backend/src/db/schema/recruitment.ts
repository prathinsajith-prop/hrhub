import { pgTable, uuid, text, integer, numeric, date, timestamp, jsonb, index } from 'drizzle-orm/pg-core'
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
}))

export const jobApplications = pgTable('job_applications', {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id').notNull().references(() => recruitmentJobs.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    nationality: text('nationality'),
    stage: text('stage').notNull().default('received')
        .$type<'received' | 'screening' | 'interview' | 'assessment' | 'offer' | 'pre_boarding' | 'rejected'>(),
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
}))

export const recruitmentJobsRelations = relations(recruitmentJobs, ({ one, many }) => ({
    tenant: one(tenants, { fields: [recruitmentJobs.tenantId], references: [tenants.id] }),
    applications: many(jobApplications),
}))

export const jobApplicationsRelations = relations(jobApplications, ({ one }) => ({
    job: one(recruitmentJobs, { fields: [jobApplications.jobId], references: [recruitmentJobs.id] }),
    tenant: one(tenants, { fields: [jobApplications.tenantId], references: [tenants.id] }),
}))
