import { listPayrollRuns, getPayrollRun, createPayrollRun, updatePayrollRun, getPayslipsWithEmployees, getPayslipsByEmployee, runPayroll, calculateGratuity, generateWpsSif, getPayslipById } from './payroll.service.js'
import {
    createAdjustment,
    deleteAdjustment,
    isPeriodLocked,
    listAdjustments,
    syncAdjustmentsForPeriod,
    updateAdjustment,
    type AdjustmentCategory,
} from './adjustments.service.js'
import { generatePayslipPdf } from '../../lib/pdf.js'
import { recordActivity } from '../audit/audit.service.js'
import { enqueuePayrollRun, getPayrollQueue, type PayrollJobData } from '../../workers/payroll.worker.js'

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
        const payslip = await getPayslipById(request.user.tenantId, payslipId)
        if (!payslip) return reply.code(404).send({ message: 'Payslip not found' })
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
        if (!ADJUSTMENT_CATEGORIES.includes(category)) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: `category must be one of: ${ADJUSTMENT_CATEGORIES.join(', ')}` })
        }
        if (!Number.isFinite(amount) || amount <= 0) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'amount must be a positive number' })
        }
        if (await isPeriodLocked(request.user.tenantId, periodYear, periodMonth)) {
            return reply.code(409).send({ statusCode: 409, error: 'Conflict', message: 'Payroll for this period has already been processed — adjustments are locked.' })
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
            if (!ADJUSTMENT_CATEGORIES.includes(c)) {
                return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'invalid category' })
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

