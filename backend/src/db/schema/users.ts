import { pgTable, uuid, text, boolean, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants'

export const users = pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    entityId: uuid('entity_id'),
    email: text('email').unique().notNull(),
    passwordHash: text('password_hash').notNull(),
    name: text('name').notNull(),
    role: text('role').notNull().default('employee')
        .$type<'super_admin' | 'hr_manager' | 'pro_officer' | 'dept_head' | 'employee'>(),
    department: text('department'),
    avatarUrl: text('avatar_url'),
    isActive: boolean('is_active').notNull().default(true),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    tenantIdx: index('idx_users_tenant').on(t.tenantId),
    emailIdx: index('idx_users_email').on(t.email),
}))

export const refreshTokens = pgTable('refresh_tokens', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').unique().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    userIdx: index('idx_refresh_tokens_user').on(t.userId),
}))

export const usersRelations = relations(users, ({ one, many }) => ({
    tenant: one(tenants, { fields: [users.tenantId], references: [tenants.id] }),
    refreshTokens: many(refreshTokens),
}))

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
    user: one(users, { fields: [refreshTokens.userId], references: [users.id] }),
}))
