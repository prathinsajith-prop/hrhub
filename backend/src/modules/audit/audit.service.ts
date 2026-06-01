import { db } from '../../db/index.js'
import { loginHistory, activityLogs } from '../../db/schema/index.js'
import { desc, sql } from 'drizzle-orm'
import { Conditions } from '../../lib/filters.js'

/**
 * Canonical activity classification. Extends the original set with the
 * assignment / file-transfer / access-control verbs the audit spec requires.
 * The `action` column is plain text, so adding values needs no DB migration.
 */
export type AuditAction =
    | 'create' | 'update' | 'delete' | 'view'
    | 'approve' | 'reject' | 'submit'
    | 'export' | 'import' | 'upload' | 'download'
    | 'assign' | 'unassign'
    | 'login' | 'logout' | 'invite'
    | 'permission_change' | 'role_change'

/** Parse basic browser/OS info from User-Agent string */
function parseUserAgent(ua: string): {
    browser: string; browserVersion: string; os: string; osVersion: string; deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown'
} {
    if (!ua) return { browser: 'Unknown', browserVersion: '', os: 'Unknown', osVersion: '', deviceType: 'unknown' }

    let browser = 'Unknown', browserVersion = '', os = 'Unknown', osVersion = ''
    let deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown' = 'unknown'

    // Device type
    if (/tablet|ipad|playbook|silk/i.test(ua)) deviceType = 'tablet'
    else if (/mobile|iphone|ipod|android|blackberry|mini|windows\sce|palm/i.test(ua)) deviceType = 'mobile'
    else if (ua.length > 0) deviceType = 'desktop'

    // Browser
    const edgeMatch = ua.match(/Edg\/(\S+)/)
    const chromeMatch = ua.match(/Chrome\/(\S+)/)
    const firefoxMatch = ua.match(/Firefox\/(\S+)/)
    const safariMatch = ua.match(/Version\/(\S+).*Safari/)
    if (edgeMatch) { browser = 'Edge'; browserVersion = edgeMatch[1] }
    else if (firefoxMatch) { browser = 'Firefox'; browserVersion = firefoxMatch[1] }
    else if (chromeMatch) { browser = 'Chrome'; browserVersion = chromeMatch[1] }
    else if (safariMatch) { browser = 'Safari'; browserVersion = safariMatch[1] }

    // OS
    if (/Windows NT 10/.test(ua)) { os = 'Windows'; osVersion = '10' }
    else if (/Windows NT 11/.test(ua)) { os = 'Windows'; osVersion = '11' }
    else if (/Mac OS X ([\d_.]+)/.test(ua)) { os = 'macOS'; osVersion = ua.match(/Mac OS X ([\d_.]+)/)?.[1]?.replace(/_/g, '.') ?? '' }
    else if (/Android ([\d.]+)/.test(ua)) { os = 'Android'; osVersion = ua.match(/Android ([\d.]+)/)?.[1] ?? '' }
    else if (/iPhone OS ([\d_]+)/.test(ua)) { os = 'iOS'; osVersion = ua.match(/iPhone OS ([\d_]+)/)?.[1]?.replace(/_/g, '.') ?? '' }
    else if (/Linux/.test(ua)) { os = 'Linux'; osVersion = '' }

    return { browser, browserVersion, os, osVersion, deviceType }
}

export interface RecordLoginParams {
    tenantId?: string | null
    userId?: string | null
    email?: string
    eventType: 'login' | 'logout' | 'failed_login' | 'password_change' | 'password_reset' | 'token_refresh' | '2fa_success' | '2fa_failed'
    success: boolean
    ipAddress?: string
    userAgent?: string
    failureReason?: string
    sessionRef?: string
}

export async function recordLoginEvent(params: RecordLoginParams): Promise<void> {
    const ua = params.userAgent ?? ''
    const parsed = parseUserAgent(ua)

    await db.insert(loginHistory).values({
        tenantId: params.tenantId ?? null,
        userId: params.userId ?? null,
        email: params.email,
        eventType: params.eventType,
        success: params.success,
        ipAddress: params.ipAddress,
        userAgent: ua.slice(0, 500),
        browser: parsed.browser,
        browserVersion: parsed.browserVersion,
        os: parsed.os,
        osVersion: parsed.osVersion,
        deviceType: parsed.deviceType,
        failureReason: params.failureReason,
        sessionRef: params.sessionRef,
    } as any)
}

