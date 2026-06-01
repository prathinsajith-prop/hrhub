import { db } from '../db/client.js'
import { activityLogs, loginHistory } from '../db/schema/index.js'

function parseUserAgent(ua: string): {
    browser: string; browserVersion: string; os: string; osVersion: string; deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown'
} {
    if (!ua) return { browser: 'Unknown', browserVersion: '', os: 'Unknown', osVersion: '', deviceType: 'unknown' }
    let browser = 'Unknown', browserVersion = '', os = 'Unknown', osVersion = ''
    let deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown' = 'unknown'
    if (/tablet|ipad|playbook|silk/i.test(ua)) deviceType = 'tablet'
    else if (/mobile|iphone|ipod|android|blackberry|mini/i.test(ua)) deviceType = 'mobile'
    else if (ua.length > 0) deviceType = 'desktop'

    const edgeMatch = ua.match(/Edg\/(\S+)/)
    const chromeMatch = ua.match(/Chrome\/(\S+)/)
    const firefoxMatch = ua.match(/Firefox\/(\S+)/)
    const safariMatch = ua.match(/Version\/(\S+).*Safari/)
    if (edgeMatch) { browser = 'Edge'; browserVersion = edgeMatch[1] }
    else if (firefoxMatch) { browser = 'Firefox'; browserVersion = firefoxMatch[1] }
    else if (chromeMatch) { browser = 'Chrome'; browserVersion = chromeMatch[1] }
    else if (safariMatch) { browser = 'Safari'; browserVersion = safariMatch[1] }

    if (/Windows NT 10/.test(ua)) { os = 'Windows'; osVersion = '10' }
    else if (/Mac OS X ([\d_.]+)/.test(ua)) { os = 'macOS'; osVersion = ua.match(/Mac OS X ([\d_.]+)/)?.[1]?.replace(/_/g, '.') ?? '' }
    else if (/Android ([\d.]+)/.test(ua)) { os = 'Android'; osVersion = ua.match(/Android ([\d.]+)/)?.[1] ?? '' }
    else if (/iPhone OS ([\d_]+)/.test(ua)) { os = 'iOS'; osVersion = ua.match(/iPhone OS ([\d_]+)/)?.[1]?.replace(/_/g, '.') ?? '' }
    else if (/Linux/.test(ua)) { os = 'Linux' }

    return { browser, browserVersion, os, osVersion, deviceType }
}

export interface RecordLoginParams {
    tenantId?: string | null
    userId?: string | null
    email?: string
    eventType: 'login' | 'logout' | 'failed_login' | 'token_refresh' | '2fa_success' | '2fa_failed'
    success: boolean
    ipAddress?: string
    userAgent?: string
    failureReason?: string
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
    } as any)
}

export interface RecordActivityParams {
    tenantId: string
    userId?: string
    actorName?: string
    actorRole?: string
    entityType: string
    entityId?: string
    entityName?: string
    action: 'create' | 'update' | 'delete' | 'view' | 'approve' | 'reject' | 'submit' | 'login' | 'logout'
    changes?: Record<string, { from: unknown; to: unknown }>
    metadata?: Record<string, unknown>
    ipAddress?: string
    userAgent?: string
}

/** Fields whose values must never be stored verbatim in the audit trail.
 *  Kept in sync with the main backend's SENSITIVE_AUDIT_FIELDS. */
const SENSITIVE_AUDIT_FIELDS = new Set(['iban', 'accountNumber', 'passportNo', 'emiratesId', 'swiftCode'])

function maskSensitiveValue(value: unknown): unknown {
    if (value === null || value === undefined || value === '') return value
    const s = String(value)
    return s.length <= 4 ? '••••' : `••••${s.slice(-4)}`
}

/** Redact sensitive identifiers from a change-set (returns a masked copy). */
function maskChanges(changes: Record<string, { from: unknown; to: unknown }>) {
    const out: Record<string, { from: unknown; to: unknown }> = {}
    for (const [key, val] of Object.entries(changes)) {
        out[key] = SENSITIVE_AUDIT_FIELDS.has(key)
            ? { from: maskSensitiveValue(val.from), to: maskSensitiveValue(val.to) }
            : val
    }
    return out
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
        // Defence in depth: redact sensitive identifiers at the single write point.
        changes: params.changes ? maskChanges(params.changes) : null,
        metadata: params.metadata ?? null,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent?.slice(0, 500),
    } as any)
}
