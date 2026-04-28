import { pgTable, uuid, text, boolean, integer, timestamp, index, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.js'

export const designations = pgTable('designations', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    index('idx_designations_tenant').on(t.tenantId),
    unique('uq_designations_tenant_name').on(t.tenantId, t.name),
])

export const designationsRelations = relations(designations, ({ one }) => ({
    tenant: one(tenants, { fields: [designations.tenantId], references: [tenants.id] }),
}))