export async function getLoginHistory(tenantId: string, userId?: string, limit = 50, offset = 0) {
    const effectiveLimit = Math.min(limit, 200)
    const effectiveOffset = Math.max(offset, 0)
    const rows = await db.select({
        row: loginHistory,
        totalCount: sql<number>`COUNT(*) OVER()`.as('total_count'),
    }).from(loginHistory)
        .where(Conditions.create().tenant(loginHistory.tenantId, tenantId).match(loginHistory.userId, userId).where())
        .orderBy(desc(loginHistory.createdAt), desc(loginHistory.id))
        .limit(effectiveLimit)
        .offset(effectiveOffset)
    const total = rows.length > 0 ? Number(rows[0].totalCount) : 0
    const data = rows.map(r => r.row)
    return { data, total, limit: effectiveLimit, offset: effectiveOffset, hasMore: effectiveOffset + data.length < total }
}

export interface RecordActivityParams {
    tenantId: string
    userId?: string
    actorName?: string
    actorRole?: string
    entityType: string
    entityId?: string
    entityName?: string
    action: AuditAction
    changes?: Record<string, { from: unknown; to: unknown }>
    metadata?: Record<string, unknown>
    ipAddress?: string
    userAgent?: string
    /** Correlation/request id (request.requestId) for tracing one user action across events. */
    requestId?: string
    /** Logical module/domain (e.g. 'employees', 'payroll') — defaults to entityType when omitted. */
    module?: string
}

export async function recordActivity(params: RecordActivityParams): Promise<void> {
    // Fold correlation id + module into metadata (no dedicated columns yet — a
    // follow-up migration promotes these to first-class columns). This keeps
    // traceability working today without a schema change.
    const meta: Record<string, unknown> = { ...(params.metadata ?? {}) }
    if (params.requestId && meta.requestId === undefined) meta.requestId = params.requestId
    if (meta.module === undefined) meta.module = params.module ?? params.entityType
    await db.insert(activityLogs).values({
        tenantId: params.tenantId,
        userId: params.userId ?? null,
        actorName: params.actorName,
        actorRole: params.actorRole,
        entityType: params.entityType,
        entityId: params.entityId,
        entityName: params.entityName,
        action: params.action,
        changes: params.changes ?? null,
        metadata: Object.keys(meta).length > 0 ? meta : null,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent?.slice(0, 500),
    } as any)
}

export async function getActivityLogs(tenantId: string, params: {
    entityType?: string; entityId?: string; userId?: string; action?: string; actorRole?: string; actorName?: string; entityName?: string; from?: string; to?: string; ipAddress?: string; limit?: number; offset?: number
}) {
    const { entityType, entityId, userId, action, actorRole, actorName, entityName, from, to, ipAddress, limit = 50, offset = 0 } = params

    const conds = Conditions.create()
        .tenant(activityLogs.tenantId, tenantId)
        .match(activityLogs.entityType, entityType)
        .match(activityLogs.entityId, entityId)
        .match(activityLogs.userId, userId)
        .match(activityLogs.action, action)
        .match(activityLogs.actorRole, actorRole)
        .match(activityLogs.ipAddress, ipAddress)
        .like(activityLogs.actorName, actorName)
        .like(activityLogs.entityName, entityName)
        .dateRange(activityLogs.createdAt, from || null, to || null)

    const effectiveLimit = Math.min(limit, 10000)
    const effectiveOffset = Math.max(offset, 0)
    const rows = await db.select({
        row: activityLogs,
        totalCount: sql<number>`COUNT(*) OVER()`.as('total_count'),
    }).from(activityLogs)
        .where(conds.where())
        // Stable, deterministic ordering — the id tie-breaker prevents rows with
        // identical createdAt from duplicating or being skipped across offset pages.
        .orderBy(desc(activityLogs.createdAt), desc(activityLogs.id))
        .limit(effectiveLimit)
        .offset(effectiveOffset)
    const total = rows.length > 0 ? Number(rows[0].totalCount) : 0
    const data = rows.map(r => r.row)
    return { data, total, limit: effectiveLimit, offset: effectiveOffset, hasMore: effectiveOffset + data.length < total }
}
