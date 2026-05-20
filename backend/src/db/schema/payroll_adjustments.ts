import { pgTable, uuid, text, integer, numeric, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { employees } from './employees.js'
import { users } from './users.js'

/**
 * payroll_adjustments — the single source of truth for everything that
 * shifts a payslip away from the employee's contractual base salary.
 *
 * Every addition (overtime, commission, bonus) and every deduction
 * (loan repayment, manual deduction, plus the auto-computed unpaid_leave
 * and sick_half_pay) is one row here. runPayroll() reads this table by
 * (tenantId, year, month), groups by employee + category, and writes the
 * resulting totals into the payslip columns.
 *
 * Automated sources (leave engine, loan engine) populate rows via
 * `source = 'leave_engine' | 'loan_engine'` and a non-null `sourceRef`
 * pointing back to the originating leave_request_id or loan_id. The unique
 * index on (tenant, employee, year, month, category, sourceRef) — partial
 * on `sourceRef IS NOT NULL` — guarantees idempotency: re-syncing the same
 * period is a no-op (or upserts the amount).
 *
 * HR-created rows always have `source = 'manual'` and `sourceRef = NULL`.
 * Postgres treats multiple NULLs as not-equal in a unique index, so two
 * distinct "bonus" rows for the same employee/month are still allowed —
 * the HR user gets to add as many lines as they want.
 */
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
    // Partial unique index for automated dedupe — see file header.
    autoUniq: uniqueIndex('uq_payroll_adj_auto')
        .on(t.tenantId, t.employeeId, t.periodYear, t.periodMonth, t.category, t.sourceRef)
        .where(sql`source_ref IS NOT NULL`),
}))

export const payrollAdjustmentsRelations = relations(payrollAdjustments, ({ one }) => ({
    tenant: one(tenants, { fields: [payrollAdjustments.tenantId], references: [tenants.id] }),
    employee: one(employees, { fields: [payrollAdjustments.employeeId], references: [employees.id] }),
    creator: one(users, { fields: [payrollAdjustments.createdBy], references: [users.id] }),
}))
