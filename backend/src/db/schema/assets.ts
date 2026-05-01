import { pgTable, uuid, text, boolean, date, numeric, timestamp, index, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { employees } from './employees.js'
import { users } from './users.js'

// ─── Asset Categories ────────────────────────────────────────────────────────
export const assetCategories = pgTable('asset_categories', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    tenantIdx: index('idx_asset_categories_tenant').on(t.tenantId),
}))

export const assetCategoriesRelations = relations(assetCategories, ({ one }) => ({
    tenant: one(tenants, { fields: [assetCategories.tenantId], references: [tenants.id] }),
}))

// ─── Assets ──────────────────────────────────────────────────────────────────
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
}, (t) => ({
    tenantIdx: index('idx_assets_tenant').on(t.tenantId),
    statusIdx: index('idx_assets_status').on(t.tenantId, t.status),
    categoryIdx: index('idx_assets_category').on(t.categoryId),
    assetCodeUniq: unique().on(t.tenantId, t.assetCode),
}))

export const assetsRelations = relations(assets, ({ one, many }) => ({
    tenant: one(tenants, { fields: [assets.tenantId], references: [tenants.id] }),
    category: one(assetCategories, { fields: [assets.categoryId], references: [assetCategories.id] }),
    assignments: many(assetAssignments),
    maintenance: many(assetMaintenance),
}))

// ─── Asset Assignments ───────────────────────────────────────────────────────
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
}, (t) => ({
    tenantIdx: index('idx_asset_assignments_tenant').on(t.tenantId),
    assetIdx: index('idx_asset_assignments_asset').on(t.assetId),
    employeeIdx: index('idx_asset_assignments_employee').on(t.employeeId),
    statusIdx: index('idx_asset_assignments_status').on(t.status),
}))

export const assetAssignmentsRelations = relations(assetAssignments, ({ one }) => ({
    tenant: one(tenants, { fields: [assetAssignments.tenantId], references: [tenants.id] }),
    asset: one(assets, { fields: [assetAssignments.assetId], references: [assets.id] }),
    employee: one(employees, { fields: [assetAssignments.employeeId], references: [employees.id] }),
    assignedByUser: one(users, { fields: [assetAssignments.assignedBy], references: [users.id] }),
}))

// ─── Asset Maintenance ───────────────────────────────────────────────────────
export const assetMaintenance = pgTable('asset_maintenance', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
    reportedBy: uuid('reported_by').references(() => users.id, { onDelete: 'set null' }),
    issueDescription: text('issue_description').notNull(),
    status: text('status').notNull().default('open')
        .$type<'open' | 'in_progress' | 'resolved'>(),
    cost: numeric('cost', { precision: 12, scale: 2 }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    tenantIdx: index('idx_asset_maintenance_tenant').on(t.tenantId),
    assetIdx: index('idx_asset_maintenance_asset').on(t.assetId),
}))

export const assetMaintenanceRelations = relations(assetMaintenance, ({ one }) => ({
    tenant: one(tenants, { fields: [assetMaintenance.tenantId], references: [tenants.id] }),
    asset: one(assets, { fields: [assetMaintenance.assetId], references: [assets.id] }),
    reportedByUser: one(users, { fields: [assetMaintenance.reportedBy], references: [users.id] }),
}))
