import { pgTable, uuid, text, integer, numeric, date, timestamp, index, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { employees } from './employees.js'
import { users } from './users.js'

export const payrollRuns = pgTable('payroll_runs', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    month: integer('month').notNull(),
    year: integer('year').notNull(),
    status: text('status').notNull().default('draft')
        .$type<'draft' | 'processing' | 'approved' | 'wps_submitted' | 'paid' | 'failed'>(),
    totalEmployees: integer('total_employees').notNull().default(0),
    totalGross: numeric('total_gross', { precision: 14, scale: 2 }).notNull().default('0'),
    totalDeductions: numeric('total_deductions', { precision: 14, scale: 2 }).notNull().default('0'),
    totalNet: numeric('total_net', { precision: 14, scale: 2 }).notNull().default('0'),
    wpsFileRef: text('wps_file_ref'),
    processedDate: date('processed_date'),
    approvedBy: uuid('approved_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    tenantIdx: index('idx_payroll_tenant').on(t.tenantId),
    tenantStatusIdx: index('idx_payroll_tenant_status').on(t.tenantId, t.status),
    tenantYearMonthIdx: index('idx_payroll_tenant_year_month').on(t.tenantId, t.year, t.month),
    monthYearUniq: unique('payroll_month_year_unique').on(t.tenantId, t.month, t.year),
}))

export const payslips = pgTable('payslips', {
    id: uuid('id').primaryKey().defaultRandom(),
    payrollRunId: uuid('payroll_run_id').notNull().references(() => payrollRuns.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').notNull().references(() => employees.id),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    basicSalary: numeric('basic_salary', { precision: 12, scale: 2 }).notNull().default('0'),
    housingAllowance: numeric('housing_allowance', { precision: 12, scale: 2 }).notNull().default('0'),
    transportAllowance: numeric('transport_allowance', { precision: 12, scale: 2 }).notNull().default('0'),
    otherAllowances: numeric('other_allowances', { precision: 12, scale: 2 }).notNull().default('0'),
    overtime: numeric('overtime', { precision: 12, scale: 2 }).notNull().default('0'),
    commission: numeric('commission', { precision: 12, scale: 2 }).notNull().default('0'),
    grossSalary: numeric('gross_salary', { precision: 12, scale: 2 }).notNull().default('0'),
    deductions: numeric('deductions', { precision: 12, scale: 2 }).notNull().default('0'),
    netSalary: numeric('net_salary', { precision: 12, scale: 2 }).notNull().default('0'),
    daysWorked: integer('days_worked'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    runIdx: index('idx_payslips_run').on(t.payrollRunId),
    employeeIdx: index('idx_payslips_employee').on(t.employeeId),
    tenantEmployeeIdx: index('idx_payslips_tenant_employee').on(t.tenantId, t.employeeId),
    tenantRunIdx: index('idx_payslips_tenant_run').on(t.tenantId, t.payrollRunId),
}))

export const payrollRunsRelations = relations(payrollRuns, ({ one, many }) => ({
    tenant: one(tenants, { fields: [payrollRuns.tenantId], references: [tenants.id] }),
    payslips: many(payslips),
}))

export const payslipsRelations = relations(payslips, ({ one }) => ({
    payrollRun: one(payrollRuns, { fields: [payslips.payrollRunId], references: [payrollRuns.id] }),
    employee: one(employees, { fields: [payslips.employeeId], references: [employees.id] }),
}))
