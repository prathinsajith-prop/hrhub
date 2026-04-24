/**
 * Audit repository — single chokepoint for writing to activity_logs.
 *
 * Every mutating service in the backend should emit an audit row through
 * this helper instead of calling `db.insert(activityLogs)` directly. This
 * gives us:
 *   - Consistent shape (action, entity_type, entity_id, changes, metadata)
 *   - One place to add hashing, pseudonymisation, or async forwarding later
 *   - Easier testing — services depend on a typed function, not raw SQL
 */
import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { activityLogs } from '../db/schema/audit.js'
import {
    applyKeyset,
    buildKeysetResult,
    conjunction,
    type KeysetParams,
    type KeysetResult,
} from '../lib/query-helpers.js'

export type AuditAction =
    | 'create' | 'update' | 'delete' | 'view'
    | 'approve' | 'reject' | 'submit' | 'export' | 'import'
    | 'login' | 'logout'

export interface RecordAuditInput {
    tenantId: string
    userId?: string | null
    actorName?: string | null
    actorRole?: string | null
    entityType: string
    entityId?: string | null
    entityName?: string | null
    action: AuditAction
    changes?: Record<string, { from: unknown; to: unknown }> | null
    metadata?: Record<string, unknown> | null
    ipAddress?: string | null
    userAgent?: string | null
}

/**
 * Persist an audit row. Errors are swallowed and logged: audit must never
 * break the calling business operation.
 */
export async function recordAudit(input: RecordAuditInput): Promise<void> {
    try {
        await db.insert(activityLogs).values({
            tenantId: input.tenantId,
            userId: input.userId ?? null,
            actorName: input.actorName ?? null,
            actorRole: input.actorRole ?? null,
            entityType: input.entityType,
            entityId: input.entityId ?? null,
            entityName: input.entityName ?? null,
            action: input.action,
            changes: input.changes ?? null,
            metadata: input.metadata ?? null,
            ipAddress: input.ipAddress ?? null,
            userAgent: input.userAgent ?? null,
        })
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[audit] failed to record activity', { entityType: input.entityType, action: input.action, err })
    }
}

export interface ListAuditOpts extends KeysetParams {
    entityType?: string
    entityId?: string
    userId?: string
    action?: AuditAction
}

export async function listAuditLogs(
    tenantId: string,
    opts: ListAuditOpts = {}
): Promise<KeysetResult<typeof activityLogs.$inferSelect>> {
    const predicate = conjunction([
        eq(activityLogs.tenantId, tenantId),
        opts.entityType ? eq(activityLogs.entityType, opts.entityType) : undefined,
        opts.entityId ? eq(activityLogs.entityId, opts.entityId) : undefined,
        opts.userId ? eq(activityLogs.userId, opts.userId) : undefined,
        opts.action ? eq(activityLogs.action, opts.action) : undefined,
    ])!

    const { limit, cursorPredicate } = applyKeyset(opts, activityLogs.createdAt, activityLogs.id)
    const finalPredicate = cursorPredicate ? and(predicate, cursorPredicate)! : predicate
    const rows = await db
        .select()
        .from(activityLogs)
        .where(finalPredicate)
        .orderBy(desc(activityLogs.createdAt), desc(activityLogs.id))
        .limit(limit + 1)
    return buildKeysetResult(rows, limit, (r) => [r.createdAt as Date, r.id])
}

/** Lightweight count of audit events for dashboard widgets. */
export async function countAudit(tenantId: string, sinceDays = 7) {
    const rows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(activityLogs)
        .where(and(
            eq(activityLogs.tenantId, tenantId),
            sql`${activityLogs.createdAt} >= now() - (${sinceDays}::int * interval '1 day')`,
        ))
    return rows[0]?.count ?? 0
}
