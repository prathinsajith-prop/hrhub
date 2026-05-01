import { pgTable, uuid, text, date, numeric, integer, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
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
    tenantIdx: index('idx_employee_loans_tenant').on(t.tenantId),
    employeeIdx: index('idx_employee_loans_employee').on(t.employeeId),
    statusIdx: index('idx_employee_loans_status').on(t.tenantId, t.status),
}))

export const employeeLoansRelations = relations(employeeLoans, ({ one }) => ({
    tenant: one(tenants, { fields: [employeeLoans.tenantId], references: [tenants.id] }),
    employee: one(employees, { fields: [employeeLoans.employeeId], references: [employees.id] }),
    approver: one(users, { fields: [employeeLoans.approvedBy], references: [users.id] }),
}))
