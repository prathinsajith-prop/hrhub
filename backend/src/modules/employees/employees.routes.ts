import {
    listEmployees, getEmployee, createEmployee,
    updateEmployee, archiveEmployee, getExpiringVisas, getOrgChart,
    generateNextEmployeeNo,
} from './employees.service.js'
import { validate, createEmployeeSchema, updateEmployeeSchema, listEmployeesSchema } from '../../lib/validation.js'
import { recordActivity } from '../audit/audit.service.js'
import { uploadObject, buildS3Key } from '../../plugins/s3.js'
import { loadEnv } from '../../config/env.js'
import { db } from '../../db/index.js'
import { entities, employees, tenants, users } from '../../db/schema/index.js'
import { eq, and } from 'drizzle-orm'
import { inviteUser, resendInvite } from '../settings/settings.service.js'
import { extname } from 'node:path'
import { fileTypeFromBuffer } from 'file-type'
import { enforceEmployeeQuota } from '../subscription/subscription.service.js'
import { generateReportPdf } from '../../lib/pdf.js'
export default async function (fastify: any): Promise<void> {
    const auth = { preHandler: [fastify.authenticate] }

    // GET /api/v1/employees
    fastify.get('/', { ...auth, schema: { tags: ['Employees'] } }, async (request, reply) => {
        const query = validate(listEmployeesSchema, request.query)
        const user = (request as any).user

        // dept_head: scope to their own reporting subtree (direct + indirect reports
        // plus themselves). This is enforced server-side — the client filter is ignored.
        const managerEmployeeId = user.role === 'dept_head'
            ? (user.employeeId ?? undefined)
            : undefined

        const result = await listEmployees({
            tenantId: request.user.tenantId,
            search: query.search,
            status: query.status,
            department: managerEmployeeId ? undefined : query.department,
            managerEmployeeId,
            limit: query.limit,
            offset: query.offset,
            after: query.after,
        })

        return reply.send(result)
    })

    // GET /api/v1/employees/export?format=csv|pdf — CSV/PDF export for HR managers and super admins
    fastify.get('/export', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Employees'] },
    }, async (request: any, reply: any) => {
        const { department, status, format = 'csv' } = request.query as { department?: string; status?: string; format?: string }
        if (format !== 'csv' && format !== 'pdf') return reply.code(400).send({ message: 'Invalid format. Must be csv or pdf.' })
        const result = await listEmployees({
            tenantId: request.user.tenantId,
            department,
            status,
            limit: 10000,
            offset: 0,
        })
        const rows = result.data as Record<string, unknown>[]
        const date = new Date().toISOString().slice(0, 10)

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
        const employee = await updateEmployee(tenantId, employeeId, patch)
        if (!employee) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Employee not found.' })
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

    // GET /api/v1/employees/expiring-visas
    fastify.get('/expiring-visas', { ...auth, schema: { tags: ['Employees'] } }, async (request, reply) => {
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
        let result: { name: string }
        try {
            result = await inviteUser(request.user.tenantId, { employeeId: id, role: 'employee' })
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
                isActive: users.isActive,
                lastLoginAt: users.lastLoginAt,
                createdAt: users.createdAt,
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
        return reply.send({ data: employee })
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

        // Auto-generate employeeNo when not supplied. Retry on the rare race
        // where two concurrent creates land on the same sequence number — the
        // (tenant_id, employee_no) unique index will reject the loser.
        let employee
        let lastErr: unknown = null
        for (let attempt = 0; attempt < 3; attempt++) {
            const employeeNo = body.employeeNo ?? (await generateNextEmployeeNo(request.user.tenantId))
            try {
                employee = await createEmployee(request.user.tenantId, { ...body, employeeNo, entityId } as never)
                break
            } catch (e: any) {
                // PostgreSQL unique_violation = 23505
                const code = e?.cause?.code ?? e?.code
                if (code === '23505' && !body.employeeNo) { lastErr = e; continue }
                throw e
            }
        }
        if (!employee) throw lastErr ?? new Error('Failed to generate employee number')
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'employee',
            entityId: employee.id,
            entityName: employee.fullName,
            action: 'create',
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.code(201).send({ data: employee })
    })

    // PATCH /api/v1/employees/:id
    fastify.patch('/:id', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Employees'] },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const body = validate(updateEmployeeSchema, request.body)
        const before = await getEmployee(request.user.tenantId, id)
        const updated = await updateEmployee(request.user.tenantId, id, body as never)
        if (!updated) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Employee not found' })

        const TRACKED = ['firstName', 'lastName', 'email', 'phone', 'department', 'designation', 'status', 'basicSalary', 'contractType', 'nationality', 'jobTitle']
        const changes: Record<string, { from: unknown; to: unknown }> = {}
        for (const key of TRACKED) {
            const prev = (before as any)?.[key]
            const next = (updated as any)?.[key]
            if (prev !== next) changes[key] = { from: prev ?? null, to: next ?? null }
        }

        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'employee',
            entityId: updated.id,
            entityName: `${updated.firstName} ${updated.lastName}`,
            action: 'update',
            changes: Object.keys(changes).length > 0 ? changes : undefined,
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
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
            return reply.code(400).send({ error: 'employees array is required' })
        }
        if (rows.length > 500) {
            return reply.code(400).send({ error: 'Max 500 employees per import' })
        }
        const results: { row: number; error: string }[] = []
        let created = 0

        // Pre-generate employee numbers outside the transaction, then batch-insert
        // inside a real transaction so all rows roll back on any failure.
        const valuesToInsert: Record<string, unknown>[] = []
        for (let i = 0; i < rows.length; i++) {
            try {
                const row = rows[i]
                const employeeNo = row.employeeNo || await generateNextEmployeeNo(request.user.tenantId)
                valuesToInsert.push({ ...row, employeeNo, tenantId: request.user.tenantId })
            } catch (e: any) {
                results.push({ row: i + 1, error: e.message ?? 'Unknown error' })
            }
        }

        if (valuesToInsert.length > 0) {
            try {
                await db.transaction(async (tx) => {
                    for (let i = 0; i < valuesToInsert.length; i++) {
                        try {
                            await tx.insert(employees).values(valuesToInsert[i] as never)
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

        const chunks: Buffer[] = []
        for await (const chunk of part.file) chunks.push(chunk as Buffer)
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
        } catch (err) {
            request.log.error({ err }, 'S3 avatar upload failed')
            return reply.code(503).send({ message: 'File storage service is unavailable. Please try again later.' })
        }

        const env = loadEnv()
        const avatarUrl = `${env.S3_PUBLIC_URL}/${s3Key}`
        const updated = await updateEmployee(request.user.tenantId, id, { avatarUrl } as never)
        if (!updated) return reply.code(404).send({ message: 'Employee not found' })

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

        return reply.send({ data: { avatarUrl } })
    })
}

