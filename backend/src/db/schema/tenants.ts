import { pgTable, uuid, text, boolean, timestamp, jsonb, integer } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users.js'
import { employees } from './employees.js'

export const tenants = pgTable('tenants', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    companyCode: text('company_code').unique(),
    tradeLicenseNo: text('trade_license_no').unique().notNull(),
    jurisdiction: text('jurisdiction').notNull().$type<'mainland' | 'freezone'>(),
    industryType: text('industry_type').notNull(),
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
    }>().notNull().default({ rolloverEnabledFrom: null }),
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
})

export const tenantsRelations = relations(tenants, ({ many }) => ({
    entities: many(entities),
    users: many(users),
    employees: many(employees),
}))

export const entitiesRelations = relations(entities, ({ one, many }) => ({
    tenant: one(tenants, { fields: [entities.tenantId], references: [tenants.id] }),
    employees: many(employees),
}))
