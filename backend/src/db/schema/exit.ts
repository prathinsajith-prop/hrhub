import { pgTable, uuid, text, date, numeric, timestamp, boolean } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { employees } from './employees'

export const exitRequests = pgTable('exit_requests', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').notNull().references(() => employees.id),
    exitType: text('exit_type').notNull().$type<'resignation' | 'termination' | 'contract_end' | 'retirement'>(),
    exitDate: date('exit_date').notNull(),
    lastWorkingDay: date('last_working_day').notNull(),
    reason: text('reason'),
    noticePeriodDays: numeric('notice_period_days', { precision: 5, scale: 0 }).notNull().default('30'),
    status: text('status').notNull().default('pending').$type<'pending' | 'approved' | 'rejected' | 'completed'>(),
    // Final settlement
    gratuityAmount: numeric('gratuity_amount', { precision: 12, scale: 2 }),
    leaveEncashmentAmount: numeric('leave_encashment_amount', { precision: 12, scale: 2 }),
    unpaidSalaryAmount: numeric('unpaid_salary_amount', { precision: 12, scale: 2 }),
    deductions: numeric('deductions', { precision: 12, scale: 2 }).default('0'),
    totalSettlement: numeric('total_settlement', { precision: 12, scale: 2 }),
    settlementPaid: boolean('settlement_paid').default(false),
    settlementPaidDate: date('settlement_paid_date'),
    // Admin
    approvedBy: uuid('approved_by'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
