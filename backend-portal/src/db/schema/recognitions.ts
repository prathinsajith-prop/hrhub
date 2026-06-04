// ⚠ DUPLICATED from backend/src/db/schema/recognitions.ts
// Keep in sync with the main backend. Migrations live in backend/migrations/ only.
// The recognition tables are created by the admin backend's migrations; the
// portal shares the same database and only needs these definitions to query.

import { pgTable, uuid, text, boolean, timestamp, integer, jsonb, date, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { tenants } from './tenants.js'
import { users } from './users.js'
import { employees } from './employees.js'
import { teams } from './teams.js'
import { orgUnits } from './orgUnits.js'

// ── Recognition Categories ───────────────────────────────────────────────────
export const recognitionCategories = pgTable('recognition_categories', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    label: text('label').notNull(),
    description: text('description'),
    icon: text('icon').notNull().default('award'),
    color: text('color').notNull().default('#6366f1'),
    isDefault: boolean('is_default').notNull().default(false),
    isArchived: boolean('is_archived').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    uqKey: uniqueIndex('uq_recognition_categories_tenant_key').on(t.tenantId, t.key),
    activeIdx: index('idx_recognition_categories_active').on(t.tenantId, t.isArchived),
}))

// ── Recognition Badges ───────────────────────────────────────────────────────
export const recognitionBadges = pgTable('recognition_badges', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    label: text('label').notNull(),
    description: text('description'),
    icon: text('icon').notNull().default('medal'),
    color: text('color').notNull().default('#f59e0b'),
    level: text('level').notNull().default('bronze').$type<'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'>(),
    categoryKey: text('category_key'),
    defaultPoints: integer('default_points').notNull().default(0),
    isArchived: boolean('is_archived').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    uqKey: uniqueIndex('uq_recognition_badges_tenant_key').on(t.tenantId, t.key),
    activeIdx: index('idx_recognition_badges_active').on(t.tenantId, t.isArchived),
}))

// ── Recognitions ─────────────────────────────────────────────────────────────
export const recognitions = pgTable('recognitions', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    giverUserId: uuid('giver_user_id').references(() => users.id, { onDelete: 'set null' }),
    giverEmployeeId: uuid('giver_employee_id').references(() => employees.id, { onDelete: 'set null' }),
    giverName: text('giver_name'),
    categoryKey: text('category_key').notNull().default('great_work'),
    badgeKey: text('badge_key'),
    title: text('title').notNull(),
    message: text('message').notNull(),
    achievementDate: date('achievement_date'),
    visibility: text('visibility').notNull().default('public')
        .$type<'public' | 'team' | 'department' | 'branch' | 'manager' | 'hr' | 'private'>(),
    visibilityScopeId: text('visibility_scope_id'),
    nominationType: text('nomination_type').notNull().default('peer')
        .$type<'peer' | 'manager' | 'leadership' | 'self_nomination' | 'employee_of_month'>(),
    points: integer('points').notNull().default(0),
    attachments: jsonb('attachments').$type<Array<{ name: string; s3Key: string; size?: number; mime?: string }>>().default([]),
    status: text('status').notNull().default('published')
        .$type<'draft' | 'pending' | 'approved' | 'rejected' | 'published' | 'archived'>(),
    workflowState: text('workflow_state').$type<'manager_review' | 'hr_approval' | 'completed' | null>(),
    commentsDisabled: boolean('comments_disabled').notNull().default(false),
    isPinned: boolean('is_pinned').notNull().default(false),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    tenantIdx: index('idx_recognitions_tenant').on(t.tenantId),
    statusIdx: index('idx_recognitions_tenant_status').on(t.tenantId, t.status),
    giverIdx: index('idx_recognitions_giver').on(t.tenantId, t.giverEmployeeId),
    categoryIdx: index('idx_recognitions_category').on(t.tenantId, t.categoryKey),
    createdIdx: index('idx_recognitions_created').on(t.tenantId, t.createdAt),
    publishedIdx: index('idx_recognitions_published').on(t.tenantId, t.publishedAt),
}))

