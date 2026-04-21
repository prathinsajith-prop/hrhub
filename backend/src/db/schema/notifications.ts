import { pgTable, uuid, text, boolean, jsonb, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants'
import { users } from './users'

export const notifications = pgTable('notifications', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull().$type<'info' | 'warning' | 'error' | 'success'>(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    actionUrl: text('action_url'),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    tenantIdx: index('idx_notifications_tenant').on(t.tenantId),
    userIdx: index('idx_notifications_user').on(t.userId),
    readIdx: index('idx_notifications_read').on(t.isRead),
}))

export const auditLogs = pgTable('audit_logs', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    userId: uuid('user_id').references(() => users.id),
    action: text('action').notNull(),
    entityType: text('entity_type'),
    entityId: uuid('entity_id'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    tenantIdx: index('idx_audit_tenant').on(t.tenantId),
    createdAtIdx: index('idx_audit_created').on(t.createdAt),
}))

export const notificationsRelations = relations(notifications, ({ one }) => ({
    tenant: one(tenants, { fields: [notifications.tenantId], references: [tenants.id] }),
    user: one(users, { fields: [notifications.userId], references: [users.id] }),
}))

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
    tenant: one(tenants, { fields: [auditLogs.tenantId], references: [tenants.id] }),
    user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}))
