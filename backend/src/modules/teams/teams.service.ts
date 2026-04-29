import { eq, and, inArray, notInArray, ne, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { teams, teamMembers, employees, orgUnits } from '../../db/schema/index.js'

export interface CreateTeamInput {
    name: string
    description?: string
    departmentId?: string
    createdById: string
    creatorEmployeeId?: string | null
}

export interface TeamRow {
    id: string
    tenantId: string
    name: string
    description: string | null
    departmentId: string | null
    department: string | null
    createdById: string | null
    isActive: boolean
    memberCount: number
    createdAt: Date
    updatedAt: Date
}

export async function listTeams(tenantId: string, filterDepartmentId?: string): Promise<TeamRow[]> {
    const memberCounts = db
        .select({ teamId: teamMembers.teamId, count: sql<number>`COUNT(*)`.as('count') })
        .from(teamMembers)
        .groupBy(teamMembers.teamId)
        .as('mc')

    const conditions = [eq(teams.tenantId, tenantId), eq(teams.isActive, true)]
    if (filterDepartmentId) conditions.push(eq(teams.departmentId, filterDepartmentId))

    const rows = await db
        .select({
            id: teams.id,
            tenantId: teams.tenantId,
            name: teams.name,
            description: teams.description,
            departmentId: teams.departmentId,
            department: teams.department,
            createdById: teams.createdById,
            isActive: teams.isActive,
            memberCount: sql<number>`COALESCE(${memberCounts.count}, 0)`,
            createdAt: teams.createdAt,
            updatedAt: teams.updatedAt,
        })
        .from(teams)
        .leftJoin(memberCounts, eq(teams.id, memberCounts.teamId))
        .where(and(...conditions))
        .orderBy(teams.name)

    return rows
}

export async function getTeam(tenantId: string, teamId: string) {
    const [row] = await db
        .select()
        .from(teams)
        .where(and(eq(teams.id, teamId), eq(teams.tenantId, tenantId), eq(teams.isActive, true)))
        .limit(1)
    return row ?? null
}

export async function createTeam(tenantId: string, input: CreateTeamInput) {
    let departmentName: string | null = null
    if (input.departmentId) {
        const [unit] = await db.select({ name: orgUnits.name }).from(orgUnits)
            .where(eq(orgUnits.id, input.departmentId)).limit(1)
        departmentName = unit?.name ?? null
    }

    const [row] = await db.insert(teams).values({
        tenantId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        departmentId: input.departmentId ?? null,
        department: departmentName,
        createdById: input.createdById,
    }).returning()

    // Auto-add the creator as a member so they can see the team in "My Teams"
    if (input.creatorEmployeeId) {
        await db.insert(teamMembers).values({
            teamId: row.id,
            employeeId: input.creatorEmployeeId,
            tenantId,
        }).onConflictDoNothing()
    }

    return row
}

export async function updateTeam(tenantId: string, teamId: string, data: { name?: string; description?: string }) {
    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (data.name !== undefined) updates.name = data.name.trim()
    if (data.description !== undefined) updates.description = data.description.trim() || null

    const [row] = await db.update(teams)
        .set(updates)
        .where(and(eq(teams.id, teamId), eq(teams.tenantId, tenantId)))
        .returning()
    return row ?? null
}

export async function deleteTeam(tenantId: string, teamId: string) {
    const [row] = await db.update(teams)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(teams.id, teamId), eq(teams.tenantId, tenantId)))
        .returning()
    return row ?? null
}

export interface TeamMemberRow {
    id: string
    employeeId: string
    firstName: string
    lastName: string
    department: string | null
    designation: string | null
    avatarUrl: string | null
    email: string | null
    joinedAt: Date
}

export async function getTeamMembers(tenantId: string, teamId: string): Promise<TeamMemberRow[]> {
    return db
        .select({
            id: teamMembers.id,
            employeeId: employees.id,
            firstName: employees.firstName,
            lastName: employees.lastName,
            department: employees.department,
            designation: employees.designation,
            avatarUrl: employees.avatarUrl,
            email: employees.email,
            joinedAt: teamMembers.joinedAt,
        })
        .from(teamMembers)
        .innerJoin(employees, eq(teamMembers.employeeId, employees.id))
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.tenantId, tenantId)))
        .orderBy(employees.firstName, employees.lastName)
}

