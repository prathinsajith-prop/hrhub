import { pgTable, uuid, text, date, numeric, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { employees } from './employees.js'
import { users } from './users.js'

export const employeeLoans = pgTable('employee_loans', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    monthlyDeduction: numeric('monthly_deduction', { precision: 12, scale: 2 }).notNull(),
    reason: text('reason'),
    status: text('status').notNull().default('pending')
        .$type<'pending' | 'approved' | 'rejected' | 'active' | 'completed' | 'cancelled'>(),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    startDate: date('start_date'),
    totalInstallments: integer('total_installments'),
    paidInstallments: integer('paid_installments').notNull().default(0),
    remainingBalance: numeric('remaining_balance', { precision: 12, scale: 2 }),
    notes: text('notes'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    tenantIdx:         index('idx_employee_loans_tenant').on(t.tenantId),
    employeeIdx:       index('idx_employee_loans_employee').on(t.employeeId),
    statusIdx:         index('idx_employee_loans_status').on(t.tenantId, t.status),
    tenantEmployeeIdx: index('idx_employee_loans_tenant_employee').on(t.tenantId, t.employeeId),
    tenantCreatedIdx:  index('idx_employee_loans_tenant_created').on(t.tenantId, t.createdAt).where(sql`${t.deletedAt} IS NULL`),
}))

export const employeeLoansRelations = relations(employeeLoans, ({ one, many }) => ({
    tenant: one(tenants, { fields: [employeeLoans.tenantId], references: [tenants.id] }),
    employee: one(employees, { fields: [employeeLoans.employeeId], references: [employees.id] }),
    approver: one(users, { fields: [employeeLoans.approvedBy], references: [users.id] }),
    payments: many(loanPayments),
}))

/**
 * Per-month payment ledger for an active loan.
 *
 * `periodMonth` is always the first day of the month (YYYY-MM-01) — it identifies
 * which monthly installment the payment satisfies. The unique constraint on
 * (loanId, periodMonth) blocks duplicate payments for the same month.
 */
export const loanPayments = pgTable('loan_payments', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    loanId: uuid('loan_id').notNull().references(() => employeeLoans.id, { onDelete: 'cascade' }),
    periodMonth: date('period_month').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    paidDate: timestamp('paid_date', { withTimezone: true }).notNull().defaultNow(),
    notes: text('notes'),
    recordedBy: uuid('recorded_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    loanIdx:        index('idx_loan_payments_loan').on(t.loanId),
    tenantIdx:      index('idx_loan_payments_tenant').on(t.tenantId),
    uniqueByPeriod: uniqueIndex('uq_loan_payments_loan_period').on(t.loanId, t.periodMonth),
}))

export const loanPaymentsRelations = relations(loanPayments, ({ one }) => ({
    loan: one(employeeLoans, { fields: [loanPayments.loanId], references: [employeeLoans.id] }),
    tenant: one(tenants, { fields: [loanPayments.tenantId], references: [tenants.id] }),
    recordedByUser: one(users, { fields: [loanPayments.recordedBy], references: [users.id] }),
}))
