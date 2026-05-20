/**
 * ⚠ DUPLICATED from backend/src/db/schema/payroll_adjustments.ts
 * Keep this in sync with the main backend whenever the schema changes.
 * Migrations live in backend/migrations/ only — do not generate migrations here.
 *
 * The portal currently does not expose adjustments routes (HR-only feature),
 * but we mirror the schema so the duplication rule stays consistent and so
 * future portal endpoints (e.g. "my payroll adjustments" for an employee
 * self-view) can wire in without a separate schema migration.
 */
import { pgTable, uuid, text, integer, numeric, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { employees } from './employees.js'
import { users } from './users.js'

export const payrollAdjustments = pgTable('payroll_adjustments', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    periodYear: integer('period_year').notNull(),
    periodMonth: integer('period_month').notNull(),
    kind: text('kind').notNull().$type<'addition' | 'deduction'>(),
    category: text('category').notNull().$type<
        | 'overtime'
        | 'commission'
        | 'bonus'
        | 'loan_repayment'
        | 'salary_advance'
        | 'unpaid_leave'
        | 'sick_half_pay'
        | 'manual'
    >(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    notes: text('notes'),
    source: text('source').notNull().default('manual').$type<
        'manual' | 'leave_engine' | 'loan_engine' | 'expense_engine'
    >(),
    sourceRef: uuid('source_ref'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    tenantPeriodIdx: index('idx_payroll_adj_tenant_period').on(t.tenantId, t.periodYear, t.periodMonth),
    tenantEmpPeriodIdx: index('idx_payroll_adj_tenant_employee_period')
        .on(t.tenantId, t.employeeId, t.periodYear, t.periodMonth),
    autoUniq: uniqueIndex('uq_payroll_adj_auto')
        .on(t.tenantId, t.employeeId, t.periodYear, t.periodMonth, t.category, t.sourceRef)
        .where(sql`source_ref IS NOT NULL`),
}))

export const payrollAdjustmentsRelations = relations(payrollAdjustments, ({ one }) => ({
    tenant: one(tenants, { fields: [payrollAdjustments.tenantId], references: [tenants.id] }),
    employee: one(employees, { fields: [payrollAdjustments.employeeId], references: [employees.id] }),
    creator: one(users, { fields: [payrollAdjustments.createdBy], references: [users.id] }),
}))
