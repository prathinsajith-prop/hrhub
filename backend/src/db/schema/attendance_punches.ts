import { pgTable, uuid, text, date, timestamp, numeric, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { employees } from './employees.js'
import { users } from './users.js'

/**
 * attendance_punches — every individual clock-in / clock-out event.
 *
 * Each row is one button press / device punch / HR manual entry. The
 * sibling `attendance_records` table holds the daily rollup that runPayroll
 * + the dashboard consume.
 *
 * Pairing rules (enforced in the service layer, not the DB):
 *  - First punch of the day must be 'in'.
 *  - 'out' must follow an unpaired 'in'.
 *  - Re-entries after an 'out' produce another 'in' → new pair.
 *  - The end of the day may leave an unpaired 'in' open (employee still on
 *    site); hours_worked excludes that segment until the matching 'out'.
 */
export const attendancePunches = pgTable('attendance_punches', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    /** Calendar day this punch belongs to (always the local-time date). */
    date: date('date').notNull(),
    punchType: text('punch_type').notNull().$type<'in' | 'out'>(),
    /** Wall-clock timestamp of the punch. */
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    /** Human label like "Office HQ" / "KOLLAM" — usually a reverse-geocoded
     *  city or the device's registered location. Optional. */
    locationName: text('location_name'),
    latitude: numeric('latitude', { precision: 10, scale: 7 }),
    longitude: numeric('longitude', { precision: 10, scale: 7 }),
    /** Where the punch originated. */
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
