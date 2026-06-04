import { alias } from 'drizzle-orm/pg-core'
import { and, eq, ilike, inArray, isNotNull, or, sql } from 'drizzle-orm'

// Statuses that represent "currently employed". Anyone in onboarding still
// shows up in the colleagues picker and birthday lists — they're real people
// on the payroll, just mid-paperwork. Mirrors backend/src/modules/dashboard.
const WORKING_STATUSES = ['active', 'onboarding'] as const
import type { FastifyInstance } from 'fastify'
import { db } from '../../db/client.js'
import { employees, orgUnits, shifts } from '../../db/schema/index.js'
import { e403, e404 } from '../../lib/errors.js'
import { paginationSchema, parseUuidParam, validate } from '../../lib/validation.js'
import { buildTeammateScopeWhere, canViewTeammate, canAccessEmployee, getReportingSubtreeIds, isDeptHead } from '../../lib/scoping.js'

/**
 * Compute days-until-next-birthday in UTC, handling the year-end wrap so a
 * birthday on Jan 3 viewed on Dec 28 returns 6, not -360. Returns -1 for an
 * invalid date so the caller can filter the row out.
 */
function daysUntilBirthday(dob: string | null): number {
    if (!dob) return -1
    const d = new Date(dob)
    if (Number.isNaN(d.getTime())) return -1
    const now = new Date()
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    let next = new Date(Date.UTC(now.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    if (next < today) next = new Date(Date.UTC(now.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate()))
    return Math.round((next.getTime() - today.getTime()) / 86_400_000)
}

/**
 * Fetch an employee plus their reporting-to manager, assigned shift, AND the
 * three org-unit names (branch, division, department). Five left-joins keeps
 * the profile screen on a single round-trip.
 *
 * Why org-unit joins here: the legacy `employees.department` text column was
 * loaded with faker placeholder text in seed data ("Nostrum consequuntur ...")
 * for many tenants, while the actual department lives on the `org_units` row
 * referenced by `employees.department_id`. We prefer the org-unit name and
 * only fall back to the text column if the FK isn't set — matches the
 * priority used in the colleagues lookup.
 */
async function getEmployeeWithReportingTo(tenantId: string, id: string) {
    const manager = alias(employees, 'manager') as any
    const managerDeptUnit = alias(orgUnits, 'managerDeptUnit') as any
    const branchUnit = alias(orgUnits, 'branchUnit') as any
    const divisionUnit = alias(orgUnits, 'divisionUnit') as any
    const departmentUnit = alias(orgUnits, 'departmentUnit') as any
    const [row] = await db
        .select({
            employee: employees,
            reportingToName: sql<string | null>`CASE
                WHEN ${manager.id} IS NULL THEN NULL
                ELSE ${manager.firstName} || ' ' || ${manager.lastName}
            END`,
            reportingToEmployeeNo: manager.employeeNo,
            reportingToDesignation: manager.designation,
            // Resolve via org_units first, fall back to the legacy text column —
            // same priority used for the employee's own department so the
            // "Reports to" card can't show garbage seed text while the rest of
            // the page shows the proper org-unit name.
            reportingToDepartment: sql<string | null>`COALESCE(${managerDeptUnit.name}, ${manager.department})`,
            shiftName: shifts.name,
            shiftStartTime: shifts.startTime,
            shiftEndTime: shifts.endTime,
            shiftWeeklyOffDays: shifts.weeklyOffDays,
            branchName: branchUnit.name,
            divisionName: divisionUnit.name,
            departmentName: departmentUnit.name,
        })
        .from(employees)
        .leftJoin(manager, eq(employees.reportingTo, manager.id))
        .leftJoin(managerDeptUnit, eq(manager.departmentId, managerDeptUnit.id))
        .leftJoin(shifts, eq(employees.shiftId, shifts.id))
        .leftJoin(branchUnit, eq(employees.branchId, branchUnit.id))
        .leftJoin(divisionUnit, eq(employees.divisionId, divisionUnit.id))
        .leftJoin(departmentUnit, eq(employees.departmentId, departmentUnit.id))
        .where(and(eq(employees.tenantId, tenantId), eq(employees.id, id)))
        .limit(1)
    if (!row) return null

    // Prefer the canonical org-unit name; fall back to the legacy text column
    // only if no FK is set. This is what fixes "Nostrum consequuntur" garbage
    // showing instead of "Account Management Department".
    const department = row.departmentName ?? row.employee.department ?? null

    return {
        ...row.employee,
        // Overwrite the raw text column with the resolved name so every
        // consumer (profile card, leave dialog header, etc.) shows the same value.
        department,
        branchName: row.branchName ?? null,
        divisionName: row.divisionName ?? null,
        departmentName: row.departmentName ?? null,
        reportingToName: row.reportingToName,
        reportingToEmployeeNo: row.reportingToEmployeeNo,
        reportingToDesignation: row.reportingToDesignation,
        reportingToDepartment: row.reportingToDepartment,
        // Nested shift object — null when the employee has no assigned shift
        // (the tenant's default working week applies instead).
        shift: row.shiftStartTime
            ? {
                  name: row.shiftName,
                  startTime: row.shiftStartTime,
                  endTime: row.shiftEndTime,
                  weeklyOffDays: row.shiftWeeklyOffDays ?? [],
              }
            : null,
    }
}

// Non-sensitive fields a same-department PEER may see on the basic-profile
// screen. Explicit ALLOW-LIST (not a denylist) so newly-added sensitive columns
// (salary, allowances, passport, Emirates ID, bank/IBAN, DOB, visa, labour card,
// home address) can never leak by default. The full record is reserved for self
// / reporting-subtree / HR via `canAccessEmployee`.
function toBasicProfile(emp: NonNullable<Awaited<ReturnType<typeof getEmployeeWithReportingTo>>>) {
    return {
        id: emp.id,
        employeeNo: emp.employeeNo,
        firstName: emp.firstName,
        lastName: emp.lastName,
        email: emp.email,
        personalEmail: emp.personalEmail,
        phone: emp.phone,
        mobileNo: emp.mobileNo,
        designation: emp.designation,
        department: emp.department,
        nationality: emp.nationality,
        joinDate: emp.joinDate,
        status: emp.status,
        avatarUrl: emp.avatarUrl,
        branchName: emp.branchName,
        divisionName: emp.divisionName,
        departmentName: emp.departmentName,
        reportingToName: emp.reportingToName,
        reportingToEmployeeNo: emp.reportingToEmployeeNo,
        reportingToDesignation: emp.reportingToDesignation,
        reportingToDepartment: emp.reportingToDepartment,
        shift: emp.shift,
    }
}

export default async function employeesRoutes(fastify: FastifyInstance) {
    const auth = { preHandler: [(fastify as any).authenticate] }

    // GET /api/v1/employees/me — current user's own employee record (incl. their manager's name)
    fastify.get('/me', { ...auth }, async (request: any, reply: any) => {
        const { employeeId, tenantId } = request.user
        if (!employeeId) return reply.code(404).send(e404('No employee record linked to this account'))
        const employee = await getEmployeeWithReportingTo(tenantId, employeeId)
        if (!employee) return reply.code(404).send(e404('Employee not found'))
        // employees.email is nullable, but the user is definitely signed in with a
        // work email on `users.email` — surface that as the work email when the
        // employee record doesn't have its own, so the profile page always shows
        // a value instead of an em-dash.
        if (!employee.email && request.user.email) {
            employee.email = request.user.email
        }
        return reply.send({ data: employee })
    })

    // PATCH /api/v1/employees/me — locked. Contact / personal detail changes must
    // go through the approval pipeline (POST /api/v1/profile-changes) so an
    // admin / super_admin reviews them before they take effect. Direct
    // self-updates are rejected here so the review can't be bypassed.
    fastify.patch('/me', { ...auth }, async (request: any, reply: any) => {
        const { employeeId } = request.user
        if (!employeeId) return reply.code(404).send(e404('No employee record linked to this account'))
        return reply.code(403).send(e403('Profile changes must be submitted for approval. Please submit a change request instead.'))
    })

    // GET /api/v1/employees
    //
    // The "My Team" page on the portal — returns everyone the requester can
    // see, namely:
    //   - HR / super_admin: every employee in the tenant
    //   - dept_head:        same-department peers ∪ reporting subtree ∪ self
    //   - everyone else:    same-department peers ∪ self
    //
    // Same-department membership prefers the `department_id` FK and falls
    // back to the legacy text column, matching the priority used in the
    // colleagues lookup. The narrower scope (only reporting subtree / only
    // self) used to leave regular employees staring at a list with just
    // themselves on it.
    fastify.get('/', { ...auth }, async (request: any, reply: any) => {
        const query = validate(paginationSchema, request.query ?? {})
        const search = ((request.query as any)?.search as string | undefined)?.trim() || undefined

        const user = request.user
        // `null` from buildTeammateScopeWhere means HR/super_admin — no scope
        // restriction. Drizzle's `and()` treats `undefined` clauses as no-ops,
        // so we coerce.
        const scope = await buildTeammateScopeWhere(user, request)

        const whereExpr = and(
            eq(employees.tenantId, user.tenantId),
            scope ?? undefined,
            search
                ? or(
                      ilike(employees.firstName, `%${search}%`),
                      ilike(employees.lastName, `%${search}%`),
                      ilike(employees.employeeNo, `%${search}%`),
                  )
                : undefined,
        )

        // Project only the fields the team/list views actually render — keeps the
        // wire payload small (no salary/passport/bank fields leaking into a list response).
        //
        // `department` is resolved via the org_units FK (canonical source) with a
        // fallback to the legacy text column. This is why a teammate whose seed
        // data left `employees.department` as "Nostrum consequuntur" still shows
        // "Account Management Department" here — same value the employee sees on
        // their own profile, no UI mismatch between manager view and profile view.
        const departmentUnit = alias(orgUnits, 'departmentUnit') as any
        const rows = await db
            .select({
                id: employees.id,
                employeeNo: employees.employeeNo,
                firstName: employees.firstName,
                lastName: employees.lastName,
                email: employees.email,
                phone: employees.phone,
                mobileNo: employees.mobileNo,
                department: sql<string | null>`COALESCE(${departmentUnit.name}, ${employees.department})`,
                departmentId: employees.departmentId,
                designation: employees.designation,
                avatarUrl: employees.avatarUrl,
                status: employees.status,
                joinDate: employees.joinDate,
                reportingTo: employees.reportingTo,
                total: sql<number>`COUNT(*) OVER()`,
            })
            .from(employees)
            .leftJoin(departmentUnit, eq(employees.departmentId, departmentUnit.id))
            .where(whereExpr)
            .orderBy(employees.firstName)
            .limit(query.limit)
            .offset(query.offset)

        const total = rows[0]?.total ?? 0
        const data = rows.map(({ total: _t, ...rest }) => rest)
        return reply.send({
            data,
            total: Number(total),
            limit: query.limit,
            offset: query.offset,
            hasMore: query.offset + data.length < Number(total),
        })
    })

    // GET /api/v1/employees/colleagues
    //
    // Pickable colleagues for forms like the leave-handover Select — every
    // active employee in the requester's department, excluding themselves.
    // Returns a slim shape (no salary/passport/bank) and stays in-tenant.
    //
    // Department lookup priority (org models drifted over time, so both are valid):
    //   1. employees.department_id  — the canonical FK to org_units; preferred
    //   2. employees.department     — the legacy text column; fallback when
    //                                 the FK isn't set for this user
    // Falling back lets older tenants whose data never moved to the org-units
    // model keep working without manual backfill.
    fastify.get('/colleagues', { ...auth }, async (request: any, reply: any) => {
        const user = request.user
        if (!user.employeeId) return reply.send({ data: [] })

        const [me] = await db
            .select({
                department: employees.department,
                departmentId: employees.departmentId,
            })
            .from(employees)
            .where(and(eq(employees.tenantId, user.tenantId), eq(employees.id, user.employeeId)))
            .limit(1)
        if (!me) return reply.send({ data: [] })

        const conds = [
            eq(employees.tenantId, user.tenantId),
            inArray(employees.status, WORKING_STATUSES as unknown as string[]),
            sql`${employees.id} <> ${user.employeeId}`,
        ]
        if (me.departmentId) {
            conds.push(eq(employees.departmentId, me.departmentId))
        } else if (me.department) {
            conds.push(eq(employees.department, me.department))
        }
        // If the requester has neither a departmentId nor a department text
        // value, we still return their whole tenant minus themselves so they
        // can pick someone to hand over to instead of being blocked.

        // Resolve department name via the org-unit FK so the picker shows the
        // canonical name ("Account Management Department") rather than whatever
        // text is on the legacy column ("Nostrum consequuntur" in seed data).
        const colleagueDeptUnit = alias(orgUnits, 'colleagueDeptUnit') as any
        const data = await db
            .select({
                id: employees.id,
                employeeNo: employees.employeeNo,
                firstName: employees.firstName,
                lastName: employees.lastName,
                department: sql<string | null>`COALESCE(${colleagueDeptUnit.name}, ${employees.department})`,
                departmentId: employees.departmentId,
                designation: employees.designation,
                avatarUrl: employees.avatarUrl,
            })
            .from(employees)
            .leftJoin(colleagueDeptUnit, eq(employees.departmentId, colleagueDeptUnit.id))
            .where(and(...conds))
            .orderBy(employees.firstName)
            .limit(200)

        return reply.send({ data })
    })

    // GET /api/v1/employees/birthdays?days=30
    //
    // Upcoming birthdays inside the user's natural scope:
    //   - dept_head → entire reporting subtree (everyone they manage transitively)
    //   - everyone else → their own department (so they see colleagues' birthdays)
    //
    // Returns a flat list sorted by daysUntil ascending. Each row includes
    // `isToday` / `isTomorrow` flags so the UI can label them without
    // re-deriving from the date. Crosses the year-end correctly.
    //
    // IMPORTANT: this is a public-feeling endpoint, but it only exposes name +
    // employeeNo + department + day-of-year — never the year of birth. Don't
    // add `dateOfBirth` to the response without a privacy review.
    fastify.get('/birthdays', { ...auth }, async (request: any, reply: any) => {
        const user = request.user
        if (!user.employeeId) return reply.send({ data: [] })

        const daysRaw = Number((request.query as any)?.days ?? 30)
        const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(90, daysRaw)) : 30

        // Resolve the employee ID list to query.
        let scopeIds: string[]
        if (isDeptHead(user)) {
            scopeIds = await getReportingSubtreeIds(user.tenantId, user.employeeId, request)
        } else {
            // Look up the requester's department and pull everyone in it.
            const [me] = await db
                .select({
                    department: employees.department,
                    departmentId: employees.departmentId,
                })
                .from(employees)
                .where(and(eq(employees.tenantId, user.tenantId), eq(employees.id, user.employeeId)))
                .limit(1)
            if (!me) return reply.send({ data: [] })

            const conds = [
                eq(employees.tenantId, user.tenantId),
                inArray(employees.status, WORKING_STATUSES as unknown as string[]),
            ]
            if (me.departmentId) conds.push(eq(employees.departmentId, me.departmentId))
            else if (me.department) conds.push(eq(employees.department, me.department))
            // If the requester has no department at all, still return the
            // tenant's birthdays so the page isn't blank — better than an
            // empty card with no explanation.

            const ids = await db
                .select({ id: employees.id })
                .from(employees)
                .where(and(...conds))
            scopeIds = ids.map(r => r.id)
        }

        if (scopeIds.length === 0) return reply.send({ data: [] })

        const inList = sql`(${sql.join(scopeIds.map(id => sql`${id}`), sql`, `)})`
        const birthdayDeptUnit = alias(orgUnits, 'birthdayDeptUnit') as any
        const rows = await db
            .select({
                id: employees.id,
                firstName: employees.firstName,
                lastName: employees.lastName,
                employeeNo: employees.employeeNo,
                department: sql<string | null>`COALESCE(${birthdayDeptUnit.name}, ${employees.department})`,
                designation: employees.designation,
                avatarUrl: employees.avatarUrl,
                dateOfBirth: employees.dateOfBirth,
            })
            .from(employees)
            .leftJoin(birthdayDeptUnit, eq(employees.departmentId, birthdayDeptUnit.id))
            .where(and(
                eq(employees.tenantId, user.tenantId),
                isNotNull(employees.dateOfBirth),
                sql`${employees.id} IN ${inList}`,
            ))

        const list = rows
            .map(r => {
                const du = daysUntilBirthday(r.dateOfBirth)
                if (du < 0 || du > days) return null
                const d = new Date(r.dateOfBirth!)
                return {
                    id: r.id,
                    name: `${r.firstName} ${r.lastName}`.trim(),
                    employeeNo: r.employeeNo,
                    department: r.department ?? '',
                    designation: r.designation ?? '',
                    avatarUrl: r.avatarUrl ?? null,
                    day: d.getUTCDate(),
                    month: d.getUTCMonth() + 1,
                    daysUntil: du,
                    isToday: du === 0,
                    isTomorrow: du === 1,
                }
            })
            .filter((x): x is NonNullable<typeof x> => x !== null)
            .sort((a, b) => a.daysUntil - b.daysUntil)

        return reply.send({ data: list })
    })

    // GET /api/v1/employees/:id — profile for self, manager-subtree, or a
    // same-department peer.
    //
    // ACCESS TIERS (the WHOLE employees row carries payroll + passport +
    // Emirates ID + bank/IBAN, so the response is scoped to the caller's tier):
    //   • Full access — self / reporting-subtree / HR (`canAccessEmployee`):
    //     the complete record (the dedicated PII screens already trust these).
    //   • Peer access — same-department colleague only (`canViewTeammate`):
    //     a slim, PII-free basic profile (`toBasicProfile`).
    // Previously this returned the full row to any same-department peer, leaking
    // colleagues' salary / passport / Emirates ID / bank details.
    fastify.get('/:id', { ...auth }, async (request: any, reply: any) => {
        const id = parseUuidParam(request.params, 'id', reply)
        if (!id) return

        const user = request.user
        const employee = await getEmployeeWithReportingTo(user.tenantId, id)
        if (!employee) return reply.code(404).send(e404('Employee not found'))

        const fullAccess = await canAccessEmployee(user, employee.id, request)
        if (!fullAccess && !(await canViewTeammate(user, employee.id, request))) {
            return reply.code(403).send(e403('Not authorized to view this employee'))
        }
        return reply.send({ data: fullAccess ? employee : toBasicProfile(employee) })
    })
}
