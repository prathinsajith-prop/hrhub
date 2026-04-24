import { pgTable, uuid, text, integer, date, timestamp, index, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { employees } from './employees.js'

export const onboardingChecklists = pgTable('onboarding_checklists', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    progress: integer('progress').notNull().default(0),
    startDate: date('start_date'),
    dueDate: date('due_date'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    employeeUniq: unique('onboarding_employee_unique').on(t.employeeId),
    employeeIdx: index('idx_checklist_employee').on(t.employeeId),
}))

export const onboardingSteps = pgTable('onboarding_steps', {
    id: uuid('id').primaryKey().defaultRandom(),
    checklistId: uuid('checklist_id').notNull().references(() => onboardingChecklists.id, { onDelete: 'cascade' }),
    stepOrder: integer('step_order').notNull(),
    title: text('title').notNull(),
    owner: text('owner'),
    slaDays: integer('sla_days'),
    status: text('status').notNull().default('pending')
        .$type<'pending' | 'in_progress' | 'completed' | 'overdue'>(),
    dueDate: date('due_date'),
    completedDate: date('completed_date'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    checklistIdx: index('idx_steps_checklist').on(t.checklistId),
}))

export const onboardingChecklistsRelations = relations(onboardingChecklists, ({ one, many }) => ({
    tenant: one(tenants, { fields: [onboardingChecklists.tenantId], references: [tenants.id] }),
    employee: one(employees, { fields: [onboardingChecklists.employeeId], references: [employees.id] }),
    steps: many(onboardingSteps),
}))

export const onboardingStepsRelations = relations(onboardingSteps, ({ one }) => ({
    checklist: one(onboardingChecklists, { fields: [onboardingSteps.checklistId], references: [onboardingChecklists.id] }),
}))
