import { pgTable, uuid, text, boolean, integer, timestamp, index, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.js'

// Tenant-defined working-hours templates. An employee references one shift via
// employees.shiftId — null means "use the tenant's default working week".
// Times are stored as 'HH:MM' (24-hour) strings to dodge timezone semantics.
export const shifts = pgTable('shifts', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    startTime: text('start_time').notNull(),
    endTime: text('end_time').notNull(),
    weeklyOffDays: text('weekly_off_days').array().notNull().default([]).$type<string[]>(),
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
