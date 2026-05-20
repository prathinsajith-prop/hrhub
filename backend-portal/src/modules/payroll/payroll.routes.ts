import { and, desc, eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { db } from '../../db/client.js'
import { payrollRuns, payslips, employees, orgUnits, tenants } from '../../db/schema/index.js'
import { e403, e404 } from '../../lib/errors.js'
import { parseUuidParam } from '../../lib/validation.js'
import { isElevated } from '../../lib/scoping.js'

export default async function payrollRoutes(fastify: FastifyInstance) {
    const auth = { preHandler: [(fastify as any).authenticate] }

    // GET /api/v1/payroll/my-payslips — current employee's payslips across all runs
    fastify.get('/my-payslips', { ...auth }, async (request: any, reply: any) => {
        const { employeeId, tenantId } = request.user
        if (!employeeId) return reply.send({ data: [] })

        const data = await db
            .select({
                id: payslips.id,
                payrollRunId: payslips.payrollRunId,
                month: payrollRuns.month,
                year: payrollRuns.year,
                runStatus: payrollRuns.status,
                basicSalary: payslips.basicSalary,
                housingAllowance: payslips.housingAllowance,
                transportAllowance: payslips.transportAllowance,
                otherAllowances: payslips.otherAllowances,
                earningsBreakdown: payslips.earningsBreakdown,
                overtime: payslips.overtime,
                commission: payslips.commission,
                grossSalary: payslips.grossSalary,
                deductions: payslips.deductions,
                unpaidLeaveDays: payslips.unpaidLeaveDays,
                unpaidLeaveDeduction: payslips.unpaidLeaveDeduction,
                sickHalfPayDays: payslips.sickHalfPayDays,
                sickHalfPayDeduction: payslips.sickHalfPayDeduction,
                loanDeduction: payslips.loanDeduction,
                otherDeduction: payslips.otherDeduction,
                netSalary: payslips.netSalary,
                daysWorked: payslips.daysWorked,
            })
            .from(payslips)
            // Tenant defence on the join — the FK alone doesn't enforce that
            // a payslip's payroll_run lives in the same tenant. Belt-and-braces.
            .innerJoin(payrollRuns, and(
                eq(payslips.payrollRunId, payrollRuns.id),
                eq(payrollRuns.tenantId, tenantId),
            ))
            .where(and(eq(payslips.tenantId, tenantId), eq(payslips.employeeId, employeeId)))
            .orderBy(desc(payrollRuns.year), desc(payrollRuns.month))

        return reply.send({ data })
    })

    // GET /api/v1/payroll/payslips/:payslipId — JSON payload for a single payslip (full detail).
    // The portal v1 returns JSON only — PDF generation is not implemented yet; the frontend
    // can render the payslip in-app and use the browser's print/save-as-PDF affordance.
    fastify.get('/payslips/:payslipId', { ...auth }, async (request: any, reply: any) => {
        const payslipId = parseUuidParam(request.params, 'payslipId', reply)
        if (!payslipId) return
        const { tenantId, employeeId, roles } = request.user

        const [row] = await db
            .select({
                id: payslips.id,
                payrollRunId: payslips.payrollRunId,
                employeeId: payslips.employeeId,
                tenantId: payslips.tenantId,
                month: payrollRuns.month,
                year: payrollRuns.year,
                runStatus: payrollRuns.status,
                basicSalary: payslips.basicSalary,
                housingAllowance: payslips.housingAllowance,
                transportAllowance: payslips.transportAllowance,
                otherAllowances: payslips.otherAllowances,
                earningsBreakdown: payslips.earningsBreakdown,
                overtime: payslips.overtime,
                commission: payslips.commission,
                grossSalary: payslips.grossSalary,
                deductions: payslips.deductions,
                unpaidLeaveDays: payslips.unpaidLeaveDays,
                unpaidLeaveDeduction: payslips.unpaidLeaveDeduction,
                sickHalfPayDays: payslips.sickHalfPayDays,
                sickHalfPayDeduction: payslips.sickHalfPayDeduction,
                loanDeduction: payslips.loanDeduction,
                otherDeduction: payslips.otherDeduction,
                netSalary: payslips.netSalary,
                daysWorked: payslips.daysWorked,
                employeeFirstName: employees.firstName,
                employeeLastName: employees.lastName,
                employeeNo: employees.employeeNo,
                // Resolve via org_units FK (consistent with /employees/me etc.)
                // The COALESCE join is below; the legacy text column is the fallback.
                department: sql<string | null>`COALESCE(${orgUnits.name}, ${employees.department})`,
                designation: employees.designation,
                bankName: employees.bankName,
                iban: employees.iban,
                tenantName: tenants.name,
                tradeLicenseNo: tenants.tradeLicenseNo,
            })
            .from(payslips)
            // Every join filters by tenant — defence in depth so a stray
            // cross-tenant FK can't leak data even if one ever existed.
            .innerJoin(payrollRuns, and(
                eq(payslips.payrollRunId, payrollRuns.id),
                eq(payrollRuns.tenantId, tenantId),
            ))
            .innerJoin(employees, and(
                eq(payslips.employeeId, employees.id),
                eq(employees.tenantId, tenantId),
            ))
            .leftJoin(orgUnits, and(
                eq(employees.departmentId, orgUnits.id),
                eq(orgUnits.tenantId, tenantId),
            ))
            .innerJoin(tenants, eq(payslips.tenantId, tenants.id))
            .where(and(eq(payslips.tenantId, tenantId), eq(payslips.id, payslipId)))
            .limit(1)

        if (!row) return reply.code(404).send(e404('Payslip not found'))

        if (!isElevated({ roles }) && row.employeeId !== employeeId) {
            return reply.code(403).send(e403('You can only view your own payslip'))
        }
        return reply.send({ data: row })
    })
}
