import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Shared activity-feed rendering.
 *
 * `buildActivityHeadline` turns an audit/activity log entry into a
 * human-readable, kind-aware headline (e.g. "uploaded a document",
 * "ran payroll", "completed an onboarding step"). The same headline is
 * used by the employee "Updates" tab and the global Audit Log page so
 * rows read consistently everywhere.
 *
 * The "kind" of an activity is carried on `log.metadata.kind`, with an
 * optional finer-grained `log.metadata.subKind`. When no kind is present
 * the function falls back to a generic "{verb} N fields / this record"
 * headline derived from the action + change count.
 */

/** Subset of the activity-log shape that headline rendering depends on. */
export interface ActivityHeadlineLog {
    actorName: string | null
    action: string
    entityType: string
    entityName?: string | null
    metadata?: Record<string, unknown> | null
}

/** Who is looking at the feed — affects pronoun choice ("you" vs the actor's name). */
export type ActivityViewer = 'self' | 'hr'

/** Past-tense verb for an audit action ("update" → "updated"). */
function actionVerb(action: string): string {
    const map: Record<string, string> = {
        create: 'created',
        update: 'updated',
        delete: 'deleted',
        approve: 'approved',
        reject: 'rejected',
        submit: 'submitted',
        view: 'viewed',
        export: 'exported',
        import: 'imported',
        login: 'logged into',
        logout: 'logged out of',
        archive: 'archived',
        activate: 'activated',
        suspend: 'suspended',
        cancel: 'cancelled',
        invite: 'invited',
    }
    return map[action] ?? action.replace(/_/g, ' ')
}

function readMetaString(metadata: Record<string, unknown> | null | undefined, key: string): string | undefined {
    const v = metadata?.[key]
    return typeof v === 'string' ? v : undefined
}

/**
 * Returns the verb phrase for a given activity kind. Returns `null` when the
 * kind is unknown so the caller can fall back to the generic headline.
 */
function kindVerbPhrase(kind: string, subKind: string | undefined, action: string): string | null {
    switch (kind) {
        case 'document':
            if (subKind === 'verify') return 'verified a document'
            if (subKind === 'delete' || action === 'delete') return 'removed a document'
            if (subKind === 'expiry') return 'flagged a document expiry'
            return 'uploaded a document'
        case 'attendance':
            if (subKind === 'punch-in') return 'punched in'
            if (subKind === 'punch-out') return 'punched out'
            if (subKind === 'import') return 'imported attendance records'
            return 'updated an attendance record'
        case 'payroll':
            if (subKind === 'run') return 'ran payroll'
            if (subKind === 'approve' || action === 'approve') return 'approved a payroll run'
            if (subKind === 'payslip') return 'generated a payslip'
            return 'updated payroll'
        case 'leave':
            if (subKind === 'request' || action === 'submit') return 'requested leave'
            if (subKind === 'approve' || action === 'approve') return 'approved a leave request'
            if (subKind === 'reject' || action === 'reject') return 'rejected a leave request'
            if (subKind === 'cancel' || action === 'cancel') return 'cancelled a leave request'
            return 'updated a leave request'
        case 'loan':
            if (subKind === 'request' || action === 'submit') return 'requested a loan'
            if (subKind === 'approve' || action === 'approve') return 'approved a loan'
            if (subKind === 'reject' || action === 'reject') return 'rejected a loan'
            if (subKind === 'repay') return 'recorded a loan repayment'
            return 'updated a loan'
        case 'visa':
            if (subKind === 'advance' || subKind === 'step') return 'advanced a visa application'
            if (subKind === 'cost') return 'recorded a visa cost'
            if (action === 'create') return 'started a visa application'
            return 'updated a visa application'
        case 'transfer':
            if (subKind === 'approve' || action === 'approve') return 'approved a transfer'
            if (action === 'create' || subKind === 'request') return 'requested a transfer'
            return 'updated a transfer'
        case 'exit':
            if (subKind === 'approve' || action === 'approve') return 'approved an exit request'
            if (subKind === 'reject' || action === 'reject') return 'rejected an exit request'
            if (subKind === 'settle' || subKind === 'settlement') return 'recorded an exit settlement'
            if (action === 'create' || subKind === 'request') return 'started an exit request'
            return 'updated an exit request'
        case 'asset':
            if (subKind === 'assign') return 'assigned an asset'
            if (subKind === 'return' || subKind === 'unassign') return 'returned an asset'
            if (action === 'create') return 'added an asset'
            return 'updated an asset'
        case 'performance':
            if (subKind === 'submit' || action === 'submit') return 'submitted a performance review'
            if (subKind === 'rate') return 'rated a performance review'
            if (action === 'create') return 'started a performance review'
            return 'updated a performance review'
        case 'security':
            if (subKind === 'password' || subKind === 'password-change') return 'changed the password'
            if (subKind === '2fa-enable') return 'enabled two-factor authentication'
            if (subKind === '2fa-disable') return 'disabled two-factor authentication'
            if (action === 'login') return 'signed in'
            if (action === 'logout') return 'signed out'
            return 'updated security settings'
        case 'profile':
            if (subKind === 'avatar' || subKind === 'photo') return 'updated the profile photo'
            if (subKind === 'contact') return 'updated contact details'
            if (subKind === 'bank') return 'updated bank details'
            return 'updated the profile'
        case 'onboarding':
            if (subKind === 'step-complete' || subKind === 'complete') return 'completed an onboarding step'
            if (action === 'create' || subKind === 'create') return 'started onboarding'
            return 'updated onboarding'
        case 'offboarding':
            // Offboarding mirrors the exit-style verbs.
            if (subKind === 'approve' || action === 'approve') return 'approved an exit request'
            if (subKind === 'reject' || action === 'reject') return 'rejected an exit request'
            if (subKind === 'settle' || subKind === 'settlement') return 'recorded an exit settlement'
            if (action === 'create' || subKind === 'request') return 'started an exit request'
            return 'updated an exit request'
        default:
            return null
    }
}

