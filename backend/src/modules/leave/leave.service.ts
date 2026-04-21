import { eq, and, count, desc, isNull } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { leaveRequests } from '../../db/schema/index.js'
import type { InferInsertModel } from 'drizzle-orm'

type NewLeaveRequest = InferInsertModel<typeof leaveRequests>

export async function listLeaveRequests(tenantId: string, params: { employeeId?: string; status?: string; leaveType?: string; limit: number; offset: number }) {
    const { employeeId, status, leaveType, limit, offset } = params
    const conditions = [eq(leaveRequests.tenantId, tenantId), isNull(leaveRequests.deletedAt)]
    if (employeeId) conditions.push(eq(leaveRequests.employeeId, employeeId))
    if (status) conditions.push(eq(leaveRequests.status, status as never))
    if (leaveType) conditions.push(eq(leaveRequests.leaveType, leaveType as never))

    const [{ total }] = await db.select({ total: count() }).from(leaveRequests).where(and(...conditions))

    const data = await db.select().from(leaveRequests)
        .where(and(...conditions))
        .orderBy(desc(leaveRequests.createdAt))
        .limit(limit).offset(offset)

    return { data, total: Number(total), limit, offset, hasMore: offset + limit < Number(total) }
}

export async function createLeaveRequest(tenantId: string, data: Omit<NewLeaveRequest, 'tenantId' | 'id'>) {
    const [row] = await db.insert(leaveRequests).values({ ...data, tenantId }).returning()
    return row
}

export async function approveLeave(tenantId: string, id: string, approvedBy: string, approved: boolean) {
    const [row] = await db.update(leaveRequests)
        .set({
            status: approved ? 'approved' : 'rejected',
            approvedBy,
            approvedAt: new Date(),
            updatedAt: new Date(),
        } as any)
        .where(and(eq(leaveRequests.id, id), eq(leaveRequests.tenantId, tenantId), eq(leaveRequests.status, 'pending')))
        .returning()
    return row ?? null
}

export async function cancelLeave(tenantId: string, id: string) {
    const [row] = await db.update(leaveRequests)
        .set({ status: 'cancelled', updatedAt: new Date() } as any)
        .where(and(eq(leaveRequests.id, id), eq(leaveRequests.tenantId, tenantId)))
        .returning()
    return row ?? null
}

export async function softDeleteLeaveRequest(tenantId: string, id: string) {
    const [row] = await db.update(leaveRequests)
        .set({ deletedAt: new Date(), updatedAt: new Date() } as any)
        .where(and(eq(leaveRequests.id, id), eq(leaveRequests.tenantId, tenantId), isNull(leaveRequests.deletedAt)))
        .returning()
    return row ?? null
}