export async function addTeamMembers(tenantId: string, teamId: string, employeeIds: string[]) {
    const team = await getTeam(tenantId, teamId)
    if (!team) throw Object.assign(new Error('Team not found'), { statusCode: 404 })

    // Validate department membership when team is scoped to a department
    if (team.departmentId) {
        const eligible = await db
            .select({ id: employees.id })
            .from(employees)
            .where(and(
                eq(employees.tenantId, tenantId),
                eq(employees.departmentId, team.departmentId),
                eq(employees.isArchived, false),
                inArray(employees.id, employeeIds),
            ))
        const eligibleIds = new Set(eligible.map(e => e.id))
        const ineligible = employeeIds.filter(id => !eligibleIds.has(id))
        if (ineligible.length > 0) {
            throw Object.assign(
                new Error('One or more employees are not in this team\'s department'),
                { statusCode: 422 }
            )
        }
    }

    // Insert, ignoring duplicates
    const values = employeeIds.map(employeeId => ({ teamId, employeeId, tenantId }))
    const inserted = await db.insert(teamMembers).values(values).onConflictDoNothing().returning()
    return inserted
}

export async function removeTeamMember(tenantId: string, teamId: string, employeeId: string) {
    const [row] = await db.delete(teamMembers)
        .where(and(
            eq(teamMembers.teamId, teamId),
            eq(teamMembers.employeeId, employeeId),
            eq(teamMembers.tenantId, tenantId),
        ))
        .returning()
    return row ?? null
}

export async function getMyTeams(tenantId: string, employeeId: string) {
    const memberCounts = db
        .select({ teamId: teamMembers.teamId, count: sql<number>`COUNT(*)`.as('count') })
        .from(teamMembers)
        .groupBy(teamMembers.teamId)
        .as('mc')

    return db
        .select({
            id: teams.id,
            name: teams.name,
            description: teams.description,
            departmentId: teams.departmentId,
            department: teams.department,
            createdById: teams.createdById,
            memberCount: sql<number>`COALESCE(${memberCounts.count}, 0)`,
            joinedAt: teamMembers.joinedAt,
        })
        .from(teamMembers)
        .innerJoin(teams, and(eq(teamMembers.teamId, teams.id), eq(teams.isActive, true)))
        .leftJoin(memberCounts, eq(teams.id, memberCounts.teamId))
        .where(and(eq(teamMembers.employeeId, employeeId), eq(teamMembers.tenantId, tenantId)))
        .orderBy(teams.name)
}

/**
 * Called when an employee's departmentId changes. Removes the employee from
 * any teams whose department no longer matches the new department.
 */
export async function removeEmployeeFromMismatchedTeams(
    tenantId: string,
    employeeId: string,
    newDepartmentId: string | null,
) {
    // Find all teams this employee is in that have a specific department scope
    const memberships = await db
        .select({ teamId: teamMembers.teamId, teamDepartmentId: teams.departmentId })
        .from(teamMembers)
        .innerJoin(teams, eq(teamMembers.teamId, teams.id))
        .where(and(
            eq(teamMembers.employeeId, employeeId),
            eq(teamMembers.tenantId, tenantId),
            eq(teams.isActive, true),
        ))

    const toRemove = memberships
        .filter(m => m.teamDepartmentId !== null && m.teamDepartmentId !== newDepartmentId)
        .map(m => m.teamId)

    if (toRemove.length === 0) return

    await db.delete(teamMembers).where(and(
        eq(teamMembers.employeeId, employeeId),
        eq(teamMembers.tenantId, tenantId),
        inArray(teamMembers.teamId, toRemove),
    ))
}

/** Returns employees in the team's department who are NOT already members. */
export async function getEligibleEmployees(tenantId: string, teamId: string) {
    const team = await getTeam(tenantId, teamId)
    if (!team) return []

    const existing = await db
        .select({ employeeId: teamMembers.employeeId })
        .from(teamMembers)
        .where(eq(teamMembers.teamId, teamId))
    const existingIds = existing.map(m => m.employeeId)

    const conditions = [
        eq(employees.tenantId, tenantId),
        eq(employees.isArchived, false),
        ne(employees.status, 'terminated'),
    ]
    if (team.departmentId) conditions.push(eq(employees.departmentId, team.departmentId))
    if (existingIds.length > 0) conditions.push(notInArray(employees.id, existingIds))

    return db
        .select({
            id: employees.id,
            firstName: employees.firstName,
            lastName: employees.lastName,
            department: employees.department,
            designation: employees.designation,
            avatarUrl: employees.avatarUrl,
        })
        .from(employees)
        .where(and(...conditions))
        .orderBy(employees.firstName, employees.lastName)
        .limit(200)
}
