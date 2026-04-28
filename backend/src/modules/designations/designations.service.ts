import { eq, and, asc } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { designations } from '../../db/schema/index.js'

export async function listDesignations(tenantId: string) {
    return db
        .select()
        .from(designations)
        .where(eq(designations.tenantId, tenantId))
        .orderBy(asc(designations.sortOrder), asc(designations.name))
}

export async function createDesignation(tenantId: string, data: { name: string; sortOrder?: number }) {
    const [row] = await db
        .insert(designations)
        .values({ tenantId, name: data.name.trim(), sortOrder: data.sortOrder ?? 0 })
        .returning()
    return row
}

export async function updateDesignation(
    tenantId: string,
    id: string,
    data: { name?: string; isActive?: boolean; sortOrder?: number },
) {
    const patch: Partial<typeof designations.$inferInsert> = {}
    if (data.name !== undefined) patch.name = data.name.trim()
    if (data.isActive !== undefined) patch.isActive = data.isActive
    if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder

    const [row] = await db
        .update(designations)
        .set(patch)
        .where(and(eq(designations.id, id), eq(designations.tenantId, tenantId)))
        .returning()
    return row ?? null
}

export async function deleteDesignation(tenantId: string, id: string) {
    const [row] = await db
        .delete(designations)
        .where(and(eq(designations.id, id), eq(designations.tenantId, tenantId)))
        .returning({ id: designations.id })
    return row ?? null
}
