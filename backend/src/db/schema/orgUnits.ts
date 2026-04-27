import { pgTable, uuid, text, boolean, integer, timestamp, index, type AnyPgColumn } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { employees } from './employees.js'

export const orgUnits = pgTable('org_units', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    code: text('code'),
    type: text('type').notNull().$type<'division' | 'department' | 'branch'>(),
    parentId: uuid('parent_id').references((): AnyPgColumn => orgUnits.id, { onDelete: 'set null' }),
    headEmployeeId: uuid('head_employee_id').references(() => employees.id, { onDelete: 'set null' }),
    description: text('description'),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    index('idx_org_units_tenant').on(t.tenantId),
    index('idx_org_units_parent').on(t.parentId),
    index('idx_org_units_type').on(t.tenantId, t.type),
])

export const orgUnitsRelations = relations(orgUnits, ({ one, many }) => ({
    tenant: one(tenants, { fields: [orgUnits.tenantId], references: [tenants.id] }),
    parent: one(orgUnits, { fields: [orgUnits.parentId], references: [orgUnits.id], relationName: 'parent_children' }),
    children: many(orgUnits, { relationName: 'parent_children' }),
    headEmployee: one(employees, { fields: [orgUnits.headEmployeeId], references: [employees.id] }),
}))
