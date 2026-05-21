import { pgTable, uuid, text, boolean, numeric, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { users } from './users.js'

/**
 * salary_components — tenant-wide catalog of earning / deduction / benefit /
 * correction templates. See migration 0043 for the full design rationale.
 *
 * One row per template ("Housing Allowance", "Salary Advance", "Medical
 * Insurance" etc.). Templates are consumed by:
 *   - The payroll Adjustments tab — HR picks a component when adding a
 *     manual line item, so the dropdown shows the tenant's catalog rather
 *     than the hard-coded category list.
 *   - Future: recurring components can be auto-expanded into adjustments
 *     by runPayroll. Out of scope for the first cut.
 */
export const salaryComponents = pgTable('salary_components', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),

    kind: text('kind').notNull().$type<'earning' | 'deduction' | 'benefit' | 'correction'>(),
    category: text('category').notNull(),

    name: text('name').notNull(),
    nameInPayslip: text('name_in_payslip').notNull(),
    nameInPayslipAr: text('name_in_payslip_ar'),

    // Earning-only
    payType: text('pay_type').$type<'fixed' | 'variable' | null>(),
    calculationType: text('calculation_type').$type<'flat' | 'percentage_of_basic' | null>(),
    amount: numeric('amount', { precision: 12, scale: 2 }),
    proRata: boolean('pro_rata').notNull().default(true),
    applicableSocialSecurity: jsonb('applicable_social_security').notNull().default(sql`'[]'::jsonb`).$type<string[]>(),

    // Deduction / benefit / correction
    frequency: text('frequency').$type<'one_time' | 'recurring' | null>(),

    // Status
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

// Catalog enums exported as runtime constants so service + frontend type
// validators can share the source of truth. Adding a new category? Update
// here and the CHECK constraint in the migration that introduces it.
export const SALARY_COMPONENT_KINDS = ['earning', 'deduction', 'benefit', 'correction'] as const
export type SalaryComponentKind = typeof SALARY_COMPONENT_KINDS[number]

export const EARNING_CATEGORIES = [
    'basic', 'housing', 'transport', 'cost_of_living',
    'children_social', 'social', 'custom_allowance',
] as const

/** Earning categories that map to the legacy `employees.other_allowances`
 *  column. Anything in these categories rolls up into the single "other"
 *  bucket on the payslip and in the 4-field salary-revisions input. */
export const OTHER_EARNING_CATEGORIES = ['custom_allowance', 'cost_of_living'] as const

export const DEDUCTION_CATEGORIES = [
    'withheld_salary', 'salary_advance', 'fines_damages', 'notice_pay', 'custom',
] as const

export const BENEFIT_CATEGORIES = [
    'medical_insurance', 'custom',
] as const

export const CORRECTION_CATEGORIES = [
    'bonus', 'commission', 'leave_encashment', 'notice_pay',
    'annual_leave_salary', 'custom',
] as const

export const SOCIAL_SECURITY_SCHEMES = [
    'GPSSA', 'ADPF', 'GOSI', 'SIO', 'SPF', 'PIFSS', 'GRSIA',
] as const
