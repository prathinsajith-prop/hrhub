import { pgTable, uuid, text, boolean, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { tenants } from './tenants.js'
import { employees } from './employees.js'
import { orgUnits } from './orgUnits.js'
import { users } from './users.js'

export const teams = pgTable('teams', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    departmentId: uuid('department_id').references(() => orgUnits.id, { onDelete: 'set null' }),
    department: text('department'),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    // Partial index: active-only tenant listing (the common query always filters is_active = true)
    activeIdx: index('idx_teams_active').on(t.tenantId).where(sql`${t.isActive} = true`),
    // Composite: department-filtered listing for dept_head access pattern
    deptIdx: index('idx_teams_dept').on(t.tenantId, t.departmentId)
        .where(sql`${t.isActive} = true AND ${t.departmentId} IS NOT NULL`),
}))

export const teamMembers = pgTable('team_members', {
    id: uuid('id').primaryKey().defaultRandom(),
    teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    // UNIQUE on (team_id, employee_id): dedup + implicit index on team_id as leading column
    uniqueMember: uniqueIndex('uq_team_member').on(t.teamId, t.employeeId),
    // "My teams" query: all memberships for a given employee
    employeeIdx: index('idx_team_members_employee').on(t.employeeId),
    // Auto-exit + tenant-scoped queries (dept change removes mismatched teams)
    tenantEmployeeIdx: index('idx_team_members_tenant_employee').on(t.tenantId, t.employeeId),
}))

export const teamsRelations = relations(teams, ({ one, many }) => ({
    tenant: one(tenants, { fields: [teams.tenantId], references: [tenants.id] }),
    department: one(orgUnits, { fields: [teams.departmentId], references: [orgUnits.id] }),
    createdBy: one(users, { fields: [teams.createdById], references: [users.id] }),
    members: many(teamMembers),
}))

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
    team: one(teams, { fields: [teamMembers.teamId], references: [teams.id] }),
    employee: one(employees, { fields: [teamMembers.employeeId], references: [employees.id] }),
    tenant: one(tenants, { fields: [teamMembers.tenantId], references: [tenants.id] }),
}))
