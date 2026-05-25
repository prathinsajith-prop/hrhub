import { listPayrollRuns, getPayrollRun, createPayrollRun, updatePayrollRun, deletePayrollRun, getPayrollReadiness, getPayslipsWithEmployees, getPayslipsByEmployee, runPayroll, calculateGratuity, generateWpsSif, getPayslipById } from './payroll.service.js'
import {
    bulkCreateAdjustments,
    createAdjustment,
    createCategory,
    deleteAdjustment,
    getImportById,
    isPeriodLocked,
    listAdjustments,
    listCategories,
    listImports,
    recordImport,
    resolveCategory,
    syncAdjustmentsForPeriod,
    updateAdjustment,
    validateBulkAdjustments,
    type AdjustmentCategory,
    type BulkAdjustmentRow,
} from './adjustments.service.js'
import { uploadObject, generateDownloadUrl } from '../../plugins/s3.js'
import { createHash, randomUUID } from 'node:crypto'
import * as XLSX from 'xlsx'
import { generatePayslipPdf } from '../../lib/pdf.js'
import { recordActivity } from '../audit/audit.service.js'
import { enqueuePayrollRun, getPayrollQueue, type PayrollJobData } from '../../workers/payroll.worker.js'
import { db } from '../../db/index.js'
import { employees } from '../../db/schema/index.js'
import { and, eq } from 'drizzle-orm'

const ADJUSTMENT_CATEGORIES: readonly AdjustmentCategory[] = [
    'overtime', 'commission', 'bonus', 'salary_advance', 'manual',
    // 'unpaid_leave', 'sick_half_pay', 'loan_repayment' are driven automatically
    // by syncAdjustmentsForPeriod — HR can't pick them from the manual create form.
] as const

