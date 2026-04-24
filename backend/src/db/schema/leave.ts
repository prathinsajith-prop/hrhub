import { pgTable, uuid, text, integer, date, timestamp, index } from 'drizzle-orm/pg-core'
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
