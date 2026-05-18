import { eq, and, asc } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { shifts } from '../../db/schema/index.js'

export type ShiftInput = {
    name: string
    startTime: string
    endTime: string
    weeklyOffDays?: string[]
    sortOrder?: number
}

export type ShiftUpdate = Partial<ShiftInput> & { isActive?: boolean }

export async function listShifts(tenantId: string, opts?: { includeInactive?: boolean }) {
    const where = opts?.includeInactive
        ? eq(shifts.tenantId, tenantId)
        : and(eq(shifts.tenantId, tenantId), eq(shifts.isActive, true))
    return db
        .select()
        .from(shifts)
        .where(where)
        .orderBy(asc(shifts.sortOrder), asc(shifts.name))
}

export async function createShift(tenantId: string, data: ShiftInput) {
    const [row] = await db
        .insert(shifts)
        .values({
            tenantId,
            name: data.name.trim(),
            startTime: data.startTime,
            endTime: data.endTime,
            weeklyOffDays: data.weeklyOffDays ?? [],
            sortOrder: data.sortOrder ?? 0,
        })
        .returning()
    return row
}

export async function updateShift(tenantId: string, id: string, data: ShiftUpdate) {
    const patch: Partial<typeof shifts.$inferInsert> = { updatedAt: new Date() }
    if (data.name !== undefined) patch.name = data.name.trim()
    if (data.startTime !== undefined) patch.startTime = data.startTime
    if (data.endTime !== undefined) patch.endTime = data.endTime
    if (data.weeklyOffDays !== undefined) patch.weeklyOffDays = data.weeklyOffDays
    if (data.isActive !== undefined) patch.isActive = data.isActive
    if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder

    const [row] = await db
        .update(shifts)
        .set(patch)
        .where(and(eq(shifts.id, id), eq(shifts.tenantId, tenantId)))
        .returning()
    return row ?? null
}

// Soft delete — preserves any employee.shift_id references and just hides the
// shift from active pickers. Use hardDeleteShift for permanent removal.
export async function deleteShift(tenantId: string, id: string) {
    const [row] = await db
        .update(shifts)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(shifts.id, id), eq(shifts.tenantId, tenantId)))
        .returning({ id: shifts.id })
    return row ?? null
}
