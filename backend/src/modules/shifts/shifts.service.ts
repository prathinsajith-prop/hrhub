import { eq, and, asc } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { shifts, type ShiftCoreHoursWindow } from '../../db/schema/index.js'

export type ShiftInput = {
    name: string
    color?: string | null
    startTime: string
    endTime: string
    weeklyOffDays?: string[]
    /** Punch-in / out margin in minutes. Both fields must be supplied together
     *  (or both omitted — meaning "no margin enforcement"). Enforced by a DB
     *  CHECK constraint as well. */
    shiftMarginBeforeMinutes?: number | null
    shiftMarginAfterMinutes?: number | null
    /** Per-shift core hours windows. Empty array = no core-hours requirement. */
    coreWorkingHours?: ShiftCoreHoursWindow[]
    restrictBreaksDuringCoreHours?: boolean
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
            color: data.color ?? null,
            startTime: data.startTime,
            endTime: data.endTime,
            weeklyOffDays: data.weeklyOffDays ?? [],
            shiftMarginBeforeMinutes: data.shiftMarginBeforeMinutes ?? null,
            shiftMarginAfterMinutes: data.shiftMarginAfterMinutes ?? null,
            coreWorkingHours: data.coreWorkingHours ?? [],
            restrictBreaksDuringCoreHours: data.restrictBreaksDuringCoreHours ?? false,
            sortOrder: data.sortOrder ?? 0,
        })
        .returning()
    return row
}

export async function updateShift(tenantId: string, id: string, data: ShiftUpdate) {
    const patch: Partial<typeof shifts.$inferInsert> = { updatedAt: new Date() }
    if (data.name !== undefined) patch.name = data.name.trim()
    if (data.color !== undefined) patch.color = data.color
    if (data.startTime !== undefined) patch.startTime = data.startTime
    if (data.endTime !== undefined) patch.endTime = data.endTime
    if (data.weeklyOffDays !== undefined) patch.weeklyOffDays = data.weeklyOffDays
    if (data.shiftMarginBeforeMinutes !== undefined) patch.shiftMarginBeforeMinutes = data.shiftMarginBeforeMinutes
    if (data.shiftMarginAfterMinutes !== undefined) patch.shiftMarginAfterMinutes = data.shiftMarginAfterMinutes
    if (data.coreWorkingHours !== undefined) patch.coreWorkingHours = data.coreWorkingHours
    if (data.restrictBreaksDuringCoreHours !== undefined) patch.restrictBreaksDuringCoreHours = data.restrictBreaksDuringCoreHours
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
