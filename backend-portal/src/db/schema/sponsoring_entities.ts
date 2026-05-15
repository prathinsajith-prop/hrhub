// ⚠ DUPLICATED from backend/src/db/schema/sponsoring_entities.ts
// Keep this in sync with the main backend whenever the schema changes.
// Migrations live in backend/migrations/ only — do not generate migrations here.

import { pgTable, uuid, text, boolean, integer, timestamp, index, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.js'

export const sponsoringEntities = pgTable('sponsoring_entities', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    index('idx_sponsoring_entities_tenant').on(t.tenantId),
    unique('uq_sponsoring_entities_tenant_name').on(t.tenantId, t.name),
])

export const sponsoringEntitiesRelations = relations(sponsoringEntities, ({ one }) => ({
    tenant: one(tenants, { fields: [sponsoringEntities.tenantId], references: [tenants.id] }),
}))
