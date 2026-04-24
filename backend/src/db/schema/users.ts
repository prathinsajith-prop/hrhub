import { pgTable, uuid, text, boolean, timestamp, index, integer, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { employees } from './employees.js'

export const users = pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    entityId: uuid('entity_id'),
    // Optional 1:1 link to the employees table. Nullable because not every
    // user is an employee (super_admin, integration accounts, parent-company
    // auditors). FK + UNIQUE(employee_id) WHERE NOT NULL added in
    // migration 0014.
    employeeId: uuid('employee_id').references(() => employees.id, { onDelete: 'set null' }),
    // Email is unique per-tenant (not globally) so the same human can belong
    // to multiple tenants. Enforced by uq_users_tenant_email_ci in
    // migration 0011 — case-insensitive on LOWER(email).
    email: text('email').notNull(),
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
    // Case-insensitive lookup for login flow.
    emailLowerIdx: index('idx_users_email_ci').on(sql`LOWER(${t.email})`),
    // Tenant-scoped unique email (case-insensitive).
    tenantEmailUq: uniqueIndex('uq_users_tenant_email_ci')
        .on(t.tenantId, sql`LOWER(${t.email})`),
    // One user account per employee (within a tenant).
    employeeUq: uniqueIndex('uq_users_employee_id')
        .on(t.employeeId)
        .where(sql`${t.employeeId} IS NOT NULL`),
    tenantEmployeeIdx: index('idx_users_tenant_employee')
        .on(t.tenantId, t.employeeId)
        .where(sql`${t.employeeId} IS NOT NULL`),
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
    employee: one(employees, { fields: [users.employeeId], references: [employees.id] }),
    refreshTokens: many(refreshTokens),
    passwordResetTokens: many(passwordResetTokens),
}))

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
    user: one(users, { fields: [refreshTokens.userId], references: [users.id] }),
}))

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
    user: one(users, { fields: [passwordResetTokens.userId], references: [users.id] }),
}))
