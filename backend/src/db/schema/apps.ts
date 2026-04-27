import { pgTable, uuid, text, timestamp, bigint, integer, index } from 'drizzle-orm/pg-core'
import { sql, relations } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { users } from './users.js'

/**
 * connected_apps — tenant-scoped API keys for programmatic access from
 * external applications. Plain `appSecret` is returned exactly once at
 * creation/regeneration; only the bcrypt hash is stored.
 */
export const connectedApps = pgTable('connected_apps', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    /** Public key shown in the UI, e.g. `app_live_xxxxxxxxxxxx`. */
    appKey: text('app_key').notNull().unique(),
    /** bcrypt hash of the secret. */
    secretHash: text('secret_hash').notNull(),
    scopes: text('scopes').array().notNull().default(sql`ARRAY[]::text[]`),
    ipAllowlist: text('ip_allowlist').array().notNull().default(sql`ARRAY[]::text[]`),
    status: text('status').notNull().default('active').$type<'active' | 'revoked'>(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    requestCount: bigint('request_count', { mode: 'number' }).notNull().default(0),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    tenantIdx: index('idx_connected_apps_tenant').on(t.tenantId),
    statusIdx: index('idx_connected_apps_status').on(t.tenantId, t.status),
}))

export const connectedAppsRelations = relations(connectedApps, ({ one }) => ({
    tenant: one(tenants, { fields: [connectedApps.tenantId], references: [tenants.id] }),
    creator: one(users, { fields: [connectedApps.createdBy], references: [users.id] }),
}))

/**
 * app_request_logs — one row per authenticated ext API call.
 * Powers the analytics charts in Connected Apps → App Detail.
 */
export const appRequestLogs = pgTable('app_request_logs', {
    id: uuid('id').primaryKey().defaultRandom(),
    appId: uuid('app_id').notNull().references(() => connectedApps.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull(),
    method: text('method').notNull(),
    path: text('path').notNull(),
    statusCode: integer('status_code').notNull(),
    latencyMs: integer('latency_ms'),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    appTimeIdx: index('idx_app_req_logs_app_time').on(t.appId, t.createdAt),
    tenantTimeIdx: index('idx_app_req_logs_tenant_time').on(t.tenantId, t.createdAt),
    statusIdx: index('idx_app_req_logs_status').on(t.appId, t.statusCode),
}))
