import { pgTable, uuid, text, date, timestamp, time, boolean, numeric } from 'drizzle-orm/pg-core'
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
})
