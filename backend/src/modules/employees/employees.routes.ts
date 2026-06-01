import {
    listEmployees, getEmployee, createEmployee,
    updateEmployee, archiveEmployee, getExpiringVisas, getOrgChart,
    generateNextEmployeeNo,
} from './employees.service.js'
import { validate, createEmployeeSchema, updateEmployeeSchema, listEmployeesSchema } from '../../lib/validation.js'
import { recordActivity } from '../audit/audit.service.js'
import { uploadObject, buildS3Key, generateDownloadUrl } from '../../plugins/s3.js'
import { db } from '../../db/index.js'
import { entities, employees, employeeSalaryComponents, salaryComponents, tenants, users, orgUnits, gradeLevels, sponsoringEntities } from '../../db/schema/index.js'
import { maskAuditChanges, resolveReferenceNames } from '../audit/audit.changes.js'
import { eq, and, sql, inArray } from 'drizzle-orm'
import { loadPrivacyPolicy, maskEmployeeForViewer, viewerCanBypassPrivacy, effectiveVisibility, type PrivacyOverrides } from '../../lib/privacy.js'
import { inviteUser, resendInvite } from '../settings/settings.service.js'
import { fileTypeFromBuffer } from 'file-type'
import { enforceEmployeeQuota } from '../subscription/subscription.service.js'
import { generateReportPdf } from '../../lib/pdf.js'
export default async function (fastify: any): Promise<void> {
    const auth = { preHandler: [fastify.authenticate] }
    const hrOnly = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }

    // GET /api/v1/employees
    fastify.get('/', { ...auth, schema: { tags: ['Employees'] } }, async (request, reply) => {
        const query = validate(listEmployeesSchema, request.query)
        const user = (request as any).user

        // dept_head: scope to their own reporting subtree (direct + indirect reports
        // plus themselves). This is enforced server-side — the client filter is ignored.
        const managerEmployeeId = user.role === 'dept_head'
            ? (user.employeeId ?? undefined)
            : undefined

        // Resolve the org Privacy Policy ONCE per request. The policy now
        // doubles as a feature-flag bag — when a toggle is OFF the field is
        // hidden from everyone (including HR), so we ALWAYS load it and
        // ALWAYS apply the mask. The `isPeer` flag then controls whether
        // per-employee overrides also kick in (peer-only). HR sees feature
        // flags applied but not the peer-opt-out layer.
        const isPeer = !viewerCanBypassPrivacy(user.role)
        const policy = await loadPrivacyPolicy(request.user.tenantId)

        const result = await listEmployees({
            tenantId: request.user.tenantId,
            search: query.search,
            status: query.status,
            department: managerEmployeeId ? undefined : query.department,
            managerEmployeeId,
            filter: (query as any).filter,
            limit: query.limit,
            offset: query.offset,
            after: query.after,
            // Directory filter applies only to peer viewers — HR still sees
            // everyone for admin operations (assign leave, run payroll, etc).
            directoryPrivacy: isPeer
                ? {
                    policySearchableInDirectory: policy.searchableInDirectory,
                    viewerEmployeeId: user.employeeId ?? null,
                }
                : undefined,
        })

        if (Array.isArray((result as any).data)) {
            const rows = (result as any).data as Array<{ id: string }>
            for (const row of rows) {
                // Self-view always sees own row in full — bypass the mask.
                if (user.employeeId && row.id === user.employeeId) continue
                maskEmployeeForViewer(row as any, policy, isPeer)
            }
        }

        return reply.send(result)
    })

    // GET /api/v1/employees/export?format=csv|pdf — CSV/PDF export for HR managers and super admins
    fastify.get('/export', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Employees'] },
    }, async (request: any, reply: any) => {
        const { format = 'csv', filter } = request.query as { format?: string; filter?: string }
        if (format !== 'csv' && format !== 'pdf') return reply.code(400).send({ message: 'Invalid format. Must be csv or pdf.' })
        if (filter && filter.length > 2000) return reply.code(400).send({ message: 'filter too long' })
        const result = await listEmployees({
            tenantId: request.user.tenantId,
            filter,
            limit: 10000,
            offset: 0,
        })
        const rows = result.data as Record<string, unknown>[]
        const date = new Date().toISOString().slice(0, 10)

        // Even though export is HR-only, the org Policy toggles are feature
        // flags — if the org has turned off "Birthday" / "Work Anniversary"
        // / "Mobile", those columns should be empty in the export too. Run
        // the same mask we apply on the read API. Pass isPeer=false because
        // export is HR; the feature-flag layer is the only one that fires.
        const policy = await loadPrivacyPolicy(request.user.tenantId)
        for (const row of rows) {
            maskEmployeeForViewer(row as { id: string }, policy, false)
        }

        if (format === 'pdf') {
            const [tenantRow] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, request.user.tenantId)).limit(1)
            const pdf = await generateReportPdf({
                title: 'Employee Directory',
                companyName: tenantRow?.name ?? '',
                columns: [
                    { header: 'Emp No', key: 'employeeNo', width: 70 },
                    { header: 'First Name', key: 'firstName', width: 90 },
                    { header: 'Last Name', key: 'lastName', width: 90 },
                    { header: 'Department', key: 'department', width: 100 },
                    { header: 'Designation', key: 'designation', width: 110 },
                    { header: 'Status', key: 'status', width: 70 },
                    { header: 'Join Date', key: 'joinDate', width: 75 },
                    { header: 'Nationality', key: 'nationality', width: 80 },
                    { header: 'Email', key: 'email' },
                ],
                rows,
            })
            reply.header('Content-Type', 'application/pdf')
            reply.header('Content-Disposition', `attachment; filename="employees-report-${date}.pdf"`)
            return reply.send(pdf)
        }

        const csvHeaders = ['employeeNo', 'firstName', 'lastName', 'email', 'phone', 'department', 'designation', 'status', 'joinDate', 'nationality', 'basicSalary', 'contractType']
        const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
        const lines = [csvHeaders.join(','), ...rows.map(r => csvHeaders.map(h => escape(r[h])).join(','))]
        const csv = lines.join('\r\n')

        reply.header('Content-Type', 'text/csv; charset=utf-8')
        reply.header('Content-Disposition', `attachment; filename="employees-${date}.csv"`)
        return reply.send(csv)
    })

    // GET /api/v1/employees/me — current user's own employee record
    fastify.get('/me', { ...auth, schema: { tags: ['Employees'] } }, async (request: any, reply: any) => {
        const { employeeId, tenantId } = request.user
        if (!employeeId) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'No employee record linked to this account.' })
        const employee = await getEmployee(tenantId, employeeId)
        if (!employee) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Employee not found.' })
        return reply.send({ data: employee })
    })

    // PATCH /api/v1/employees/me — update own personal details
    fastify.patch('/me', { ...auth, schema: { tags: ['Employees'] } }, async (request: any, reply: any) => {
        const { employeeId, tenantId } = request.user
        if (!employeeId) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'No employee record linked to this account.' })
        const allowed = ['phone', 'mobileNo', 'personalEmail', 'emergencyContact', 'emergencyContactName', 'emergencyContactPhone', 'homeCountryAddress']
        const body = request.body as Record<string, unknown>
        const patch: Record<string, unknown> = {}
        for (const key of allowed) {
            if (key in body) patch[key] = body[key]
        }
        const before = await getEmployee(tenantId, employeeId)
        const employee = await updateEmployee(tenantId, employeeId, patch)
        if (!employee) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Employee not found.' })
        // Build a from/to change set so the Updates tab shows the diff —
        // employee self-edits should be visible to HR and to the employee.
        const changes: Record<string, { from: unknown; to: unknown }> = {}
        if (before) {
            for (const key of Object.keys(patch)) {
                const from = (before as any)[key] ?? null
                const to = (employee as any)[key] ?? null
                if (from !== to) changes[key] = { from, to }
            }
        }
        if (Object.keys(changes).length > 0) {
            recordActivity({
                tenantId,
                userId: request.user.id,
                actorName: request.user.name,
                actorRole: request.user.role,
                entityType: 'employee',
                entityId: employeeId,
                entityName: 'My profile',
                action: 'update',
                changes,
                metadata: { kind: 'profile', subKind: 'self-update' },
                ipAddress: request.ip,
                userAgent: request.headers['user-agent'],
            }).catch(() => { })
        }
        return reply.send({ data: employee })
    })

    // GET /api/v1/employees/org-chart
    fastify.get('/org-chart', { ...auth, schema: { tags: ['Employees'] } }, async (request: any, reply: any) => {
        // dept_head + employee: scope to own subtree + ancestor chain only
        // hr_manager / pro_officer / super_admin: full chart
        const scopedRoles = ['dept_head', 'employee', 'pro_officer']
        const rootEmployeeId = scopedRoles.includes(request.user.role)
            ? (request.user.employeeId ?? undefined)
            : undefined
        return reply.send(await getOrgChart(request.user.tenantId, rootEmployeeId))
    })

    // GET /api/v1/employees/expiring-visas — HR/PRO only; contains visa numbers and expiry dates
    fastify.get('/expiring-visas', { ...hrOnly, schema: { tags: ['Employees'] } }, async (request, reply) => {
        const { days = '90' } = request.query as { days?: string }
        const data = await getExpiringVisas(request.user.tenantId, Number(days))
        return reply.send({ data })
    })

    // GET /api/v1/employees/next-employee-no — preview the next auto-generated number
    fastify.get('/next-employee-no', { ...auth, schema: { tags: ['Employees'] } }, async (request: any, reply: any) => {
        const employeeNo = await generateNextEmployeeNo(request.user.tenantId)
        return reply.send({ data: { employeeNo } })
    })

    // POST /api/v1/employees/:id/invite — create a login account for this employee
    fastify.post('/:id/invite', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Employees'] },
    }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const { role: requestedRole, roles: requestedRoles } = (request.body ?? {}) as { role?: string; roles?: string[] }
        // hr_manager cannot assign super_admin role
        const role = requestedRole === 'super_admin' && request.user.role !== 'super_admin'
            ? 'employee'
            : (requestedRole ?? 'employee')
        const roles = requestedRoles?.filter(r => !(r === 'super_admin' && request.user.role !== 'super_admin'))
        let result: { name: string }
        try {
            result = await inviteUser(request.user.tenantId, { employeeId: id, role, roles })
        } catch (err: any) {
            return reply.code(err.statusCode ?? 500).send({ message: err.message })
        }
        const inviteName = result.name

        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'employee',
            entityId: id,
            entityName: inviteName,
            action: 'invite',
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })

        return reply.code(201).send({ message: 'Invitation sent' })
    })

    // POST /api/v1/employees/:id/resend-invite — resend invite to inactive (pending) account
    fastify.post('/:id/resend-invite', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Employees'] },
    }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        await resendInvite(request.user.tenantId, id)
        return reply.code(200).send({ message: 'Invite resent' })
    })

    // GET /api/v1/employees/:id/account — check if employee has a login account
    fastify.get('/:id/account', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Employees'] },
    }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }

        const [account] = await db
            .select({
                id: users.id,
                email: users.email,
                role: users.role,
                roles: users.roles,
                isActive: users.isActive,
                lastLoginAt: users.lastLoginAt,
                createdAt: users.createdAt,
                attendancePunchEnabled: users.attendancePunchEnabled,
                attendanceManualEntryEnabled: users.attendanceManualEntryEnabled,
            })
            .from(users)
            .where(and(eq(users.employeeId, id), eq(users.tenantId, request.user.tenantId)))
            .limit(1)

        return reply.send({ data: { hasAccount: !!account, account: account ?? null } })
    })

    // GET /api/v1/employees/:id
    fastify.get('/:id', { ...auth, schema: { tags: ['Employees'] } }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const employee = await getEmployee(request.user.tenantId, id)
        if (!employee) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Employee not found' })

        // Apply the Organization Policy mask. Feature flags hit everyone,
        // peer overrides hit only peers. Self-view always sees own data.
        const user = (request as any).user
        const employeeRow = employee as typeof employee & { id: string; privacyOverrides?: PrivacyOverrides | null }
        const isSelf = user.employeeId === employeeRow.id
        const isPeer = !viewerCanBypassPrivacy(user.role) && !isSelf
        const policy = await loadPrivacyPolicy(user.tenantId)

        // Directory-hidden employees return 404 to peers — uniform with the
        // list endpoint (don't leak existence). HR + self can still load.
        if (isPeer) {
            const visibility = effectiveVisibility(policy, employeeRow.privacyOverrides ?? {})
            if (!visibility.searchableInDirectory) {
                return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Employee not found' })
            }
        }

        if (!isSelf) {
            maskEmployeeForViewer(employeeRow, policy, isPeer)
        }
        return reply.send({ data: employee })
    })

    // GET /api/v1/employees/:id/salary-components
    //
    // Per-employee assignments joined with the catalog. The Add/Edit Employee
    // form uses this to pre-fill the salary inputs — for an old employee
    // created before the assignment table existed, the backfill migration
    // (0044) populated these rows from the legacy basicSalary / housing /
    // transport / other columns, so the form will see them either way.
    fastify.get('/:id/salary-components', { ...auth, schema: { tags: ['Employees'] } }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const user = (request as any).user
        // Verify the employee belongs to the tenant before exposing salary
        // info — and ALSO check the directory privacy gate for peers. We
        // pull privacyOverrides at the same time so the gate check costs no
        // extra round-trip.
        const [emp] = await db
            .select({ id: employees.id, privacyOverrides: employees.privacyOverrides })
            .from(employees)
            .where(and(eq(employees.id, id), eq(employees.tenantId, request.user.tenantId)))
            .limit(1)
        if (!emp) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Employee not found' })
        // For peer viewers (non-HR, non-self), refuse if the target is
        // hidden from the directory. Same 404 contract as GET /:id so
        // existence isn't leaked.
        const isSelf = user.employeeId === emp.id
        const isPeer = !viewerCanBypassPrivacy(user.role) && !isSelf
        if (isPeer) {
            const policy = await loadPrivacyPolicy(user.tenantId)
            const vis = effectiveVisibility(policy, emp.privacyOverrides ?? {})
            if (!vis.searchableInDirectory) {
                return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Employee not found' })
            }
        }

        const rows = await db
            .select({
                componentId: employeeSalaryComponents.componentId,
                amount: employeeSalaryComponents.amount,
                isActive: employeeSalaryComponents.isActive,
                category: salaryComponents.category,
                name: salaryComponents.name,
                calculationType: salaryComponents.calculationType,
                catalogAmount: salaryComponents.amount,
            })
            .from(employeeSalaryComponents)
            .innerJoin(salaryComponents, eq(salaryComponents.id, employeeSalaryComponents.componentId))
            .where(and(
                eq(employeeSalaryComponents.tenantId, request.user.tenantId),
                eq(employeeSalaryComponents.employeeId, id),
            ))

        return reply.send({ data: rows })
    })

    // POST /api/v1/employees
    fastify.post('/', {
        ...auth,
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Employees'] },
    }, async (request, reply) => {
        // Enforce subscription quota before creating the employee
        await enforceEmployeeQuota(request.user.tenantId)

        const body = validate(createEmployeeSchema, request.body)
        // Resolve entityId — use provided value or fall back to the tenant's first entity.
        // If the tenant has no entity yet (e.g. self-registered before the
        // entity-on-register fix), auto-create a default one rather than 400.
        let entityId = body.entityId
        if (!entityId) {
            const [defaultEntity] = await db
                .select({ id: entities.id })
                .from(entities)
                .where(eq(entities.tenantId, request.user.tenantId))
                .limit(1)
            if (defaultEntity) {
                entityId = defaultEntity.id
            } else {
                const [tenantRow] = await db
                    .select({ name: tenants.name })
                    .from(tenants)
                    .where(eq(tenants.id, request.user.tenantId))
                    .limit(1)
                const [created] = await db
                    .insert(entities)
                    .values({
                        tenantId: request.user.tenantId,
                        entityName: tenantRow?.name ?? 'Default Entity',
                        licenseType: 'mainland',
                    })
                    .returning({ id: entities.id })
                entityId = created.id
            }
        }

        // When the caller provides an explicit employee number, verify it is
        // not already in use before attempting the insert so we can return a
        // clear 409 instead of letting the DB constraint bubble as a 500.
        if (body.employeeNo) {
            const [dup] = await db
                .select({ id: employees.id })
                .from(employees)
                .where(and(
                    eq(employees.tenantId, request.user.tenantId),
                    eq(employees.employeeNo, body.employeeNo),
                ))
                .limit(1)
            if (dup) {
                return reply.code(409).send({
                    statusCode: 409,
                    error: 'Conflict',
                    message: `Employee ID "${body.employeeNo}" is already in use`,
                })
            }
        }

        const employeeNo = body.employeeNo ?? (await generateNextEmployeeNo(request.user.tenantId))
        // Strip salaryComponents out of the row payload — that field belongs
        // to a different table; we insert assignment rows after the employee
        // row is created.
        const { salaryComponents: assignmentInputs, ...employeeRow } = body as typeof body & {
            salaryComponents?: { componentId: string; amount: number }[]
        }
        try {
            const employee = await createEmployee(request.user.tenantId, { ...employeeRow, employeeNo, entityId } as never)

            // Persist the salary-component assignments. We validate the
            // componentIds belong to the same tenant before inserting (the DB
            // trigger would catch a mismatch too, but the explicit check gives
            // a clean 400 instead of a 500). Each assignment carries its own
            // `amount` which overrides the catalog default.
            if (assignmentInputs && assignmentInputs.length > 0) {
                const ids = assignmentInputs.map(a => a.componentId)
                const valid = await db
                    .select({ id: salaryComponents.id })
                    .from(salaryComponents)
                    .where(and(
                        eq(salaryComponents.tenantId, request.user.tenantId),
                        inArray(salaryComponents.id, ids),
                    ))
                const validSet = new Set(valid.map(v => v.id))
                const rows = assignmentInputs
                    .filter(a => validSet.has(a.componentId))
                    .map(a => ({
                        tenantId: request.user.tenantId,
                        employeeId: employee.id,
                        componentId: a.componentId,
                        amount: String(a.amount.toFixed(2)),
                        isActive: true,
                    }))
                if (rows.length > 0) {
                    await db.insert(employeeSalaryComponents).values(rows).onConflictDoNothing()
                }
            }

            recordActivity({
                tenantId: request.user.tenantId,
                userId: request.user.id,
                actorName: request.user.name,
                actorRole: request.user.role,
                entityType: 'employee',
                entityId: employee.id,
                entityName: employee.fullName,
                action: 'create',
                metadata: { componentAssignments: assignmentInputs?.length ?? 0 },
                ipAddress: (request as any).ip,
                userAgent: request.headers['user-agent'],
            }).catch(() => { })
            return reply.code(201).send({ data: employee })
        } catch (err: any) {
            if (err?.code === '23505') {
                return reply.code(409).send({ statusCode: 409, error: 'Conflict', message: `Employee ID "${employeeNo}" is already in use` })
            }
            throw err
        }
    })

    // PATCH /api/v1/employees/:id
    fastify.patch('/:id', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Employees'] },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const body = validate(updateEmployeeSchema, request.body)
        if (body.employeeNo) {
            const [dup] = await db
                .select({ id: employees.id })
                .from(employees)
                .where(and(
                    eq(employees.tenantId, request.user.tenantId),
                    eq(employees.employeeNo, body.employeeNo),
                ))
                .limit(1)
            if (dup && dup.id !== id) {
                return reply.code(409).send({
                    statusCode: 409,
                    error: 'Conflict',
                    message: `Employee ID "${body.employeeNo}" is already in use`,
                })
            }
        }
        // Pull salaryComponents off the row payload — like the create route,
        // assignments live in a sibling table.
        const { salaryComponents: assignmentInputs, ...employeeUpdate } = body as typeof body & {
            salaryComponents?: { componentId: string; amount: number }[]
        }
        const before = await getEmployee(request.user.tenantId, id)
        const updated = await updateEmployee(request.user.tenantId, id, employeeUpdate as never)
        if (!updated) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Employee not found' })

        // Sync the assignment table when the caller sent updated amounts.
        // Strategy: upsert each row by (employee_id, component_id). A
        // component that's no longer in the payload retains its prior value
        // unless explicitly zeroed — the form sends every active earning so
        // this works in practice, and we don't accidentally wipe assignments
        // when a partial PATCH lacks the field.
        if (assignmentInputs && assignmentInputs.length > 0) {
            const ids = assignmentInputs.map(a => a.componentId)
            const valid = await db
                .select({ id: salaryComponents.id })
                .from(salaryComponents)
                .where(and(
                    eq(salaryComponents.tenantId, request.user.tenantId),
                    inArray(salaryComponents.id, ids),
                ))
            const validSet = new Set(valid.map(v => v.id))
            const rows = assignmentInputs
                .filter(a => validSet.has(a.componentId))
                .map(a => ({
                    tenantId: request.user.tenantId,
                    employeeId: id,
                    componentId: a.componentId,
                    amount: String(a.amount.toFixed(2)),
                    isActive: true,
                    updatedAt: new Date(),
                }))
            if (rows.length > 0) {
                await db
                    .insert(employeeSalaryComponents)
                    .values(rows)
                    .onConflictDoUpdate({
                        target: [employeeSalaryComponents.employeeId, employeeSalaryComponents.componentId],
                        set: {
                            amount: sql`excluded.amount`,
                            isActive: sql`excluded.is_active`,
                            updatedAt: sql`excluded.updated_at`,
                        },
                    })
            }
        }

        // Diff EVERY field the caller actually sent (before vs after), rather
        // than a fixed allow-list — otherwise payroll edits (housing/transport/
        // other allowances, total salary, bank details) silently produced an
        // "updated" entry with no visible change. ID/internal fields are skipped
        // because they'd render as raw UUIDs; their human-readable denormalized
        // counterparts (department, designation, managerName) carry the meaning.
        const DIFF_EXCLUDE = new Set([
            'gradeLevelId', 'reportingTo', 'sponsoringEntityId', 'shiftId',
            'divisionId', 'departmentId', 'branchId', 'avatarUrl', 'employeeNo',
        ])
        // Fields that mean "this was a payroll / banking change" — drives the
        // activity headline so the Updates tab + employee portal read cleanly.
        const PAYROLL_FIELDS = new Set([
            'basicSalary', 'totalSalary', 'housingAllowance', 'transportAllowance',
            'otherAllowances', 'paymentMethod', 'bankName', 'accountName',
            'accountNumber', 'swiftCode', 'bankBranch', 'iban', 'emiratisationCategory',
        ])
        const norm = (v: unknown) => {
            if (v === null || v === undefined || v === '') return null
            // Normalise numeric strings ("5000.00") and numbers (5000) so a
            // re-save of the same amount isn't flagged as a change.
            if (typeof v === 'number') return Number(v)
            if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v)
            return v
        }
        const changes: Record<string, { from: unknown; to: unknown }> = {}
        let payrollChanged = false
        for (const key of Object.keys(employeeUpdate)) {
            if (DIFF_EXCLUDE.has(key)) continue
            const prev = (before as any)?.[key]
            const next = (updated as any)?.[key]
            if (norm(prev) !== norm(next)) {
                changes[key] = { from: prev ?? null, to: next ?? null }
                if (PAYROLL_FIELDS.has(key)) payrollChanged = true
            }
        }
        // A salary-component assignment change still bumps total/basic on the
        // employee row, so payrollChanged is already true above when amounts
        // move. Treat any assignment payload as a payroll touch regardless.
        if (assignmentInputs && assignmentInputs.length > 0) payrollChanged = true

        // Resolve FK changes (division/branch/grade/sponsor/manager) to readable
        // from→to NAMES so those changes are no longer dark in the audit trail,
        // then mask sensitive identifiers (IBAN/account/passport/Emirates ID).
        // Kept fire-and-forget so the name lookups never delay the response.
        maskAuditChanges(changes)
        // A resolution failure must not suppress the audit entry — degrade to {}.
        resolveReferenceNames(request.user.tenantId, before, updated)
            .catch(() => ({}))
            .then(refChanges => {
                Object.assign(changes, refChanges)
                return recordActivity({
                    tenantId: request.user.tenantId,
                    userId: request.user.id,
                    actorName: request.user.name,
                    actorRole: request.user.role,
                    entityType: 'employee',
                    entityId: updated.id,
                    entityName: payrollChanged ? 'Payroll details' : `${updated.firstName} ${updated.lastName}`,
                    action: 'update',
                    changes: Object.keys(changes).length > 0 ? changes : undefined,
                    metadata: payrollChanged ? { kind: 'payroll', subKind: 'update' } : undefined,
                    module: 'employees',
                    requestId: (request as any).requestId,
                    ipAddress: (request as any).ip,
                    userAgent: request.headers['user-agent'],
                })
            })
            .catch(() => { })
        return reply.send({ data: updated })
    })

    // DELETE /api/v1/employees/:id
    fastify.delete('/:id', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Employees'] },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const archived = await archiveEmployee(request.user.tenantId, id)
        if (!archived) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Employee not found' })
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'employee',
            entityId: archived.id,
            entityName: `${archived.firstName} ${archived.lastName}`,
            action: 'delete',
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.code(204).send()
    })

    // POST /api/v1/employees/bulk-import
    // Body: { employees: Array<{firstName, lastName, email, employeeNo, joinDate, entityId, department?, designation?, basicSalary?}> }
    fastify.post('/bulk-import', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Employees'] },
    }, async (request: any, reply: any) => {
        const { employees: rows } = request.body as { employees: Record<string, string>[] }
        if (!Array.isArray(rows) || rows.length === 0) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'employees array is required' })
        }
        if (rows.length > 500) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Max 500 employees per import' })
        }
        const results: { row: number; error: string }[] = []
        let created = 0

        // Insert all rows inside a single transaction so any failure rolls back
        // the whole batch. Employee numbers are generated inside the transaction
        // so the COUNT sees in-progress inserts and produces unique sequences
        // even under concurrent imports.
        if (rows.length > 0) {
            try {
                await db.transaction(async (tx) => {
                    for (let i = 0; i < rows.length; i++) {
                        try {
                            const row = validate(createEmployeeSchema, rows[i])
                            const employeeNo = row.employeeNo || await generateNextEmployeeNo(request.user.tenantId, tx)
                            await tx.insert(employees).values({ ...row, employeeNo, tenantId: request.user.tenantId })
                            created++
                        } catch (e: any) {
                            results.push({ row: i + 1, error: e.message ?? 'Unknown error' })
                            throw e // abort the entire transaction
                        }
                    }
                })
            } catch {
                created = 0 // transaction rolled back
            }
        }

        const failed = rows.length - created
        return reply.code(created > 0 || failed === 0 ? 201 : 400).send({ created, failed, errors: results })
    })

    // POST /api/v1/employees/:id/avatar — upload profile image to S3
    fastify.post('/:id/avatar', {
        preHandler: [fastify.authenticate],
        schema: { tags: ['Employees'] },
    }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }

        // Only HR managers / super admins can update any employee's avatar.
        // Regular employees can only update their own.
        const isElevated = ['hr_manager', 'super_admin'].includes(request.user.role)
        if (!isElevated && request.user.employeeId !== id) {
            return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'You can only update your own avatar.' })
        }

        const part = await request.file()
        if (!part) return reply.code(400).send({ message: 'No file provided' })

        const MAX_AVATAR_BYTES = 5 * 1024 * 1024 // 5 MB
        const chunks: Buffer[] = []
        let totalSize = 0
        for await (const chunk of part.file) {
            totalSize += (chunk as Buffer).length
            if (totalSize > MAX_AVATAR_BYTES) {
                return reply.code(413).send({ message: 'Avatar image must be under 5 MB' })
            }
            chunks.push(chunk as Buffer)
        }
        const buffer = Buffer.concat(chunks)

        // Validate via magic bytes — never trust the client-supplied Content-Type
        const allowedMime: Record<string, string> = {
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/webp': '.webp',
            'image/gif': '.gif',
        }
        const detected = await fileTypeFromBuffer(buffer)
        if (!detected || !allowedMime[detected.mime]) {
            return reply.code(415).send({ message: 'Only JPEG, PNG, WEBP, or GIF images are allowed' })
        }

        const safeName = `avatar${allowedMime[detected.mime]}`
        const s3Key = buildS3Key(request.user.tenantId, `employees/${id}/avatar`, safeName)

        try {
            await uploadObject(s3Key, buffer, detected.mime)
        } catch (err: any) {
            request.log.error({ err, s3Message: err?.message, s3Code: err?.name, s3Status: err?.$metadata?.httpStatusCode }, 'S3 avatar upload failed')
            return reply.code(503).send({ message: 'File storage service is unavailable. Please try again later.' })
        }

        const updated = await updateEmployee(request.user.tenantId, id, { avatarUrl: s3Key } as never)
        if (!updated) return reply.code(404).send({ message: 'Employee not found' })

        // Sync avatar to the linked user account (employees.id → users.employeeId)
        await db.update(users)
            .set({ avatarUrl: s3Key, updatedAt: new Date() })
            .where(and(eq(users.employeeId, id), eq(users.tenantId, request.user.tenantId)))
            .catch(() => { })

        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'employee',
            entityId: updated.id,
            entityName: `${updated.firstName} ${updated.lastName}`,
            action: 'update',
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })

        const presignedUrl = await generateDownloadUrl(s3Key, 86400)
        return reply.send({ data: { avatarUrl: presignedUrl } })
    })
}

