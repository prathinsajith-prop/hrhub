import { pgTable, uuid, text, date, timestamp, numeric, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { tenants } from './tenants.js'
import { employees } from './employees.js'

export const attendanceRecords = pgTable('attendance_records', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').notNull().references(() => employees.id),
    date: date('date').notNull(),
    checkIn: timestamp('check_in', { withTimezone: true }),
    checkOut: timestamp('check_out', { withTimezone: true }),
    hoursWorked: numeric('hours_worked', { precision: 5, scale: 2 }),
    overtimeHours: numeric('overtime_hours', { precision: 5, scale: 2 }).default('0'),
    status: text('status').notNull().default('present')
        .$type<'present' | 'absent' | 'half_day' | 'late' | 'wfh' | 'on_leave'>(),
    notes: text('notes'),
    approvedBy: uuid('approved_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
    // Tenant-scoped list/filter — most queries start here
    tenantIdx: index('idx_attendance_tenant').on(t.tenantId),
    // Per-employee history
    employeeIdx: index('idx_attendance_employee').on(t.employeeId),
    // Date-range reports filtered by tenant (dashboard, summaries)
    tenantDateIdx: index('idx_attendance_tenant_date').on(t.tenantId, t.date),
    // Per-employee date queries (check-in/check-out lookup)
    employeeDateIdx: index('idx_attendance_employee_date').on(t.employeeId, t.date),
    // Unique constraint: one record per employee per day
    uniqEmployeeDate: uniqueIndex('uniq_attendance_employee_date').on(t.employeeId, t.date),
}))
