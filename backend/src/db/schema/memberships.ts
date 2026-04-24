import { pgTable, uuid, text, boolean, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql, relations } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { users } from './users.js'

/**
 * tenant_memberships — pivot table that lets one user belong to many tenants
 * with a per-tenant role. Pending invitations live as memberships in the
 * 'pending' state until accepted.
 */
export const tenantMemberships = pgTable('tenant_memberships', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    // userId is nullable while an invite is pending for an unknown email
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('employee')
        .$type<'super_admin' | 'hr_manager' | 'pro_officer' | 'dept_head' | 'employee'>(),
    inviteStatus: text('invite_status').notNull().default('accepted')
        .$type<'pending' | 'accepted' | 'revoked'>(),
    invitedEmail: text('invited_email'),
    invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
    inviteTokenHash: text('invite_token_hash').unique(),
    invitedAt: timestamp('invited_at', { withTimezone: true }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    tenantIdx: index('idx_tenant_memberships_tenant').on(t.tenantId),
    userIdx: index('idx_tenant_memberships_user').on(t.userId),
    tokenIdx: index('idx_tenant_memberships_token').on(t.inviteTokenHash),
    tenantActiveIdx: index('idx_tenant_memberships_tenant_active').on(t.tenantId, t.isActive),
    tenantStatusIdx: index('idx_tenant_memberships_tenant_status').on(t.tenantId, t.inviteStatus),
    userTenantUq: uniqueIndex('uq_tenant_memberships_user_tenant')
        .on(t.userId, t.tenantId)
        .where(sql`${t.userId} IS NOT NULL`),
}))

export const tenantMembershipsRelations = relations(tenantMemberships, ({ one }) => ({
    tenant: one(tenants, { fields: [tenantMemberships.tenantId], references: [tenants.id] }),
    user: one(users, { fields: [tenantMemberships.userId], references: [users.id] }),
    inviter: one(users, { fields: [tenantMemberships.invitedBy], references: [users.id] }),
}))
