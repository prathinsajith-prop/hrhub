import { pgTable, uuid, text, boolean, timestamp, index, integer } from 'drizzle-orm/pg-core'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
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
    // Account lockout — incremented on every failed login, reset on success
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    // TOTP two-factor authentication
    totpSecret: text('totp_secret'),
    twoFaEnabled: boolean('two_fa_enabled').notNull().default(false),
    // Hashed (bcrypt) single-use recovery codes for MFA fallback. Empty array when none active.
    twoFaBackupCodes: text('two_fa_backup_codes').array().notNull().default(sql`ARRAY[]::text[]`),
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

export const passwordResetTokens = pgTable('password_reset_tokens', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').unique().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    userIdx: index('idx_password_reset_tokens_user').on(t.userId),
}))

export const usersRelations = relations(users, ({ one, many }) => ({
    tenant: one(tenants, { fields: [users.tenantId], references: [tenants.id] }),
    refreshTokens: many(refreshTokens),
    passwordResetTokens: many(passwordResetTokens),
}))

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
    user: one(users, { fields: [refreshTokens.userId], references: [users.id] }),
}))

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
    user: one(users, { fields: [passwordResetTokens.userId], references: [users.id] }),
}))
