import { pgTable, uuid, numeric, boolean, date, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { employees } from './employees.js'
import { salaryComponents } from './salary_components.js'

/**
 * Per-employee assignment of a tenant-catalog salary component.
 *
 * See migration 0044 for the full design rationale. In short: this table is
 * what payroll reads to compute an employee's earnings. The legacy
 * `employees.basic_salary` / `housing_allowance` / `transport_allowance` /
 * `other_allowances` columns survived the migration (other consumers still
 * read them), but payroll authoritatively uses this table now.
 *
 * `amount` is nullable: NULL means "use the catalog default". For flat
 * components the assignment's amount is the AED amount; for percentage
 * components it's the percentage value (0–100). The resolver in
 * payroll.service.ts handles both cases.
 */
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