/** Generic, kind-agnostic verb phrase derived from action + change count. */
function genericVerbPhrase(action: string, changeCount: number): string {
    if (action === 'update' && changeCount > 0) {
        return `updated ${changeCount} field${changeCount === 1 ? '' : 's'}`
    }
    if (action === 'update') return 'updated this record'
    return actionVerb(action)
}

/**
 * Build a kind-aware headline node for an activity log entry.
 *
 * @param log         The activity/audit log entry (needs actorName, action,
 *                    entityType, optional entityName + metadata.kind/subKind).
 * @param changeCount Number of changed fields (used by the generic fallback).
 * @param viewer      'self' renders "You …"; 'hr' (default) renders the actor's name.
 */
export function buildActivityHeadline(
    log: ActivityHeadlineLog,
    changeCount = 0,
    viewer: ActivityViewer = 'hr',
): React.ReactNode {
    const kind = readMetaString(log.metadata, 'kind')
    const subKind = readMetaString(log.metadata, 'subKind')

    const phrase = kind ? kindVerbPhrase(kind, subKind, log.action) : null
    const verbPhrase = phrase ?? genericVerbPhrase(log.action, changeCount)

    const subject = viewer === 'self' ? 'You' : (log.actorName ?? 'System')

    return (
        <span className="text-sm">
            <span className="font-medium">{subject}</span>
            <span className="text-muted-foreground"> {verbPhrase}</span>
            {log.entityName ? (
                <>
                    <span className="text-muted-foreground"> · </span>
                    <span className="font-medium truncate">{log.entityName}</span>
                </>
            ) : null}
        </span>
    )
}

/** A single item shown in the {@link ActivityFeed}. */
export interface ActivityFeedItem extends ActivityHeadlineLog {
    id: string
    changeCount?: number
    timeLabel?: string
}

interface ActivityFeedProps {
    items: ActivityFeedItem[]
    viewer?: ActivityViewer
    className?: string
}

/**
 * Lightweight vertical activity feed. Renders each item's kind-aware headline
 * via {@link buildActivityHeadline}. Pages that need richer rows (diff view,
 * IP, avatars) compose `buildActivityHeadline` directly instead.
 */
export function ActivityFeed({ items, viewer = 'hr', className }: ActivityFeedProps) {
    if (items.length === 0) {
        return (
            <p className={cn('text-sm text-muted-foreground', className)}>No activity yet.</p>
        )
    }
    return (
        <ul className={cn('divide-y rounded-xl border bg-card', className)}>
            {items.map(item => (
                <li key={item.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    {buildActivityHeadline(item, item.changeCount ?? 0, viewer)}
                    {item.timeLabel ? (
                        <span className="shrink-0 text-[11px] text-muted-foreground">{item.timeLabel}</span>
                    ) : null}
                </li>
            ))}
        </ul>
    )
}
