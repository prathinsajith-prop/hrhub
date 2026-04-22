import { listPayrollRuns, getPayrollRun, createPayrollRun, updatePayrollRun, getPayslips, getPayslipsWithEmployees, runPayroll, calculateGratuity, generateWpsSif, getPayslipById } from './payroll.service.js'
import { generatePayslipPdf } from '../../lib/pdf.js'
import { recordActivity } from '../audit/audit.service.js'
import { enqueuePayrollRun, getPayrollQueue } from '../../workers/payroll.worker.js'

export default async function (fastify: any): Promise<void> {
    const auth = { preHandler: [fastify.authenticate] }
    const hrOnly = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }

    fastify.get('/', { ...auth, schema: { tags: ['Payroll'] } }, async (request, reply) => {
        const { year, limit = '12', offset = '0' } = request.query as Record<string, string>
        const result = await listPayrollRuns(request.user.tenantId, { year: year ? Number(year) : undefined, limit: Number(limit), offset: Number(offset) })
        return reply.send(result)
    })

    fastify.get('/:id', { ...auth, schema: { tags: ['Payroll'] } }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const run = await getPayrollRun(request.user.tenantId, id)
        if (!run) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Payroll run not found' })
        return reply.send({ data: run })
    })

    fastify.get('/:id/payslips', { ...auth, schema: { tags: ['Payroll'] } }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const data = await getPayslipsWithEmployees(request.user.tenantId, id)
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

        // Fallback: run synchronously when Redis is unavailable
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
        const updated = await updatePayrollRun(request.user.tenantId, id, request.body as never)
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
        const gratuity = calculateGratuity(Number(basicSalary), Number(yearsOfService))
        return reply.send({ data: { gratuity, basicSalary: Number(basicSalary), yearsOfService: Number(yearsOfService) } })
    })

    // GET /api/v1/payroll/:id/wps-sif — download WPS Salary Information File
    fastify.get('/:id/wps-sif', {
        ...auth,
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
    fastify.get('/payslips/:payslipId/download', { ...auth, schema: { tags: ['Payroll'] } }, async (request, reply) => {
        const { payslipId } = request.params as { payslipId: string }
        const payslip = await getPayslipById(request.user.tenantId, payslipId)
        if (!payslip) return reply.code(404).send({ message: 'Payslip not found' })
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
                grossSalary: Number(payslip.grossSalary ?? 0),
                totalDeductions: Number(payslip.totalDeductions ?? 0),
                netSalary: Number(payslip.netSalary ?? 0),
                daysWorked: payslip.daysWorked,
                leaveDeduction: Number(payslip.deductions ?? 0),
            },
        })
        return reply
            .header('Content-Type', 'application/pdf')
            .header('Content-Disposition', `attachment; filename="payslip-${payslipId}.pdf"`)
            .send(pdfBuffer)
    })
}

