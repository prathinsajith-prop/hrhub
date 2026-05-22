// ⚠ DUPLICATED from backend/src/db/schema/attendance_punches.ts
// Keep this in sync with the main backend whenever the schema changes.
// Migrations live in backend/migrations/ only — do not generate migrations here.

import { pgTable, uuid, text, date, timestamp, numeric, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { employees } from './employees.js'
import { users } from './users.js'

/**
 * attendance_punches — every individual clock-in / clock-out event.
 *
 * Used by the portal's /attendance/check-in + /check-out endpoints so an
 * employee can clock in and out MULTIPLE times in a day (lunch breaks,
 * errands, etc.). The sibling `attendance_records` row is kept as a daily
 * rollup so the calendar / dashboard / payroll views continue to work
 * without each consumer learning how to aggregate punches.
 *
 * Pairing rules (enforced in the service layer):
 *  - First punch of the day must be 'in'.
 *  - 'out' must follow an unpaired 'in'.
 *  - Re-entries after an 'out' produce another 'in' → new pair.
 *  - The end of the day may leave an unpaired 'in' open (still on site).
 */
export const attendancePunches = pgTable('attendance_punches', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    punchType: text('punch_type').notNull().$type<'in' | 'out'>(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    locationName: text('location_name'),
    latitude: numeric('latitude', { precision: 10, scale: 7 }),
    longitude: numeric('longitude', { precision: 10, scale: 7 }),
    source: text('source').notNull().default('web').$type<'web' | 'mobile' | 'biometric' | 'manual'>(),
    deviceId: text('device_id'),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    index('idx_attendance_punches_emp_date').on(t.employeeId, t.date),
    index('idx_attendance_punches_tenant_date').on(t.tenantId, t.date),
    index('idx_attendance_punches_emp_recorded').on(t.employeeId, t.recordedAt),
])

export const attendancePunchesRelations = relations(attendancePunches, ({ one }) => ({
    tenant: one(tenants, { fields: [attendancePunches.tenantId], references: [tenants.id] }),
    employee: one(employees, { fields: [attendancePunches.employeeId], references: [employees.id] }),
    creator: one(users, { fields: [attendancePunches.createdBy], references: [users.id] }),
}))
