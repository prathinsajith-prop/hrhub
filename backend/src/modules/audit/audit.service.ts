import { db } from '../../db/index.js'
import { loginHistory, activityLogs } from '../../db/schema/index.js'
import { eq, and, desc } from 'drizzle-orm'

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

export async function getLoginHistory(tenantId: string, userId?: string, limit = 50) {
    const conditions = [eq(loginHistory.tenantId, tenantId)]
    if (userId) conditions.push(eq(loginHistory.userId, userId))
    return db.select().from(loginHistory)
        .where(and(...conditions))
        .orderBy(desc(loginHistory.createdAt))
        .limit(Math.min(limit, 200))
}

export interface RecordActivityParams {
    tenantId: string
    userId?: string
    actorName?: string
    actorRole?: string
    entityType: string
    entityId?: string
    entityName?: string
    action: 'create' | 'update' | 'delete' | 'view' | 'approve' | 'reject' | 'submit' | 'export' | 'import' | 'login' | 'logout'
    changes?: Record<string, { from: unknown; to: unknown }>
    metadata?: Record<string, unknown>
    ipAddress?: string
    userAgent?: string
}

export async function recordActivity(params: RecordActivityParams): Promise<void> {
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
        metadata: params.metadata ?? null,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent?.slice(0, 500),
    } as any)
}

export async function getActivityLogs(tenantId: string, params: {
    entityType?: string; entityId?: string; userId?: string; limit?: number; offset?: number
}) {
    const { entityType, entityId, userId, limit = 50, offset = 0 } = params
    const conditions = [eq(activityLogs.tenantId, tenantId)]
    if (entityType) conditions.push(eq(activityLogs.entityType, entityType))
    if (entityId) conditions.push(eq(activityLogs.entityId, entityId))
    if (userId) conditions.push(eq(activityLogs.userId, userId))

    return db.select().from(activityLogs)
        .where(and(...conditions))
        .orderBy(desc(activityLogs.createdAt))
        .limit(Math.min(limit, 200))
        .offset(offset)
}
