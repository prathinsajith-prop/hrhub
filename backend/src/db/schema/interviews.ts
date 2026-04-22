import { pgTable, uuid, text, timestamp, boolean } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { jobApplications } from './recruitment'
import { users } from './users'

export const interviews = pgTable('interviews', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    applicationId: uuid('application_id').notNull().references(() => jobApplications.id, { onDelete: 'cascade' }),
    interviewerUserId: uuid('interviewer_user_id').references(() => users.id),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    durationMinutes: text('duration_minutes').notNull().default('60'),
    type: text('type').notNull().default('video').$type<'video' | 'phone' | 'in_person' | 'technical'>(),
    link: text('link'),
    location: text('location'),
    status: text('status').notNull().default('scheduled').$type<'scheduled' | 'completed' | 'cancelled' | 'no_show'>(),
    feedback: text('feedback'),
    rating: text('rating').$type<'1' | '2' | '3' | '4' | '5'>(),
    passed: boolean('passed'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