export default async function (fastify: any): Promise<void> {
    const auth = { preHandler: [fastify.authenticate] }
    const hrOnly = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }

    fastify.get('/', { ...hrOnly, schema: { tags: ['Payroll'] } }, async (request, reply) => {
        const { year, limit = '12', offset = '0' } = request.query as Record<string, string>
        const result = await listPayrollRuns(request.user.tenantId, { year: year ? Number(year) : undefined, limit: Number(limit), offset: Number(offset) })
        return reply.send(result)
    })

    fastify.get('/:id', { ...hrOnly, schema: { tags: ['Payroll'] } }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const run = await getPayrollRun(request.user.tenantId, id)
        if (!run) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Payroll run not found' })
        return reply.send({ data: run })
    })

    fastify.get('/:id/payslips', { ...hrOnly, schema: { tags: ['Payroll'] } }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const data = await getPayslipsWithEmployees(request.user.tenantId, id)
        return reply.send({ data })
    })

    // GET /api/v1/payroll/my-payslips — employee's own payslips across all runs
    fastify.get('/my-payslips', { ...auth, schema: { tags: ['Payroll'] } }, async (request: any, reply: any) => {
        const { employeeId, tenantId } = request.user
        if (!employeeId) return reply.send({ data: [] })
        const data = await getPayslipsByEmployee(tenantId, employeeId)
        return reply.send({ data })
    })

    // POST /api/v1/payroll/:id/run — enqueue payroll calculation (async via BullMQ when Redis available)
    fastify.post('/:id/run', {
        ...hrOnly,
        schema: { tags: ['Payroll'] },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }

        // Verify the run exists and is in draft status before enqueuing
        const run = await getPayrollRun(request.user.tenantId, id)
        if (!run || run.status !== 'draft') {
            return reply.code(422).send({
                statusCode: 422,
                error: 'Unprocessable Entity',
                message: 'Payroll run not found or not in draft status.',
            })
        }

        // If BullMQ worker is available, enqueue and return jobId immediately
        if (getPayrollQueue()) {
            const jobId = await enqueuePayrollRun(request.user.tenantId, id)
            if (!jobId) {
                return reply.code(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Payroll processing unavailable. Please try again.' })
            }
            recordActivity({
                tenantId: request.user.tenantId,
                userId: request.user.id,
                actorName: request.user.name,
                actorRole: request.user.role,
                entityType: 'payroll_run',
                entityId: id,
                entityName: `Payroll ${run.month}/${run.year}`,
                action: 'approve',
                ipAddress: (request as any).ip,
                userAgent: request.headers['user-agent'],
            }).catch(() => { })
            return reply.code(202).send({ data: { jobId, status: 'processing' } })
        }

        // Fallback: run synchronously when Redis is unavailable (BUG-05 — was incorrectly returning 202)
        const ok = await runPayroll(request.user.tenantId, id)
        if (!ok) {
            return reply.code(422).send({
                statusCode: 422,
                error: 'Unprocessable Entity',
                message: 'Payroll run not found, not in draft status, or no active employees.',
            })
        }
        const updatedRun = await getPayrollRun(request.user.tenantId, id)
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'payroll_run',
            entityId: id,
            entityName: updatedRun ? `Payroll ${updatedRun.month}/${updatedRun.year}` : id,
            action: 'approve',
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.send({ data: updatedRun })
    })

    fastify.post('/', {
        ...hrOnly,
        schema: {
            tags: ['Payroll'],
            body: {
                type: 'object',
                required: ['month', 'year'],
                properties: {
                    month: { type: 'integer', minimum: 1, maximum: 12 },
                    year: { type: 'integer', minimum: 2020 },
                },
            },
        },
    }, async (request, reply) => {
        const body = request.body as Record<string, unknown>
        const run = await createPayrollRun(request.user.tenantId, body as never)
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'payroll_run',
            entityId: run.id,
            entityName: `Payroll ${run.month}/${run.year}`,
            action: 'create',
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.code(201).send({ data: run })
    })

    fastify.patch('/:id', { ...hrOnly, schema: { tags: ['Payroll'] } }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const b = request.body as Record<string, unknown>
        const updated = await updatePayrollRun(request.user.tenantId, id, {
            ...(b.notes !== undefined && { notes: b.notes as string }),
            ...(b.wpsFileRef !== undefined && { wpsFileRef: b.wpsFileRef as string }),
        })
        if (!updated) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Payroll run not found' })
        return reply.send({ data: updated })
    })

    // DELETE /api/v1/payroll/:id — only drafts can be deleted.
    // Once a run leaves draft it's the historical record; deleting would
    // orphan payslip downloads, WPS references, and audit traces.
    fastify.delete('/:id', { ...hrOnly, schema: { tags: ['Payroll'] } }, async (request, reply) => {
        const { id } = request.params as { id: string }
        // Look up first so we can return a precise message (404 vs 409) and
        // record the period in the audit trail.
        const existing = await getPayrollRun(request.user.tenantId, id)
        if (!existing) {
            return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Payroll run not found' })
        }
        if (existing.status !== 'draft') {
            return reply.code(409).send({
                statusCode: 409,
                error: 'Conflict',
                message: 'Only draft payroll runs can be deleted. Processed runs are the historical record.',
            })
        }
        const removed = await deletePayrollRun(request.user.tenantId, id)
        if (!removed) {
            // Race condition: someone else processed it between our SELECT
            // and DELETE. Refuse cleanly.
            return reply.code(409).send({
                statusCode: 409,
                error: 'Conflict',
                message: 'Payroll run is no longer in draft state.',
            })
        }
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'payroll_run',
            entityId: id,
            entityName: `Payroll ${removed.month}/${removed.year}`,
            action: 'delete',
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.code(204).send()
    })

    // GET /api/v1/payroll/:id/readiness — pre-processing checklist for a draft.
    // Returns blockers (must fix) and warnings (should know) so the
    // dashboard can disable the Process button + surface what needs attention.
    // Non-draft runs return 204 — there's nothing left to check.
    fastify.get('/:id/readiness', { ...hrOnly, schema: { tags: ['Payroll'] } }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const data = await getPayrollReadiness(request.user.tenantId, id)
        if (!data) return reply.code(204).send()
        return reply.send({ data })
    })

    // GET /api/v1/payroll/gratuity-calc?basicSalary=10000&yearsOfService=3
    fastify.get('/gratuity-calc', {
        ...auth,
        schema: {
            tags: ['Payroll'],
            querystring: {
                type: 'object',
                required: ['basicSalary', 'yearsOfService'],
                properties: {
                    basicSalary: { type: 'number' },
                    yearsOfService: { type: 'number' },
                },
            },
        },
    }, async (request, reply) => {
        const { basicSalary, yearsOfService } = request.query as { basicSalary: number; yearsOfService: number }
        const salary = Number(basicSalary)
        const years = Number(yearsOfService)
        // Guard against NaN / Infinity — Number('') and Number(undefined) both produce NaN,
        // which would silently propagate through the calculation and corrupt the result.
        if (!Number.isFinite(salary) || salary < 0) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'basicSalary must be a non-negative number' })
        }
        if (!Number.isFinite(years) || years < 0) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'yearsOfService must be a non-negative number' })
        }
        const gratuity = calculateGratuity(salary, years)
        return reply.send({ data: { gratuity, basicSalary: salary, yearsOfService: years } })
    })

    // GET /api/v1/payroll/:id/wps-sif — download WPS Salary Information File (HR only)
    fastify.get('/:id/wps-sif', {
        ...hrOnly,
        schema: { tags: ['Payroll'] },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const result = await generateWpsSif(request.user.tenantId, id)
        if (!result) {
            return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Payroll run not found or has no payslips.' })
        }
        return reply
            .header('Content-Type', 'text/plain; charset=utf-8')
            .header('Content-Disposition', `attachment; filename="${result.filename}"`)
            .send(result.content)
    })

    // POST /api/v1/payroll/:id/submit-wps — mark run as WPS-submitted (Task 8.5)
    fastify.post('/:id/submit-wps', { ...hrOnly, schema: { tags: ['Payroll'] } }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const bankRef = `WPS-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`
        const updated = await updatePayrollRun(request.user.tenantId, id, {
            status: 'wps_submitted',
            wpsFileRef: bankRef,
        } as any)
        if (!updated) {
            return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Payroll run not found.' })
        }
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'payroll_run',
            entityId: id,
            entityName: `Payroll ${updated.month}/${updated.year} - WPS Submitted`,
            action: 'submit',
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.send({ data: updated })
    })

    // GET /api/v1/payroll/payslips/:payslipId/download — download payslip PDF
    // HR roles see any payslip; employees can only download their own.
    fastify.get('/payslips/:payslipId/download', { ...auth, schema: { tags: ['Payroll'] } }, async (request, reply) => {
        const { payslipId } = request.params as { payslipId: string }
        // Reject the synthetic draft ids early. Hitting Postgres with a
        // non-UUID string would throw InvalidTextRepresentation → 500;
        // this gives the user a clean message and protects the next call.
        if (payslipId.startsWith('draft:')) {
            return reply.code(409).send({
                statusCode: 409,
                error: 'Conflict',
                message: 'Process the payroll run before downloading payslips.',
            })
        }
        const payslip = await getPayslipById(request.user.tenantId, payslipId)
        if (!payslip) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Payslip not found' })
        const isElevated = ['hr_manager', 'super_admin'].includes(request.user.role)
        if (!isElevated && payslip.employeeId !== request.user.employeeId) {
            return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'You can only download your own payslip.' })
        }
        const pdfBuffer = await generatePayslipPdf({
            employee: {
                name: payslip.employeeName ?? 'Employee',
                employeeNo: payslip.employeeNo ?? '',
                designation: payslip.designation,
                department: payslip.department,
                bankName: payslip.bankName,
                iban: payslip.iban,
            },
            company: {
                name: payslip.tenantName ?? 'Company',
                tradeLicenseNo: payslip.tradeLicenseNo,
            },
            payslip: {
                month: payslip.month,
                year: payslip.year,
                basicSalary: Number(payslip.basicSalary ?? 0),
                housingAllowance: Number(payslip.housingAllowance ?? 0),
                transportAllowance: Number(payslip.transportAllowance ?? 0),
                otherAllowances: Number(payslip.otherAllowances ?? 0),
                overtime: Number(payslip.overtime ?? 0),
                commission: Number(payslip.commission ?? 0),
                grossSalary: Number(payslip.grossSalary ?? 0),
                unpaidLeaveDays: payslip.unpaidLeaveDays ?? 0,
                unpaidLeaveDeduction: Number(payslip.unpaidLeaveDeduction ?? 0),
                sickHalfPayDays: payslip.sickHalfPayDays ?? 0,
                sickHalfPayDeduction: Number(payslip.sickHalfPayDeduction ?? 0),
                loanDeduction: Number(payslip.loanDeduction ?? 0),
                otherDeduction: Number(payslip.otherDeduction ?? 0),
                totalDeductions: Number(payslip.totalDeductions ?? 0),
                netSalary: Number(payslip.netSalary ?? 0),
                daysWorked: payslip.daysWorked ?? undefined,
            },
        })
        return reply
            .header('Content-Type', 'application/pdf')
            .header('Content-Disposition', `attachment; filename="payslip-${payslipId}.pdf"`)
            .send(pdfBuffer)
    })

    // GET /api/v1/payroll/jobs/:jobId — poll async payroll job status (HR only)
    fastify.get('/jobs/:jobId', { ...hrOnly, schema: { tags: ['Payroll'] } }, async (request, reply) => {
        const { jobId } = request.params as { jobId: string }
        const queue = getPayrollQueue()
        if (!queue) {
            return reply.code(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Payroll job queue unavailable.' })
        }
        const job = await queue.getJob(jobId)
        if (!job) {
            return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Job not found.' })
        }
        const data = job.data as PayrollJobData
        if (data.tenantId !== request.user.tenantId) {
            return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Job not found.' })
        }
        const state = await job.getState()
        return reply.send({ data: { jobId: job.id, state, payrollRunId: data.payrollRunId, failedReason: job.failedReason ?? null } })
    })

    // ─── Payroll adjustments ────────────────────────────────────────────────
    //
    // HR-only ledger of per-month additions and deductions that runPayroll
    // consumes. See modules/payroll/adjustments.service.ts for the data model.

    fastify.get('/adjustments', { ...hrOnly, schema: { tags: ['Payroll'] } }, async (request, reply) => {
        const { year, month } = request.query as Record<string, string>
        const y = Number(year), m = Number(month)
        if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'year and month query params are required (month 1-12)' })
        }
        const [rows, locked] = await Promise.all([
            listAdjustments(request.user.tenantId, y, m),
            isPeriodLocked(request.user.tenantId, y, m),
        ])
        return reply.send({ data: rows, locked })
    })

    fastify.post('/adjustments', { ...hrOnly, schema: { tags: ['Payroll'] } }, async (request, reply) => {
        const body = request.body as Record<string, unknown>
        const employeeId = String(body.employeeId ?? '')
        const periodYear = Number(body.periodYear)
        const periodMonth = Number(body.periodMonth)
        const category = String(body.category ?? '') as AdjustmentCategory
        const amount = Number(body.amount)
        const notes = body.notes != null ? String(body.notes) : null

        if (!employeeId || !Number.isInteger(periodYear) || !Number.isInteger(periodMonth)
            || periodMonth < 1 || periodMonth > 12) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'employeeId + periodYear + periodMonth required' })
        }
        // Built-in or tenant-registered custom category. The auto-driven
        // built-ins (loan_repayment / unpaid_leave / sick_half_pay) are
        // still rejected here — HR isn't allowed to hand-create them.
        const resolved = await resolveCategory(request.user.tenantId, category)
        if (!resolved || (resolved.builtin && ['loan_repayment', 'unpaid_leave', 'sick_half_pay'].includes(category))) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: `Unknown category "${category}". Create the category first or pick one from the list.` })
        }
        if (!Number.isFinite(amount) || amount <= 0) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'amount must be a positive number' })
        }
        if (await isPeriodLocked(request.user.tenantId, periodYear, periodMonth)) {
            return reply.code(409).send({ statusCode: 409, error: 'Conflict', message: 'Payroll for this period has already been processed — adjustments are locked.' })
        }

        // Guard cross-tenant injection: the employeeId must belong to the
        // caller's tenant. Without this, an HR manager who learns a foreign
        // tenant's employee UUID could insert a row that leaks the foreign
        // employee's name/employeeNo through the GET response.
        const [empRow] = await db
            .select({ id: employees.id })
            .from(employees)
            .where(and(eq(employees.id, employeeId), eq(employees.tenantId, request.user.tenantId)))
            .limit(1)
        if (!empRow) {
            return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Employee not found.' })
        }

        const row = await createAdjustment(
            request.user.tenantId,
            { employeeId, periodYear, periodMonth, category, amount, notes },
            request.user.id,
        )
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'payroll_adjustment',
            entityId: row.id,
            entityName: `${category} ${amount} for ${periodMonth}/${periodYear}`,
            action: 'create',
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.code(201).send({ data: row })
    })

    // ─── Adjustment categories ──────────────────────────────────────────
    //
    // Built-in (overtime, commission, bonus, salary_advance, manual) + tenant-
    // defined custom categories (e.g. "Site Allowance", "Ramadan Bonus"). The
    // single + bulk create dialogs render this list as the category picker.

    fastify.get('/adjustments/categories', { ...hrOnly, schema: { tags: ['Payroll'] } }, async (request, reply) => {
        const data = await listCategories(request.user.tenantId)
        return reply.send({ data })
    })

    fastify.post('/adjustments/categories', { ...hrOnly, schema: { tags: ['Payroll'] } }, async (request, reply) => {
        const body = request.body as Record<string, unknown>
        const label = typeof body.label === 'string' ? body.label.trim() : ''
        const kindRaw = typeof body.kind === 'string' ? body.kind : ''
        if (!label) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Category label is required.' })
        }
        if (label.length > 80) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Category label is too long (max 80 characters).' })
        }
        if (kindRaw !== 'addition' && kindRaw !== 'deduction') {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Category kind must be "addition" or "deduction".' })
        }
        try {
            const result = await createCategory(request.user.tenantId, { label, kind: kindRaw }, request.user.id)
            if (result.created) {
                recordActivity({
                    tenantId: request.user.tenantId,
                    userId: request.user.id,
                    actorName: request.user.name,
                    actorRole: request.user.role,
                    entityType: 'payroll_adjustment_category',
                    entityId: result.option.value,
                    entityName: result.option.label,
                    action: 'create',
                    ipAddress: (request as any).ip,
                    userAgent: request.headers['user-agent'],
                }).catch(() => { })
            }
            return reply.code(result.created ? 201 : 200).send({ data: result.option, created: result.created })
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Could not create category.'
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: msg })
        }
    })

    // GET /adjustments/bulk-template — download a starter .xlsx.
    //
    // Columns: employee_no, employee_name, employee_email, employee_phone,
    //          amount, note.
    // Category is NOT a column — it's picked in the dialog and applied to
    // every row, keeping HR's per-row data entry focused on identifiers and
    // amounts.
    //
    // Default behavior: pre-populated with every active, non-archived
    // employee in the tenant — identifying columns filled in, `amount` and
    // `note` left blank for HR to fill. This is what HR wants 99% of the
    // time: open the file, type an amount next to each employee, save,
    // re-upload. No more hunting for employee numbers.
    //
    // `?empty=true` returns just the header row + one synthetic example
    // (Jane Doe) for HR who want a blank starting sheet — handy when the
    // adjustment only applies to a handful of people they'll paste in
    // themselves.
    fastify.get('/adjustments/bulk-template', { ...hrOnly, schema: { tags: ['Payroll'] } }, async (request, reply) => {
        const q = request.query as Record<string, string | undefined>
        const empty = q.empty === 'true' || q.empty === '1'

        const header = ['employee_no', 'employee_name', 'employee_email', 'employee_phone', 'amount', 'note']
        const aoa: unknown[][] = [header]

        if (empty) {
            // Minimal sheet — one synthetic example row for HR to clone.
            aoa.push(['EMP-0001', 'Jane Doe', 'jane.doe@example.com', '+971501234567', '', ''])
        } else {
            // Pre-populated with the full active roster. We order by employee_no
            // so the file matches the natural sort HR sees in the directory.
            // Amount and note left blank — HR fills the cells they care about
            // and uploads; rows left blank are skipped server-side.
            const roster = await db
                .select({
                    employeeNo: employees.employeeNo,
                    firstName: employees.firstName,
                    lastName: employees.lastName,
                    email: employees.email,
                    workEmail: employees.workEmail,
                    mobileNo: employees.mobileNo,
                    phone: employees.phone,
                })
                .from(employees)
                .where(and(
                    eq(employees.tenantId, request.user.tenantId),
                    eq(employees.isArchived, false),
                    eq(employees.status, 'active'),
                ))
                .orderBy(employees.employeeNo)
            for (const e of roster) {
                aoa.push([
                    e.employeeNo ?? '',
                    `${e.firstName} ${e.lastName}`.trim(),
                    e.workEmail ?? e.email ?? '',
                    e.mobileNo ?? e.phone ?? '',
                    '',
                    '',
                ])
            }
            // Tenant has zero employees yet — keep the file demonstrable so
            // HR sees the column shape rather than a header-only download.
            if (roster.length === 0) {
                aoa.push(['EMP-0001', 'Jane Doe', 'jane.doe@example.com', '+971501234567', '', ''])
            }
        }

        const sheet = XLSX.utils.aoa_to_sheet(aoa)
        sheet['!cols'] = [{ wch: 14 }, { wch: 24 }, { wch: 28 }, { wch: 18 }, { wch: 10 }, { wch: 30 }]
        const workbook = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(workbook, sheet, 'Adjustments')
        const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
        const filename = empty
            ? 'payroll-adjustments-template-empty.xlsx'
            : 'payroll-adjustments-template.xlsx'
        reply
            .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            .header('Content-Disposition', `attachment; filename="${filename}"`)
            .send(buf)
    })

    // POST /adjustments/bulk-validate — preview a bulk import without persisting
    // any rows. Returns per-row resolution (employee found? amount positive?)
    // so the dialog can show correct vs incorrect rows before HR commits.
    fastify.post('/adjustments/bulk-validate', { ...hrOnly, schema: { tags: ['Payroll'] } }, async (request, reply) => {
        const body = request.body as Record<string, unknown>
        const rows = Array.isArray(body.rows) ? body.rows as Array<Record<string, unknown>> : []
        if (rows.length === 0) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'rows must contain at least one entry' })
        }
        if (rows.length > 500) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'maximum 500 rows per import' })
        }
        const normalized: BulkAdjustmentRow[] = rows.map((r, i) => ({
            rowNumber: Number(r.rowNumber) || i + 1,
            employeeNo: r.employeeNo != null ? String(r.employeeNo) : null,
            employeeName: r.employeeName != null ? String(r.employeeName) : null,
            employeeEmail: r.employeeEmail != null ? String(r.employeeEmail) : null,
            employeePhone: r.employeePhone != null ? String(r.employeePhone) : null,
            amount: r.amount as number | string,
            notes: r.notes != null ? String(r.notes) : null,
        }))
        // Optional period context — when present the validator returns
        // periodLocked so the dialog can show the same blocker the create
        // endpoint enforces, without the user having to click Submit
        // twice.
        const periodYearRaw = Number(body.periodYear)
        const periodMonthRaw = Number(body.periodMonth)
        const periodYear = Number.isInteger(periodYearRaw) ? periodYearRaw : undefined
        const periodMonth = Number.isInteger(periodMonthRaw) && periodMonthRaw >= 1 && periodMonthRaw <= 12
            ? periodMonthRaw
            : undefined
        // Category anchors the comparison engine — without it every row is `new`
        // because the validator has nothing to compare against in the DB.
        const categoryRaw = body.category != null ? String(body.category) : null
        const category = categoryRaw && ADJUSTMENT_CATEGORIES.includes(categoryRaw as AdjustmentCategory)
            ? categoryRaw
            : undefined
        const result = await validateBulkAdjustments(request.user.tenantId, normalized, { periodYear, periodMonth, category })
        return reply.send(result)
    })

    // POST /adjustments/bulk — import many manual adjustments at once.
    //
    // Accepts either multipart/form-data (preferred — the .xlsx is stored to
    // S3 and surfaced in the import history) or application/json (legacy —
    // rows only, no file retention).
    //
    // Multipart fields:
    //   file:     the source .xlsx (mime audited, max 10 MB via @fastify/multipart limits)
    //   payload:  JSON string with { periodYear, periodMonth, category, rows }
    //
    // All rows share the same category, picked once in the dialog.
    fastify.post('/adjustments/bulk', { ...hrOnly, schema: { tags: ['Payroll'] } }, async (request, reply) => {
        const contentType = String(request.headers['content-type'] ?? '')

        // Parse the payload + (optional) file. The multipart branch streams
        // the file into memory once — we both insert the rows from the parsed
        // payload AND store the bytes to S3 for the history trail.
        let periodYear: number, periodMonth: number, category: AdjustmentCategory
        let rows: Array<Record<string, unknown>>
        let fileBuffer: Buffer | null = null
        let fileName: string | null = null
        let fileMime: string | null = null

        if (contentType.includes('multipart/form-data')) {
            let payloadRaw: string | null = null
            try {
                const parts = (request as any).parts() as AsyncIterable<any>
                for await (const part of parts) {
                    if (part.type === 'file' && part.fieldname === 'file') {
                        const buf = await part.toBuffer()
                        // Empty file parts are tolerated — some clients
                        // (Chrome "Copy as cURL", flaky proxies) send the
                        // headers but no bytes. We just skip the S3 audit
                        // trail rather than rejecting the whole request.
                        if (buf.length > 0) {
                            fileBuffer = buf
                            fileName = String(part.filename ?? 'upload.xlsx')
                            fileMime = String(part.mimetype ?? 'application/octet-stream')
                        }
                    } else if (part.type === 'field' && part.fieldname === 'payload') {
                        payloadRaw = String(part.value ?? '')
                    }
                }
            } catch (err) {
                request.log.warn({ err }, 'multipart parse failed')
                const reason = err instanceof Error ? err.message : 'malformed multipart body'
                return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: `Could not read upload: ${reason}` })
            }
            if (!payloadRaw) {
                return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Upload missing the "payload" field. Refresh the page and try again.' })
            }
            // File is OPTIONAL — when absent we still import the rows but
            // skip the S3 audit step. Lets HR import even when their proxy
            // strips file bodies, and matches the JSON-only fallback path.
            let parsed: Record<string, unknown>
            try {
                parsed = JSON.parse(payloadRaw)
            } catch {
                return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'The hidden form payload was not valid JSON. Refresh the page and try again.' })
            }
            periodYear = Number(parsed.periodYear)
            periodMonth = Number(parsed.periodMonth)
            category = String(parsed.category ?? '') as AdjustmentCategory
            rows = Array.isArray(parsed.rows) ? parsed.rows as Array<Record<string, unknown>> : []
        } else {
            const body = request.body as Record<string, unknown>
            periodYear = Number(body.periodYear)
            periodMonth = Number(body.periodMonth)
            category = String(body.category ?? '') as AdjustmentCategory
            rows = Array.isArray(body.rows) ? body.rows as Array<Record<string, unknown>> : []
        }

        if (!Number.isInteger(periodYear) || !Number.isInteger(periodMonth) || periodMonth < 1 || periodMonth > 12) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'A valid year and month (1–12) are required.' })
        }
        const resolvedBulk = await resolveCategory(request.user.tenantId, category)
        if (!resolvedBulk || (resolvedBulk.builtin && ['loan_repayment', 'unpaid_leave', 'sick_half_pay'].includes(category))) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: `Unknown category "${category}". Create the category first or pick one from the list.` })
        }
        if (rows.length === 0) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'The spreadsheet has no rows to import.' })
        }
        // Cap matches the employee bulk-import ceiling — keeps memory + tx
        // size predictable, and forces obvious mistakes (uploading a 50k-row
        // export) to fail fast instead of locking the DB.
        if (rows.length > 500) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: `Too many rows (${rows.length}). The maximum per import is 500 — split your spreadsheet and try again.` })
        }
        if (await isPeriodLocked(request.user.tenantId, periodYear, periodMonth)) {
            return reply.code(409).send({ statusCode: 409, error: 'Conflict', message: 'Payroll for this period has already been processed — adjustments are locked.' })
        }

        // File-hash dedupe was removed in favour of row-level comparison: the
        // comparison engine inside bulkCreateAdjustments decides what to insert,
        // update, skip-as-unchanged, or skip-as-duplicate. Re-uploading the same
        // file is now a no-op (everything is `unchanged`) rather than a 409.
        // The S3 audit trail still captures every upload — see below.
        const fileHash: string | null = fileBuffer
            ? createHash('sha256').update(fileBuffer).digest('hex')
            : null

        const normalized: BulkAdjustmentRow[] = rows.map((r, i) => ({
            rowNumber: Number(r.rowNumber) || i + 1,
            employeeNo: r.employeeNo != null ? String(r.employeeNo) : null,
            employeeName: r.employeeName != null ? String(r.employeeName) : null,
            employeeEmail: r.employeeEmail != null ? String(r.employeeEmail) : null,
            employeePhone: r.employeePhone != null ? String(r.employeePhone) : null,
            amount: r.amount as number | string,
            notes: r.notes != null ? String(r.notes) : null,
        }))

        const result = await bulkCreateAdjustments(
            request.user.tenantId,
            { periodYear, periodMonth, category, rows: normalized },
            request.user.id,
        )

        // Persist the file + log activity whenever the upload actually changed
        // state. An all-`unchanged` upload (HR re-running the same sheet to
        // double-check) intentionally writes nothing — no S3 blob, no audit
        // row, no activity log.
        const committed = result.created + result.updated
        if (committed > 0) {
            if (fileBuffer && fileHash && fileName) {
                // S3 key namespaces by tenant so cross-tenant access is
                // impossible at the bucket level (defence in depth on top of
                // the tenantId predicate in getImportById).
                const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, '_')
                const s3Key = `tenants/${request.user.tenantId}/payroll-imports/${periodYear}/${String(periodMonth).padStart(2, '0')}/${randomUUID()}-${safeName}`
                try {
                    await uploadObject(s3Key, fileBuffer, fileMime ?? 'application/octet-stream')
                    await recordImport(
                        request.user.tenantId,
                        {
                            periodYear,
                            periodMonth,
                            category,
                            rowsCreated: committed,
                            fileName,
                            fileSize: fileBuffer.length,
                            fileMime: fileMime ?? 'application/octet-stream',
                            fileS3Key: s3Key,
                            fileHash,
                        },
                        request.user.id,
                    )
                } catch (err) {
                    // S3 failure shouldn't undo the DB writes — payroll rows
                    // are the source of truth. Log + continue; HR sees the
                    // adjustments but the history entry is missing.
                    request.log.warn({ err }, 'payroll bulk-import: failed to store original file')
                }
            }
            recordActivity({
                tenantId: request.user.tenantId,
                userId: request.user.id,
                actorName: request.user.name,
                actorRole: request.user.role,
                entityType: 'payroll_adjustment',
                entityId: `${periodYear}-${periodMonth}`,
                entityName: `Bulk import: +${result.created} new, ${result.updated} updated ${category} rows for ${periodMonth}/${periodYear}`,
                action: 'create',
                metadata: {
                    created: result.created,
                    updated: result.updated,
                    unchanged: result.unchanged,
                    duplicate: result.duplicate,
                    category,
                },
                ipAddress: (request as any).ip,
                userAgent: request.headers['user-agent'],
            }).catch(() => { })
        }

        // If any row failed, return 400 with the per-row errors so the frontend
        // can highlight the offending lines. The transaction was rolled back so
        // partial inserts can't have happened.
        const status = result.failed > 0 ? 400 : 201
        return reply.code(status).send(result)
    })

    // GET /adjustments/imports — bulk import history.
    fastify.get('/adjustments/imports', { ...hrOnly, schema: { tags: ['Payroll'] } }, async (request, reply) => {
        const { year, month, limit } = request.query as Record<string, string>
        const filter: { year?: number; month?: number; limit?: number } = {}
        if (year !== undefined) {
            const y = Number(year)
            if (!Number.isInteger(y)) {
                return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'year must be an integer' })
            }
            filter.year = y
        }
        if (month !== undefined) {
            const m = Number(month)
            if (!Number.isInteger(m) || m < 1 || m > 12) {
                return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'month must be 1-12' })
            }
            filter.month = m
        }
        if (limit !== undefined) {
            const l = Number(limit)
            if (Number.isInteger(l) && l > 0) filter.limit = l
        }
        const data = await listImports(request.user.tenantId, filter)
        return reply.send({ data })
    })

    // GET /adjustments/imports/:id/download — fetch the original uploaded
    // file. Returns a presigned S3 URL the client can hit directly.
    fastify.get('/adjustments/imports/:id/download', { ...hrOnly, schema: { tags: ['Payroll'] } }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const row = await getImportById(request.user.tenantId, id)
        if (!row) {
            return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Import record not found.' })
        }
        const url = await generateDownloadUrl(row.fileS3Key, 300, row.fileName)
        return reply.send({ data: { url, fileName: row.fileName, fileMime: row.fileMime, fileSize: row.fileSize } })
    })

    fastify.patch('/adjustments/:id', { ...hrOnly, schema: { tags: ['Payroll'] } }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const body = request.body as Record<string, unknown>
        const patch: { amount?: number; notes?: string | null; category?: AdjustmentCategory } = {}
        if (body.amount !== undefined) {
            const a = Number(body.amount)
            if (!Number.isFinite(a) || a <= 0) {
                return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'amount must be a positive number' })
            }
            patch.amount = a
        }
        if (body.notes !== undefined) patch.notes = body.notes == null ? null : String(body.notes)
        if (body.category !== undefined) {
            const c = String(body.category) as AdjustmentCategory
            const r = await resolveCategory(request.user.tenantId, c)
            if (!r || (r.builtin && ['loan_repayment', 'unpaid_leave', 'sick_half_pay'].includes(c))) {
                return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: `Unknown category "${c}". Create the category first or pick one from the list.` })
            }
            patch.category = c
        }
        const row = await updateAdjustment(request.user.tenantId, id, patch)
        if (!row) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Adjustment not found, locked, or not manual' })
        if (await isPeriodLocked(request.user.tenantId, row.periodYear, row.periodMonth)) {
            // We allowed the update through the DB filter but the period is now locked.
            // Reject by undoing isn't worth it — refuse on the next call instead and log.
            request.log.warn({ id }, 'adjustment update happened on a now-locked period')
        }
        return reply.send({ data: row })
    })

    fastify.delete('/adjustments/:id', { ...hrOnly, schema: { tags: ['Payroll'] } }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const row = await deleteAdjustment(request.user.tenantId, id)
        if (!row) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Adjustment not found, locked, or not manual' })
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'payroll_adjustment',
            entityId: row.id,
            entityName: `${row.category} ${row.amount}`,
            action: 'delete',
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.code(204).send()
    })

    fastify.post('/adjustments/sync', { ...hrOnly, schema: { tags: ['Payroll'] } }, async (request, reply) => {
        const body = request.body as Record<string, unknown>
        const year = Number(body.year), month = Number(body.month)
        if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'year + month required (month 1-12)' })
        }
        if (await isPeriodLocked(request.user.tenantId, year, month)) {
            return reply.code(409).send({ statusCode: 409, error: 'Conflict', message: 'Payroll for this period has already been processed — sync is locked.' })
        }
        const result = await syncAdjustmentsForPeriod(request.user.tenantId, year, month)
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'payroll_adjustment',
            entityId: `${year}-${month}`,
            entityName: `Sync ${month}/${year}`,
            action: 'submit',
            metadata: result,
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.send({ data: result })
    })
}

