import { pgTable, uuid, text, date, numeric, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { employees } from './employees.js'
import { users } from './users.js'

export const trainingRecords = pgTable('training_records', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    provider: text('provider'),
    type: text('type').notNull().default('external')
        .$type<'internal' | 'external' | 'online' | 'conference'>(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
    cost: numeric('cost', { precision: 12, scale: 2 }),
    currency: text('currency').default('AED'),
    status: text('status').notNull().default('planned')
        .$type<'planned' | 'in_progress' | 'completed' | 'cancelled'>(),
    certificateUrl: text('certificate_url'),
    certificateExpiry: date('certificate_expiry'),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    tenantIdx: index('idx_training_records_tenant').on(t.tenantId),
    employeeIdx: index('idx_training_records_employee').on(t.employeeId),
    statusIdx: index('idx_training_records_status').on(t.tenantId, t.status),
}))

export const trainingRecordsRelations = relations(trainingRecords, ({ one }) => ({
    tenant: one(tenants, { fields: [trainingRecords.tenantId], references: [tenants.id] }),
    employee: one(employees, { fields: [trainingRecords.employeeId], references: [employees.id] }),
    creator: one(users, { fields: [trainingRecords.createdBy], references: [users.id] }),
}))
