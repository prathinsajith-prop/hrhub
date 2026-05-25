// ⚠ DUPLICATED from backend/src/db/schema/shifts.ts
// Keep this in sync with the main backend whenever the schema changes.
// Migrations live in backend/migrations/ only — do not generate migrations here.

import { pgTable, uuid, text, boolean, integer, timestamp, jsonb, index, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.js'

/** A single core-hours window: employees must be on the clock during this
 *  range. Both endpoints are 'HH:MM' (24-hour) — never crosses midnight.
 *  Multiple windows are supported (e.g. 09:00-12:00 + 14:00-17:00 for a
 *  shift with a lunch break in the middle). */
export interface ShiftCoreHoursWindow {
    from: string
    to: string
}

// Tenant-defined working-hours templates. An employee references one shift via
// employees.shiftId — null means "use the tenant's default working week".
// Times are stored as 'HH:MM' (24-hour) strings to dodge timezone semantics.
export const shifts = pgTable('shifts', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Optional UI swatch (any CSS color string, typically #RRGGBB). */
    color: text('color'),
    startTime: text('start_time').notNull(),
    endTime: text('end_time').notNull(),
    weeklyOffDays: text('weekly_off_days').array().notNull().default([]).$type<string[]>(),
    /** Punch-in / out must fall inside [startTime - margin, endTime + margin]
     *  to count toward payable hours. Null = no margin enforcement (every
     *  clock event counts toward payable hours). Both fields are toggled
     *  together (DB CHECK constraint enforces). */
    shiftMarginBeforeMinutes: integer('shift_margin_before_minutes'),
    shiftMarginAfterMinutes: integer('shift_margin_after_minutes'),
    /** Optional core-hours windows. When non-empty, employees on this shift
     *  must be present during every window — attendance reports flag absences. */
    coreWorkingHours: jsonb('core_working_hours').notNull().default([]).$type<ShiftCoreHoursWindow[]>(),
    /** When true, breaks cannot overlap any coreWorkingHours window. */
    restrictBreaksDuringCoreHours: boolean('restrict_breaks_during_core_hours').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    index('idx_shifts_tenant').on(t.tenantId),
    unique('uq_shifts_tenant_name').on(t.tenantId, t.name),
])

export const shiftsRelations = relations(shifts, ({ one }) => ({
    tenant: one(tenants, { fields: [shifts.tenantId], references: [tenants.id] }),
}))
