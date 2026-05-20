import { eq, and, desc, isNull, inArray, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { employeeTransfers, employees, users, orgUnits } from '../../db/schema/index.js'
import type { InferInsertModel } from 'drizzle-orm'

type NewTransfer = Omit<InferInsertModel<typeof employeeTransfers>, 'id' | 'tenantId' | 'createdAt' | 'deletedAt'>

export async function listTransfers(tenantId: string, employeeId: string) {
    const rows = await db
        .select({
            id: employeeTransfers.id,
            tenantId: employeeTransfers.tenantId,
            employeeId: employeeTransfers.employeeId,
            transferDate: employeeTransfers.transferDate,
            fromDesignation: employeeTransfers.fromDesignation,
            fromDepartment: employeeTransfers.fromDepartment,
            fromBranchId: employeeTransfers.fromBranchId,
            fromDivisionId: employeeTransfers.fromDivisionId,
            fromDepartmentId: employeeTransfers.fromDepartmentId,
            toDesignation: employeeTransfers.toDesignation,
            toDepartment: employeeTransfers.toDepartment,
            toBranchId: employeeTransfers.toBranchId,
            toDivisionId: employeeTransfers.toDivisionId,
            toDepartmentId: employeeTransfers.toDepartmentId,
            newSalary: employeeTransfers.newSalary,
            reason: employeeTransfers.reason,
            notes: employeeTransfers.notes,
            approvedBy: employeeTransfers.approvedBy,
            approvedByName: sql<string | null>`${users.name}`,
            createdAt: employeeTransfers.createdAt,
        })
        .from(employeeTransfers)
        .leftJoin(users, eq(users.id, employeeTransfers.approvedBy))
        .where(
            and(
                eq(employeeTransfers.employeeId, employeeId),
                eq(employeeTransfers.tenantId, tenantId),
                isNull(employeeTransfers.deletedAt),
            ),
        )
        .orderBy(desc(employeeTransfers.transferDate))

    // Resolve org unit names for all branch/division IDs in one query
    const orgUnitIds = [...new Set(rows.flatMap(r => [
        r.fromBranchId, r.fromDivisionId, r.toBranchId, r.toDivisionId,
    ]).filter(Boolean) as string[])]

    const unitNameMap = new Map<string, string>()
    if (orgUnitIds.length > 0) {
        const units = await db
            .select({ id: orgUnits.id, name: orgUnits.name })
            .from(orgUnits)
            .where(inArray(orgUnits.id, orgUnitIds))
        units.forEach(u => unitNameMap.set(u.id, u.name))
    }

    return rows.map(r => ({
        ...r,
        fromBranchName: r.fromBranchId ? (unitNameMap.get(r.fromBranchId) ?? null) : null,
        fromDivisionName: r.fromDivisionId ? (unitNameMap.get(r.fromDivisionId) ?? null) : null,
        toBranchName: r.toBranchId ? (unitNameMap.get(r.toBranchId) ?? null) : null,
        toDivisionName: r.toDivisionId ? (unitNameMap.get(r.toDivisionId) ?? null) : null,
    }))
}

export async function createTransfer(
    tenantId: string,
    data: NewTransfer,
) {
    const [transfer] = await db
        .insert(employeeTransfers)
        .values({ ...data, tenantId })
        .returning()

    // If transferDate <= today, update the employee record immediately
    const today = new Date().toISOString().split('T')[0]!
    if (data.transferDate <= today) {
        const updateFields: Record<string, unknown> = { updatedAt: new Date() }
        if (data.toBranchId !== undefined) updateFields['branchId'] = data.toBranchId
        if (data.toDivisionId !== undefined) updateFields['divisionId'] = data.toDivisionId
        if (data.toDepartmentId !== undefined) updateFields['departmentId'] = data.toDepartmentId
        if (data.toDesignation !== undefined) updateFields['designation'] = data.toDesignation
        if (data.toDepartment !== undefined && data.toDepartment !== null) {
            updateFields['department'] = data.toDepartment
        } else if (data.toDepartmentId !== undefined) {
            // Caller picked a department FK without supplying the text label —
            // resolve it from org_units so the legacy `department` text column
            // stays in sync. Without this the text drifts on every transfer
            // and downstream views (which COALESCE FK ↦ text) silently show
            // mixed values across the app. Clearing the FK clears the text.
            if (data.toDepartmentId === null) {
                updateFields['department'] = null
            } else {
                const [unit] = await db
                    .select({ name: orgUnits.name })
                    .from(orgUnits)
                    .where(and(eq(orgUnits.id, data.toDepartmentId), eq(orgUnits.tenantId, tenantId)))
                    .limit(1)
                updateFields['department'] = unit?.name ?? null
            }
        }
        if (data.newSalary !== undefined && data.newSalary !== null) {
            updateFields['totalSalary'] = String(data.newSalary)
        }

        if (Object.keys(updateFields).length > 1) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await db.update(employees).set(updateFields as any)
                .where(and(eq(employees.id, data.employeeId), eq(employees.tenantId, tenantId)))
        }
    }

    return transfer!
}
