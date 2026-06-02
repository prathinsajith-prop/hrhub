// ⚠ DUPLICATED from backend/src/db/schema/announcements.ts
// Keep in sync with the main backend. Migrations live in backend/migrations/ only.

import { pgTable, uuid, text, boolean, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { users } from './users.js'
import { employees } from './employees.js'

// ── Announcements ─────────────────────────────────────────────────────────────
// Centralized internal communication. An announcement targets an audience (one
// or more rules in announcement_audiences); employees who match ANY rule see it.
// Per-employee view/read/acknowledge state lives in announcement_receipts.
export const announcements = pgTable('announcements', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    // Rich HTML body (sanitized on the client). Plain text also works.
    body: text('body').notNull().default(''),
    // Configurable category key (general / hr_policy / holiday / event / org_news /
    // recognition / emergency / system_maintenance / payroll / recruitment /
    // training / custom-*). Free text so tenants can add their own.
    category: text('category').notNull().default('general'),
    priority: text('priority').notNull().default('normal').$type<'low' | 'normal' | 'high' | 'critical'>(),
    status: text('status').notNull().default('draft').$type<'draft' | 'scheduled' | 'published' | 'expired' | 'archived'>(),
    // 'all' = whole org; 'targeted' = resolved via announcement_audiences rows.
    audienceType: text('audience_type').notNull().default('all').$type<'all' | 'targeted'>(),
    pinned: boolean('pinned').notNull().default(false),
    requireAck: boolean('require_ack').notNull().default(false),
    // File metadata: [{ name, s3Key, size, mime }]. Files live in S3.
    attachments: jsonb('attachments').$type<Array<{ name: string; s3Key: string; size?: number; mime?: string }>>().default([]),
    // Scheduling window. publishAt set when status='scheduled'; the scheduler
    // flips it to 'published' at that time. expireAt flips to 'expired'.
    publishAt: timestamp('publish_at', { withTimezone: true }),
    expireAt: timestamp('expire_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    authorName: text('author_name'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    tenantIdx: index('idx_announcements_tenant').on(t.tenantId),
    statusIdx: index('idx_announcements_tenant_status').on(t.tenantId, t.status),
    pinnedIdx: index('idx_announcements_pinned').on(t.tenantId, t.pinned),
    scheduleIdx: index('idx_announcements_publish_at').on(t.publishAt),
    expireIdx: index('idx_announcements_expire_at').on(t.expireAt),
}))

// One row per targeting rule. audienceKind='all' → everyone (audienceValue null).
// Otherwise audienceValue holds the matched id/value (branchId, teamId, grade id,
// contractType, work location, designation name, or employee id).
export const announcementAudiences = pgTable('announcement_audiences', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    announcementId: uuid('announcement_id').notNull().references(() => announcements.id, { onDelete: 'cascade' }),
    audienceKind: text('audience_kind').notNull()
        .$type<'all' | 'branch' | 'division' | 'department' | 'team' | 'designation' | 'grade' | 'employment_type' | 'location' | 'employee'>(),
    audienceValue: text('audience_value'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    announcementIdx: index('idx_ann_audiences_announcement').on(t.announcementId),
    lookupIdx: index('idx_ann_audiences_lookup').on(t.tenantId, t.audienceKind, t.audienceValue),
}))

// Per-employee engagement: viewed (feed render), read (opened detail),
// acknowledged ("I have read this"). One row per (announcement, employee).
export const announcementReceipts = pgTable('announcement_receipts', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    announcementId: uuid('announcement_id').notNull().references(() => announcements.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    viewedAt: timestamp('viewed_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    uniqueReceipt: uniqueIndex('uq_ann_receipt').on(t.announcementId, t.employeeId),
    announcementIdx: index('idx_ann_receipts_announcement').on(t.announcementId),
    employeeIdx: index('idx_ann_receipts_employee').on(t.tenantId, t.employeeId),
}))

export const announcementsRelations = relations(announcements, ({ one, many }) => ({
    tenant: one(tenants, { fields: [announcements.tenantId], references: [tenants.id] }),
    audiences: many(announcementAudiences),
    receipts: many(announcementReceipts),
}))

export const announcementAudiencesRelations = relations(announcementAudiences, ({ one }) => ({
    announcement: one(announcements, { fields: [announcementAudiences.announcementId], references: [announcements.id] }),
}))

export const announcementReceiptsRelations = relations(announcementReceipts, ({ one }) => ({
    announcement: one(announcements, { fields: [announcementReceipts.announcementId], references: [announcements.id] }),
}))
