import { pgTable, uuid, text, integer, timestamp, date } from 'drizzle-orm/pg-core'
import { tenants } from './tenants.js'
import { employees } from './employees.js'
import { users } from './users.js'

export const performanceReviews = pgTable('performance_reviews', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').notNull().references(() => employees.id),
    reviewerId: uuid('reviewer_id').references(() => users.id),
    period: text('period').notNull(), // e.g., "2024-Q1"
    reviewDate: date('review_date'),
    status: text('status').notNull().default('draft').$type<'draft' | 'submitted' | 'acknowledged' | 'completed'>(),
    overallRating: integer('overall_rating'), // 1-5
    // KPIs
    qualityScore: integer('quality_score'),
    productivityScore: integer('productivity_score'),
    teamworkScore: integer('teamwork_score'),
    attendanceScore: integer('attendance_score'),
    initiativeScore: integer('initiative_score'),
    // Text fields
    strengths: text('strengths'),
    improvements: text('improvements'),
    goals: text('goals'),
    managerComments: text('manager_comments'),
    employeeComments: text('employee_comments'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
})
