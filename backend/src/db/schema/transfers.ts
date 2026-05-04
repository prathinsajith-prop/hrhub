import { pgTable, uuid, text, date, numeric, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { employees } from './employees.js'
import { orgUnits } from './orgUnits.js'
import { users } from './users.js'

export const employeeTransfers = pgTable('employee_transfers', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    transferDate: date('transfer_date').notNull(),
    fromDesignation: text('from_designation'),
    fromDepartment: text('from_department'),
    fromBranchId: uuid('from_branch_id').references(() => orgUnits.id, { onDelete: 'set null' }),
    fromDivisionId: uuid('from_division_id').references(() => orgUnits.id, { onDelete: 'set null' }),
    fromDepartmentId: uuid('from_department_id').references(() => orgUnits.id, { onDelete: 'set null' }),
    toDesignation: text('to_designation'),
    toDepartment: text('to_department'),
    toBranchId: uuid('to_branch_id').references(() => orgUnits.id, { onDelete: 'set null' }),
    toDivisionId: uuid('to_division_id').references(() => orgUnits.id, { onDelete: 'set null' }),
    toDepartmentId: uuid('to_department_id').references(() => orgUnits.id, { onDelete: 'set null' }),
    newSalary: numeric('new_salary', { precision: 12, scale: 2 }),
    reason: text('reason'),
    notes: text('notes'),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => ({
    tenantIdx: index('idx_emp_transfers_tenant').on(t.tenantId),
    employeeIdx: index('idx_emp_transfers_employee').on(t.employeeId),
}))

export const employeeTransfersRelations = relations(employeeTransfers, ({ one }) => ({
    tenant: one(tenants, { fields: [employeeTransfers.tenantId], references: [tenants.id] }),
    employee: one(employees, { fields: [employeeTransfers.employeeId], references: [employees.id] }),
    approvedByUser: one(users, { fields: [employeeTransfers.approvedBy], references: [users.id] }),
    fromBranch: one(orgUnits, { fields: [employeeTransfers.fromBranchId], references: [orgUnits.id], relationName: 'transfer_from_branch' }),
    toBranch: one(orgUnits, { fields: [employeeTransfers.toBranchId], references: [orgUnits.id], relationName: 'transfer_to_branch' }),
}))
