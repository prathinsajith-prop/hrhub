import { pgTable, uuid, text, boolean, timestamp, index, jsonb, inet } from 'drizzle-orm/pg-core'
import { users } from './users'
import { tenants } from './tenants'

/**
 * Records every auth event: login success/fail, logout, password change, token refresh.
 * Stores IP, user-agent, device/browser/OS parsed info, and geolocation if available.
 */
export const loginHistory = pgTable('login_history', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    /** email attempted — useful for failed logins where userId may be null */
    email: text('email'),
    eventType: text('event_type').notNull()
        .$type<'login' | 'logout' | 'failed_login' | 'password_change' | 'password_reset' | 'token_refresh' | '2fa_success' | '2fa_failed'>(),
    success: boolean('success').notNull().default(true),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    /** Parsed from user-agent */
    browser: text('browser'),
    browserVersion: text('browser_version'),
    os: text('os'),
    osVersion: text('os_version'),
    deviceType: text('device_type').$type<'desktop' | 'mobile' | 'tablet' | 'unknown'>(),
    /** ISO 3166-1 alpha-2 */
    country: text('country'),
    city: text('city'),
    /** Failure reason if success=false */
    failureReason: text('failure_reason'),
    /** Session token hash prefix (first 8 chars) for correlation */
    sessionRef: text('session_ref'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    userIdx: index('idx_login_history_user').on(t.userId),
    tenantIdx: index('idx_login_history_tenant').on(t.tenantId),
    createdAtIdx: index('idx_login_history_created').on(t.createdAt),
    eventIdx: index('idx_login_history_event').on(t.eventType),
}))

/**
 * Comprehensive audit trail for every create/update/delete/view action.
 */
export const activityLogs = pgTable('activity_logs', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    /** Human-readable actor name (snapshot at time of action) */
    actorName: text('actor_name'),
    actorRole: text('actor_role'),
    /** e.g. 'employee', 'visa', 'leave', 'payroll', 'document', 'user', 'recruitment' */
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    /** Human-readable entity name (snapshot) */
    entityName: text('entity_name'),
    action: text('action').notNull()
        .$type<'create' | 'update' | 'delete' | 'view' | 'approve' | 'reject' | 'submit' | 'export' | 'import' | 'login' | 'logout'>(),
    /** JSON diff: {field: {from: x, to: y}} */
    changes: jsonb('changes').$type<Record<string, { from: unknown; to: unknown }>>(),
    /** Any additional context */
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    tenantIdx: index('idx_activity_logs_tenant').on(t.tenantId),
    userIdx: index('idx_activity_logs_user').on(t.userId),
    entityIdx: index('idx_activity_logs_entity').on(t.entityType, t.entityId),
    createdIdx: index('idx_activity_logs_created').on(t.createdAt),
}))
