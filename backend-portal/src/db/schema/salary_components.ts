/**
 * ⚠ DUPLICATED from backend/src/db/schema/salary_components.ts
 * Keep this in sync with the main backend whenever the schema changes.
 * Migrations live in backend/migrations/ only — do not generate migrations here.
 *
 * The portal doesn't expose salary-component CRUD (HR-only feature in the
 * admin app), but we mirror the schema for the duplication rule's sake.
 */
import { pgTable, uuid, text, boolean, numeric, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { users } from './users.js'

export const salaryComponents = pgTable('salary_components', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().$type<'earning' | 'deduction' | 'benefit' | 'correction'>(),
    category: text('category').notNull(),
    name: text('name').notNull(),
    nameInPayslip: text('name_in_payslip').notNull(),
    nameInPayslipAr: text('name_in_payslip_ar'),
    payType: text('pay_type').$type<'fixed' | 'variable' | null>(),
    calculationType: text('calculation_type').$type<'flat' | 'percentage_of_basic' | null>(),
    amount: numeric('amount', { precision: 12, scale: 2 }),
    proRata: boolean('pro_rata').notNull().default(true),
    applicableSocialSecurity: jsonb('applicable_social_security').notNull().default(sql`'[]'::jsonb`).$type<string[]>(),
    frequency: text('frequency').$type<'one_time' | 'recurring' | null>(),
    isActive: boolean('is_active').notNull().default(true),
    isSystem: boolean('is_system').notNull().default(false),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    nameUniq: uniqueIndex('uq_salary_components_tenant_kind_name')
        .on(t.tenantId, t.kind, sql`lower(${t.name})`),
    tenantKindIdx: index('idx_salary_components_tenant_kind')
        .on(t.tenantId, t.kind)
        .where(sql`is_active = true`),
}))

export const salaryComponentsRelations = relations(salaryComponents, ({ one }) => ({
    tenant: one(tenants, { fields: [salaryComponents.tenantId], references: [tenants.id] }),
    creator: one(users, { fields: [salaryComponents.createdBy], references: [users.id] }),
}))
