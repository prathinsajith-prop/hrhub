// ⚠ DUPLICATED from backend/src/db/schema/tenants.ts
// Keep this in sync with the main backend whenever the schema changes.
// Migrations live in backend/migrations/ only — do not generate migrations here.

import { pgTable, uuid, text, boolean, timestamp, jsonb, integer, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users.js'
import { employees } from './employees.js'

export const tenants = pgTable('tenants', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    companyCode: text('company_code').unique(),
    tradeLicenseNo: text('trade_license_no').unique().notNull(),
    // UAE business type — mainland or freezone. Historically named
    // `jurisdiction` in the schema; renamed in migration 0051 so the column
    // matches what the signup page collects ("Business Type").
    businessType: text('business_type').notNull().$type<'mainland' | 'freezone'>(),
    industryType: text('industry_type').notNull(),
    // Org Profile fields surfaced in Settings → Organization Profile.
    // `phone` (further below) is the company phone — added at signup.
    address: text('address'),
    companyEmail: text('company_email'),
    companyWebsite: text('company_website'),
    subscriptionPlan: text('subscription_plan').notNull().default('starter')
        .$type<'starter' | 'growth' | 'enterprise'>(),
    // Maximum active employees allowed. NULL = unlimited (enterprise only).
    // starter default = 5, growth = custom (set by sales on upgrade), enterprise = null
    employeeQuota: integer('employee_quota').default(5),
    phone: text('phone'),
    companySize: text('company_size'),
    subscriptionExpiresAt: timestamp('subscription_expires_at', { withTimezone: true }),
    logoUrl: text('logo_url'),
    ipAllowlist: text('ip_allowlist').array().default([]),
    regionalSettings: jsonb('regional_settings').$type<{
        timezone: string
        currency: string
        dateFormat: string
    }>().notNull().default({ timezone: 'Asia/Dubai', currency: 'AED', dateFormat: 'DD/MM/YYYY' }),
    securitySettings: jsonb('security_settings').$type<{
        sessionTimeoutMinutes: number
        auditLoggingEnabled: boolean
    }>().notNull().default({ sessionTimeoutMinutes: 480, auditLoggingEnabled: true }),
    leaveSettings: jsonb('leave_settings').$type<{
        rolloverEnabledFrom: string | null
        weekOffDays?: string[]
        workingWeekStart?: string
    }>().notNull().default({ rolloverEnabledFrom: null, weekOffDays: ['saturday', 'sunday'], workingWeekStart: 'monday' }),
    // Master kill-switch for outbound email. When false sendEmail() returns
    // early — useful for paused tenants, sandboxes, and staging. Per-user
    // notification preferences (notificationsPrefs) still apply BELOW this
    // gate; this is the tenant-wide override.
    notificationsEnabled: boolean('notifications_enabled').notNull().default(true),
    // Org-wide default visibility for sensitive fields surfaced on
    // dashboards and the employee directory. Defaults to all-visible to
    // match historical behaviour; HR can opt the entire org out from
    // Settings → Organization Policy. Employees can further opt themselves
    // out via employees.privacy_overrides (their choice wins).
    privacyPolicy: jsonb('privacy_policy').$type<{
        showBirthday: boolean
        showWorkAnniversary: boolean
        showMobile: boolean
        searchableInDirectory: boolean
    }>().notNull().default({ showBirthday: true, showWorkAnniversary: true, showMobile: true, searchableInDirectory: true }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const entities = pgTable('entities', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    entityName: text('entity_name').notNull(),
    licenseType: text('license_type'),
    freeZoneId: text('free_zone_id'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    tenantIdx: index('idx_entities_tenant').on(t.tenantId),
}))

export const tenantsRelations = relations(tenants, ({ many }) => ({
    entities: many(entities),
    users: many(users),
    employees: many(employees),
}))

export const entitiesRelations = relations(entities, ({ one, many }) => ({
    tenant: one(tenants, { fields: [entities.tenantId], references: [tenants.id] }),
    employees: many(employees),
}))
