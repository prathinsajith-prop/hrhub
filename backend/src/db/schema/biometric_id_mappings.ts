/**
 * biometric_id_mappings — links a third-party / device identifier to an
 * HRHub employee record.
 *
 * Most biometric devices (ZKTeco, Suprema, BioStar) and time-attendance
 * platforms identify each person by a numeric "User ID" they assigned at
 * enrollment. When we import a punch file from such a device, the rows
 * carry that User ID rather than the HRHub employee_no — so we need this
 * mapping table to resolve one to the other.
 *
 * A single employee can have multiple mappings (e.g. a finger reader at
 * the office + a face reader at the warehouse), so the unique constraint
 * is on (tenantId, mapperId) — each external ID maps to exactly one
 * employee, but an employee can collect several external IDs.
 *
 * Soft-deleted (deletedAt) — historical punches reference these mappings
 * via the device id, so we can never hard-delete without losing the
 * audit trail.
 */
import { pgTable, uuid, text, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { employees } from './employees.js'
import { users } from './users.js'

export const biometricIdMappings = pgTable('biometric_id_mappings', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    /** The external identifier exactly as the device / system emits it.
     *  Stored as text — devices use everything from "1" to "EMP-008" to
     *  alphanumeric serials, so we don't constrain the shape. */
    mapperId: text('mapper_id').notNull(),
    /** Optional human label so HR can disambiguate when an employee has
     *  multiple mappings (e.g. "Finger reader — HQ" vs "Face — warehouse"). */
    label: text('label'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    tenantIdx:     index('idx_biometric_mappings_tenant').on(t.tenantId),
    employeeIdx:   index('idx_biometric_mappings_employee').on(t.tenantId, t.employeeId),
    // mapper_id is the lookup-by-external-key hot path during attendance
    // import — partial unique index on live rows only so HR can re-assign
    // an external ID after retiring the old mapping.
    mapperUniq:    uniqueIndex('uq_biometric_mappings_mapper')
        .on(t.tenantId, t.mapperId)
        .where(sql`${t.deletedAt} IS NULL`),
}))

export const biometricIdMappingsRelations = relations(biometricIdMappings, ({ one }) => ({
    tenant:   one(tenants,   { fields: [biometricIdMappings.tenantId],   references: [tenants.id] }),
    employee: one(employees, { fields: [biometricIdMappings.employeeId], references: [employees.id] }),
    creator:  one(users,     { fields: [biometricIdMappings.createdBy],  references: [users.id] }),
}))
