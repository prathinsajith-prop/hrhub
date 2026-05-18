// ⚠ DUPLICATED from backend/src/db/schema/assets.ts
// Keep this in sync with the main backend whenever the schema changes.
// Migrations live in backend/migrations/ only — do not generate migrations here.
//
// Portal only reads from these tables (employee viewing their own assigned
// gear, manager viewing a team member's assigned gear). No writes.

import { pgTable, uuid, text, date, numeric, timestamp, index, unique } from 'drizzle-orm/pg-core'
import { tenants } from './tenants.js'
import { employees } from './employees.js'
import { users } from './users.js'

export const assetCategories = pgTable('asset_categories', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    index('idx_asset_categories_tenant').on(t.tenantId),
])

export const assets = pgTable('assets', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    assetCode: text('asset_code').notNull(),
    name: text('name').notNull(),
    categoryId: uuid('category_id').references(() => assetCategories.id, { onDelete: 'set null' }),
    brand: text('brand'),
    model: text('model'),
    serialNumber: text('serial_number'),
    purchaseDate: date('purchase_date'),
    purchaseCost: numeric('purchase_cost', { precision: 12, scale: 2 }),
    status: text('status').notNull().default('available')
        .$type<'available' | 'assigned' | 'maintenance' | 'lost' | 'retired'>(),
    condition: text('condition').notNull().default('good')
        .$type<'new' | 'good' | 'damaged'>(),
    notes: text('notes'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    index('idx_assets_tenant').on(t.tenantId),
    index('idx_assets_status').on(t.tenantId, t.status),
    index('idx_assets_category').on(t.categoryId),
    unique().on(t.tenantId, t.assetCode),
])

export const assetAssignments = pgTable('asset_assignments', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    assignedBy: uuid('assigned_by').references(() => users.id, { onDelete: 'set null' }),
    assignedDate: date('assigned_date').notNull(),
    expectedReturnDate: date('expected_return_date'),
    actualReturnDate: date('actual_return_date'),
    status: text('status').notNull().default('assigned')
        .$type<'assigned' | 'returned' | 'lost'>(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    index('idx_asset_assignments_tenant').on(t.tenantId),
    index('idx_asset_assignments_asset').on(t.assetId),
    index('idx_asset_assignments_employee').on(t.employeeId),
    index('idx_asset_assignments_status').on(t.status),
    index('idx_asset_assign_tenant_employee').on(t.tenantId, t.employeeId),
    index('idx_asset_assign_tenant_status').on(t.tenantId, t.status),
])
