import { pgTable, uuid, text, boolean, date, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.js'

/**
 * public_holidays — UAE national and tenant-custom public holidays.
 * Used to exclude non-working days from leave calculations and attendance.
 */
export const publicHolidays = pgTable('public_holidays', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    date: date('date').notNull(),
    year: integer('year').notNull(),
    // isRecurring: if true, auto-seed for every new year
    isRecurring: boolean('is_recurring').notNull().default(false),
    country: text('country').notNull().default('UAE'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    tenantIdx: index('idx_public_holidays_tenant').on(t.tenantId),
    yearIdx: index('idx_public_holidays_year').on(t.tenantId, t.year),
    // Prevent duplicate dates per tenant
    uniqDate: uniqueIndex('uq_public_holidays_tenant_date').on(t.tenantId, t.date),
}))

export const publicHolidaysRelations = relations(publicHolidays, ({ one }) => ({
    tenant: one(tenants, { fields: [publicHolidays.tenantId], references: [tenants.id] }),
}))
