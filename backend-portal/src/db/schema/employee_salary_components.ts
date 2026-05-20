/**
 * ⚠ DUPLICATED from backend/src/db/schema/employee_salary_components.ts
 * Keep this in sync with the main backend whenever the schema changes.
 * Migrations live in backend/migrations/ only — do not generate migrations here.
 */
import { pgTable, uuid, numeric, boolean, date, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { employees } from './employees.js'
import { salaryComponents } from './salary_components.js'

export const employeeSalaryComponents = pgTable('employee_salary_components', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    componentId: uuid('component_id').notNull().references(() => salaryComponents.id, { onDelete: 'cascade' }),
    amount: numeric('amount', { precision: 12, scale: 2 }),
    isActive: boolean('is_active').notNull().default(true),
    effectiveFrom: date('effective_from').notNull().defaultNow(),
    effectiveTo: date('effective_to'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    employeeComponentUniq: uniqueIndex('uq_employee_salary_components')
        .on(t.employeeId, t.componentId),
    tenantEmployeeIdx: index('idx_emp_salary_components_tenant_employee')
        .on(t.tenantId, t.employeeId)
        .where(sql`is_active = true`),
}))

export const employeeSalaryComponentsRelations = relations(employeeSalaryComponents, ({ one }) => ({
    tenant: one(tenants, { fields: [employeeSalaryComponents.tenantId], references: [tenants.id] }),
    employee: one(employees, { fields: [employeeSalaryComponents.employeeId], references: [employees.id] }),
    component: one(salaryComponents, { fields: [employeeSalaryComponents.componentId], references: [salaryComponents.id] }),
}))
