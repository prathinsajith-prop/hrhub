import { pgTable, uuid, text, integer, date, timestamp, index, boolean, numeric, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { employees } from './employees.js'
import { users } from './users.js'

export const leaveRequests = pgTable('leave_requests', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    leaveType: text('leave_type').notNull()
        .$type<'annual' | 'sick' | 'maternity' | 'paternity' | 'hajj' | 'compassionate' | 'unpaid' | 'public_holiday'>(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    days: integer('days').notNull(),
    status: text('status').notNull().default('pending')
        .$type<'pending' | 'approved' | 'rejected' | 'cancelled'>(),
    reason: text('reason'),
    approvedBy: uuid('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    appliedDate: date('applied_date').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    tenantIdx: index('idx_leave_tenant').on(t.tenantId),
    employeeIdx: index('idx_leave_employee').on(t.employeeId),
    statusIdx: index('idx_leave_status').on(t.status),
}))

export const leaveRequestsRelations = relations(leaveRequests, ({ one }) => ({
    tenant: one(tenants, { fields: [leaveRequests.tenantId], references: [tenants.id] }),
    employee: one(employees, { fields: [leaveRequests.employeeId], references: [employees.id] }),
    approvedByUser: one(users, { fields: [leaveRequests.approvedBy], references: [users.id] }),
}))

export const leavePolicies = pgTable('leave_policies', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    leaveType: text('leave_type').notNull(),
    daysPerYear: integer('days_per_year').notNull().default(0),
    accrualRule: text('accrual_rule').notNull().default('flat')
        .$type<'flat' | 'monthly_2_then_30' | 'unlimited' | 'none'>(),
    maxCarryForward: integer('max_carry_forward').notNull().default(0),
    carryExpiresAfterMonths: integer('carry_expires_after_months').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    tenantIdx: index('idx_leave_policies_tenant').on(t.tenantId),
    uniqTenantType: uniqueIndex('uniq_leave_policies_tenant_type').on(t.tenantId, t.leaveType),
}))

export const leaveBalances = pgTable('leave_balances', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    leaveType: text('leave_type').notNull(),
    year: integer('year').notNull(),
    openingBalance: numeric('opening_balance', { precision: 6, scale: 2 }).notNull().default('0'),
    accrued: numeric('accrued', { precision: 6, scale: 2 }).notNull().default('0'),
    carriedForward: numeric('carried_forward', { precision: 6, scale: 2 }).notNull().default('0'),
    carryExpiresOn: date('carry_expires_on'),
    taken: numeric('taken', { precision: 6, scale: 2 }).notNull().default('0'),
    adjustment: numeric('adjustment', { precision: 6, scale: 2 }).notNull().default('0'),
    closingBalance: numeric('closing_balance', { precision: 6, scale: 2 }).notNull().default('0'),
    rolledOverAt: timestamp('rolled_over_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    tenantIdx: index('idx_leave_balances_tenant').on(t.tenantId),
    empYearIdx: index('idx_leave_balances_emp_year').on(t.employeeId, t.year),
    uniqRow: uniqueIndex('uniq_leave_balances_emp_type_year').on(t.tenantId, t.employeeId, t.leaveType, t.year),
}))

export const leavePoliciesRelations = relations(leavePolicies, ({ one }) => ({
    tenant: one(tenants, { fields: [leavePolicies.tenantId], references: [tenants.id] }),
}))

export const leaveBalancesRelations = relations(leaveBalances, ({ one }) => ({
    tenant: one(tenants, { fields: [leaveBalances.tenantId], references: [tenants.id] }),
    employee: one(employees, { fields: [leaveBalances.employeeId], references: [employees.id] }),
}))