// ── Recipients (employees) ───────────────────────────────────────────────────
export const recognitionRecipients = pgTable('recognition_recipients', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    recognitionId: uuid('recognition_id').notNull().references(() => recognitions.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    isPrimary: boolean('is_primary').notNull().default(false),
    pointsAwarded: integer('points_awarded').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    uqRecipient: uniqueIndex('uq_recognition_recipient').on(t.recognitionId, t.employeeId),
    employeeIdx: index('idx_recognition_recipients_employee').on(t.tenantId, t.employeeId),
}))

// ── Team targets ─────────────────────────────────────────────────────────────
export const recognitionTeamTargets = pgTable('recognition_team_targets', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    recognitionId: uuid('recognition_id').notNull().references(() => recognitions.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    uqTeam: uniqueIndex('uq_rec_team_target').on(t.recognitionId, t.teamId),
    teamIdx: index('idx_rec_team_targets_team').on(t.tenantId, t.teamId),
}))

// ── Department targets (org_units) ───────────────────────────────────────────
export const recognitionDeptTargets = pgTable('recognition_dept_targets', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    recognitionId: uuid('recognition_id').notNull().references(() => recognitions.id, { onDelete: 'cascade' }),
    orgUnitId: uuid('org_unit_id').notNull().references(() => orgUnits.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    uqUnit: uniqueIndex('uq_rec_dept_target').on(t.recognitionId, t.orgUnitId),
    unitIdx: index('idx_rec_dept_targets_unit').on(t.tenantId, t.orgUnitId),
}))

// ── Reactions ────────────────────────────────────────────────────────────────
export const recognitionReactions = pgTable('recognition_reactions', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    recognitionId: uuid('recognition_id').notNull().references(() => recognitions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    reactionType: text('reaction_type').notNull()
        .$type<'like' | 'celebrate' | 'love' | 'support' | 'congrats'>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    uqReaction: uniqueIndex('uq_recognition_reaction').on(t.recognitionId, t.userId),
    recognitionIdx: index('idx_recognition_reactions_recognition').on(t.recognitionId),
}))

// ── Comments ─────────────────────────────────────────────────────────────────
export const recognitionComments = pgTable('recognition_comments', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    recognitionId: uuid('recognition_id').notNull().references(() => recognitions.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    authorName: text('author_name'),
    body: text('body').notNull(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletedByUserId: uuid('deleted_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    recognitionIdx: index('idx_recognition_comments_recognition').on(t.recognitionId, t.createdAt),
    parentIdx: index('idx_recognition_comments_parent').on(t.parentId),
}))

// ── Points ledger ────────────────────────────────────────────────────────────
export const recognitionPoints = pgTable('recognition_points', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').references(() => employees.id, { onDelete: 'set null' }),
    recognitionId: uuid('recognition_id').references(() => recognitions.id, { onDelete: 'set null' }),
    points: integer('points').notNull(),
    type: text('type').notNull().$type<'earned' | 'given' | 'granted' | 'redeemed' | 'reversed'>(),
    description: text('description'),
    balanceAfter: integer('balance_after'),
    createdByUserId: uuid('created_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    userIdx: index('idx_recognition_points_user').on(t.tenantId, t.userId, t.createdAt),
    employeeIdx: index('idx_recognition_points_employee').on(t.tenantId, t.employeeId),
    typeIdx: index('idx_recognition_points_type').on(t.tenantId, t.type),
}))

// ── Approvals trail ──────────────────────────────────────────────────────────
export const recognitionApprovals = pgTable('recognition_approvals', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    recognitionId: uuid('recognition_id').notNull().references(() => recognitions.id, { onDelete: 'cascade' }),
    approverUserId: uuid('approver_user_id').references(() => users.id, { onDelete: 'set null' }),
    approverName: text('approver_name'),
    step: text('step').notNull().default('manager').$type<'manager' | 'hr' | 'system'>(),
    action: text('action').notNull().$type<'approve' | 'reject' | 'hold' | 'return' | 'submit' | 'publish'>(),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    recognitionIdx: index('idx_recognition_approvals_recognition').on(t.recognitionId, t.createdAt),
}))
