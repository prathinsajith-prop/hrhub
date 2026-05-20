import { and, desc, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { db } from '../../db/client.js'
import { assetAssignments, assetCategories, assets } from '../../db/schema/index.js'
import { e403, e404 } from '../../lib/errors.js'
import { parseUuidParam } from '../../lib/validation.js'
import { canAccessEmployee } from '../../lib/scoping.js'

/**
 * Currently-assigned gear for an employee. Filters by status='assigned' so
 * returned/lost items don't clutter the portal view — those live in the admin
 * app's asset history. Joined with assets + asset_categories so a single round
 * trip returns everything needed to render an asset card.
 */
async function getActiveAssignments(tenantId: string, employeeId: string) {
    return db
        .select({
            id: assetAssignments.id,
            assetId: assetAssignments.assetId,
            assignedDate: assetAssignments.assignedDate,
            expectedReturnDate: assetAssignments.expectedReturnDate,
            notes: assetAssignments.notes,
            assetCode: assets.assetCode,
            assetName: assets.name,
            assetBrand: assets.brand,
            assetModel: assets.model,
            assetSerialNumber: assets.serialNumber,
            assetCondition: assets.condition,
            categoryName: assetCategories.name,
        })
        .from(assetAssignments)
        // Tenant defence on every join — schema doesn't enforce that the
        // joined assets/categories share the same tenant_id, so we filter
        // explicitly to avoid any cross-tenant leak from stray FKs.
        .leftJoin(assets, and(
            eq(assets.id, assetAssignments.assetId),
            eq(assets.tenantId, tenantId),
        ))
        .leftJoin(assetCategories, and(
            eq(assetCategories.id, assets.categoryId),
            eq(assetCategories.tenantId, tenantId),
        ))
        .where(
            and(
                eq(assetAssignments.tenantId, tenantId),
                eq(assetAssignments.employeeId, employeeId),
                eq(assetAssignments.status, 'assigned'),
            ),
        )
        .orderBy(desc(assetAssignments.assignedDate))
}

export default async function assetsRoutes(fastify: FastifyInstance) {
    const auth = { preHandler: [(fastify as any).authenticate] }

    // GET /api/v1/assets/my — current user's active assignments
    fastify.get('/my', { ...auth }, async (request: any, reply: any) => {
        const { employeeId, tenantId } = request.user
        if (!employeeId) return reply.send({ data: [] })
        const data = await getActiveAssignments(tenantId, employeeId)
        return reply.send({ data })
    })

    // GET /api/v1/assets/employee/:employeeId — manager viewing a team member's gear
    fastify.get('/employee/:employeeId', { ...auth }, async (request: any, reply: any) => {
        const employeeId = parseUuidParam(request.params, 'employeeId', reply)
        if (!employeeId) return

        const user = request.user
        if (!(await canAccessEmployee(user, employeeId, request))) {
            return reply.code(403).send(e403('Not authorized to view this employee'))
        }

        // Confirm the target exists so we don't silently return [] for a bad UUID
        // (canAccessEmployee returns true for elevated roles regardless of existence).
        const data = await getActiveAssignments(user.tenantId, employeeId)
        if (!data) return reply.code(404).send(e404('Employee not found'))
        return reply.send({ data })
    })
}
