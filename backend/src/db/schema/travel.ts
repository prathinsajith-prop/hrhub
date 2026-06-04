/**
 * Travel requests + travel expenses.
 *
 * Workflow (status field on travel_requests):
 *   draft → submitted → approved | rejected
 *                         ↓
 *                       completed (HR marks done after the trip)
 *   any non-final state can also transition to → cancelled
 *
 * Expense rows hang off an approved/completed travel_request via
 * travel_request_id. They each represent a single line item (one row per
 * date / category combination — matches the dialog's "Add Row" pattern in
 * the Zoho reference).
 *
 * Soft deletes (deletedAt) on both tables — never hard-deleted because the
 * approval audit trail needs to survive even if HR removes a row.
 */
import { pgTable, uuid, text, date, numeric, boolean, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { employees } from './employees.js'
import { users } from './users.js'

export const travelRequests = pgTable('travel_requests', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    // Human-readable identifier exposed in lists and on the expense page:
    //   "TRV-2026-0001". Per-tenant unique, generated server-side at create
    //   time (see service.generateTravelNo). Stored explicitly so HR can
    //   search/sort by it without recomputing.
    travelNo: text('travel_no').notNull(),
    placeOfVisit: text('place_of_visit'),
    departureDate: date('departure_date').notNull(),
    arrivalDate: date('arrival_date').notNull(),
    // Derived from (arrival - departure + 1) at write time. Persisted so
    // the list view doesn't need to recompute it per row.
    durationDays: integer('duration_days').notNull(),
    purposeOfVisit: text('purpose_of_visit'),
    customerName: text('customer_name'),
    isBillableToCustomer: boolean('is_billable_to_customer').notNull().default(false),
    status: text('status').notNull().default('draft')
        .$type<'draft' | 'submitted' | 'approved' | 'rejected' | 'cancelled' | 'completed'>(),
    // Approval audit. approvedBy is the user who last actioned the request
    // (approve OR reject — see status for the verdict). rejectionReason is
    // required by the route when status is set to 'rejected'.
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    tenantIdx:         index('idx_travel_requests_tenant').on(t.tenantId),
    employeeIdx:       index('idx_travel_requests_employee').on(t.employeeId),
    tenantEmpIdx:      index('idx_travel_requests_tenant_employee').on(t.tenantId, t.employeeId),
    statusIdx:         index('idx_travel_requests_status').on(t.tenantId, t.status),
    departureIdx:      index('idx_travel_requests_departure').on(t.tenantId, t.departureDate),
    // Per-tenant uniqueness on the generated travel_no — guarantees we can
    // never issue the same code twice (race-safe under concurrent inserts
    // because Postgres rejects the duplicate at INSERT).
    travelNoUniq:      uniqueIndex('uq_travel_requests_travel_no').on(t.tenantId, t.travelNo),
    tenantCreatedIdx:  index('idx_travel_requests_tenant_created').on(t.tenantId, t.createdAt).where(sql`${t.deletedAt} IS NULL`),
}))

export const travelExpenses = pgTable('travel_expenses', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    travelRequestId: uuid('travel_request_id').notNull().references(() => travelRequests.id, { onDelete: 'cascade' }),
    // employeeId is denormalised here so the listing can scope by employee
    // without a JOIN. Always equals travelRequests.employeeId — enforced at
    // create time in the service layer.
    employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    description: text('description'),
    expenseDate: date('expense_date').notNull(),
    // Each category is its own column so HR can SUM(ticket), SUM(lodging) etc.
    // for reporting without unpacking a JSON blob. Defaults to 0 keeps the
    // total math simple — null + null would force COALESCE everywhere.
    ticket: numeric('ticket', { precision: 12, scale: 2 }).notNull().default('0'),
    lodging: numeric('lodging', { precision: 12, scale: 2 }).notNull().default('0'),
    boarding: numeric('boarding', { precision: 12, scale: 2 }).notNull().default('0'),
    phone: numeric('phone', { precision: 12, scale: 2 }).notNull().default('0'),
    localConveyance: numeric('local_conveyance', { precision: 12, scale: 2 }).notNull().default('0'),
    incidentals: numeric('incidentals', { precision: 12, scale: 2 }).notNull().default('0'),
    others: numeric('others', { precision: 12, scale: 2 }).notNull().default('0'),
    currency: text('currency').notNull().default('AED'),
    // Optional receipt — S3 key when uploaded via the documents pipeline.
    // The portal/admin renders a download link when this is set.
    receiptS3Key: text('receipt_s3_key'),
    status: text('status').notNull().default('pending')
        .$type<'pending' | 'approved' | 'rejected' | 'reimbursed'>(),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    tenantIdx:        index('idx_travel_expenses_tenant').on(t.tenantId),
    requestIdx:       index('idx_travel_expenses_request').on(t.travelRequestId),
    tenantRequestIdx: index('idx_travel_expenses_tenant_request').on(t.tenantId, t.travelRequestId),
    employeeIdx:      index('idx_travel_expenses_tenant_employee').on(t.tenantId, t.employeeId),
    statusIdx:        index('idx_travel_expenses_status').on(t.tenantId, t.status),
    dateIdx:          index('idx_travel_expenses_date').on(t.tenantId, t.expenseDate),
}))

export const travelRequestsRelations = relations(travelRequests, ({ one, many }) => ({
    tenant:   one(tenants,   { fields: [travelRequests.tenantId],   references: [tenants.id] }),
    employee: one(employees, { fields: [travelRequests.employeeId], references: [employees.id] }),
    approver: one(users,     { fields: [travelRequests.approvedBy], references: [users.id] }),
    creator:  one(users,     { fields: [travelRequests.createdBy],  references: [users.id] }),
    expenses: many(travelExpenses),
}))

export const travelExpensesRelations = relations(travelExpenses, ({ one }) => ({
    tenant:   one(tenants,        { fields: [travelExpenses.tenantId],        references: [tenants.id] }),
    request:  one(travelRequests, { fields: [travelExpenses.travelRequestId], references: [travelRequests.id] }),
    employee: one(employees,      { fields: [travelExpenses.employeeId],      references: [employees.id] }),
    approver: one(users,          { fields: [travelExpenses.approvedBy],      references: [users.id] }),
    creator:  one(users,          { fields: [travelExpenses.createdBy],       references: [users.id] }),
}))
