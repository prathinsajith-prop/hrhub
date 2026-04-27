import { pgTable, uuid, text, integer, date, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { employees } from './employees.js'

export const visaApplications = pgTable('visa_applications', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    visaType: text('visa_type').notNull()
        .$type<'employment_new' | 'employment_renewal' | 'mission' | 'visit' | 'investor' | 'dependant' | 'golden' | 'freelancer' | 'cancellation'>(),
    status: text('status').notNull().default('not_started')
        .$type<'not_started' | 'entry_permit' | 'medical_pending' | 'eid_pending' | 'stamping' | 'active' | 'expiring_soon' | 'expired' | 'cancelled'>(),
    currentStep: integer('current_step').notNull().default(1),
    totalSteps: integer('total_steps').notNull().default(8),
    mohreRef: text('mohre_ref'),
    gdfrRef: text('gdfr_ref'),
    icpRef: text('icp_ref'),
    startDate: date('start_date').notNull().defaultNow(),
    expiryDate: date('expiry_date'),
    urgencyLevel: text('urgency_level').notNull().default('normal')
        .$type<'normal' | 'urgent' | 'critical'>(),
    notes: text('notes'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    tenantIdx: index('idx_visa_tenant').on(t.tenantId),
    employeeIdx: index('idx_visa_employee').on(t.employeeId),
    statusIdx: index('idx_visa_status').on(t.status),
    tenantStatusIdx: index('idx_visa_tenant_status').on(t.tenantId, t.status),
    tenantUrgencyIdx: index('idx_visa_tenant_urgency').on(t.tenantId, t.urgencyLevel),
    expiryIdx: index('idx_visa_expiry').on(t.expiryDate),
}))

export const visaApplicationsRelations = relations(visaApplications, ({ one }) => ({
    tenant: one(tenants, { fields: [visaApplications.tenantId], references: [tenants.id] }),
    employee: one(employees, { fields: [visaApplications.employeeId], references: [employees.id] }),
}))
