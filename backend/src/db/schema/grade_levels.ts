import { pgTable, uuid, text, boolean, integer, timestamp, index, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.js'

export const gradeLevels = pgTable('grade_levels', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    code: text('code'),
    level: integer('level'),
    hierarchy: text('hierarchy'),
    salaryMin: integer('salary_min'),
    salaryMax: integer('salary_max'),
    description: text('description'),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    index('idx_grade_levels_tenant').on(t.tenantId),
    unique('uq_grade_levels_tenant_name').on(t.tenantId, t.name),
])

export const gradeLevelsRelations = relations(gradeLevels, ({ one }) => ({
    tenant: one(tenants, { fields: [gradeLevels.tenantId], references: [tenants.id] }),
}))
