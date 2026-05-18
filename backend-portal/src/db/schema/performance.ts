// ⚠ DUPLICATED from backend/src/db/schema/performance.ts
// Keep this in sync with the main backend whenever the schema changes.
// Migrations live in backend/migrations/ only — do not generate migrations here.
//
// Portal only reads from this table (employee seeing their own reviews,
// manager seeing a team member's reviews). No writes.

import { pgTable, uuid, text, integer, timestamp, date, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { employees } from './employees.js'
import { users } from './users.js'

export const performanceReviews = pgTable('performance_reviews', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').notNull().references(() => employees.id),
    reviewerId: uuid('reviewer_id').references(() => users.id),
    period: text('period').notNull(),
    reviewDate: date('review_date'),
    status: text('status').notNull().default('draft').$type<'draft' | 'submitted' | 'acknowledged' | 'completed'>(),
    overallRating: integer('overall_rating'),
    qualityScore: integer('quality_score'),
    productivityScore: integer('productivity_score'),
    teamworkScore: integer('teamwork_score'),
    attendanceScore: integer('attendance_score'),
    initiativeScore: integer('initiative_score'),
    strengths: text('strengths'),
    improvements: text('improvements'),
    goals: text('goals'),
    managerComments: text('manager_comments'),
    employeeComments: text('employee_comments'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
    index('idx_perf_reviews_tenant').on(t.tenantId),
    index('idx_perf_reviews_tenant_status').on(t.tenantId, t.status),
    index('idx_perf_reviews_tenant_employee').on(t.tenantId, t.employeeId),
    index('idx_perf_reviews_tenant_active').on(t.tenantId, t.employeeId).where(sql`deleted_at IS NULL`),
])
