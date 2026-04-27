import { pgTable, uuid, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { tenants } from './tenants.js'
import { users } from './users.js'

export const subscriptionEvents = pgTable('subscription_events', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    eventType: text('event_type').notNull()
        .$type<'upgrade_request' | 'enterprise_contact' | 'plan_activated' | 'quota_updated' | 'checkout_created'>(),
    planFrom: text('plan_from'),
    planTo: text('plan_to'),
    employeeQuota: integer('employee_quota'),
    monthlyCost: integer('monthly_cost'),
    stripeSessionId: text('stripe_session_id'),
    contactName: text('contact_name'),
    contactEmail: text('contact_email'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
