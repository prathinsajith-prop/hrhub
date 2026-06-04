// ⚠ DUPLICATED from backend/src/db/schema/goals.ts
// Keep in sync with the main backend. Migrations live in backend/migrations/ only.

import { pgTable, uuid, text, integer, date, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { employees } from './employees.js'
import { users } from './users.js'

/**
 * employee_goals — personal SMART / OKR goals an employee sets for
 * themselves in the portal. Separate from performance_reviews. Tenant +
 * employee scoped, soft-deletable.
 */
export const employeeGoals = pgTable('employee_goals', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    category: text('category').notNull().default('professional'),
    status: text('status').notNull().default('active').$type<'active' | 'completed' | 'archived'>(),
    progress: integer('progress').notNull().default(0),
    targetDate: date('target_date'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    employeeIdx: index('idx_employee_goals_employee').on(t.tenantId, t.employeeId, t.createdAt),
    tenantIdx: index('idx_employee_goals_tenant').on(t.tenantId),
}))

export const employeeGoalsRelations = relations(employeeGoals, ({ one }) => ({
    tenant: one(tenants, { fields: [employeeGoals.tenantId], references: [tenants.id] }),
    employee: one(employees, { fields: [employeeGoals.employeeId], references: [employees.id] }),
}))
