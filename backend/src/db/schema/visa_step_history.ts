import { pgTable, uuid, text, integer, numeric, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { users } from './users.js'
import { visaApplications } from './visa.js'

/**
 * Append-only audit trail for every visa step transition. Captures both the
 * step number and the human-readable label at the time of the transition so
 * historical records remain intelligible even if the step labels evolve.
 *
 * Complementary to `activity_logs` — that is a generic cross-entity audit
 * stream; this table is the structured per-visa workflow journal that
 * powers the visa detail page's history view.
 */
export const visaStepHistory = pgTable('visa_step_history', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    visaApplicationId: uuid('visa_application_id').notNull().references(() => visaApplications.id, { onDelete: 'cascade' }),
    fromStep: integer('from_step').notNull(),
    toStep: integer('to_step').notNull(),
    fromStepLabel: text('from_step_label').notNull(),
    toStepLabel: text('to_step_label'),
    fromStatus: text('from_status').notNull(),
    toStatus: text('to_status').notNull(),
    /** Sum of costs (in tenant base currency) recorded for this transition. */
    costsTotal: numeric('costs_total', { precision: 12, scale: 2 }).notNull().default('0'),
    /** Number of cost rows attached to this transition. */
    costsCount: integer('costs_count').notNull().default(0),
    notes: text('notes'),
    advancedBy: uuid('advanced_by').references(() => users.id, { onDelete: 'set null' }),
    advancedByName: text('advanced_by_name'),
    advancedByRole: text('advanced_by_role'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    tenantIdx: index('idx_visa_step_history_tenant').on(t.tenantId),
    visaIdx: index('idx_visa_step_history_visa').on(t.visaApplicationId),
    createdIdx: index('idx_visa_step_history_created').on(t.createdAt),
}))

export const visaStepHistoryRelations = relations(visaStepHistory, ({ one }) => ({
    tenant: one(tenants, { fields: [visaStepHistory.tenantId], references: [tenants.id] }),
    visaApplication: one(visaApplications, { fields: [visaStepHistory.visaApplicationId], references: [visaApplications.id] }),
    advancedByUser: one(users, { fields: [visaStepHistory.advancedBy], references: [users.id] }),
}))
