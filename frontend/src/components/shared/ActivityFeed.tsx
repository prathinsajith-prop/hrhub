import * as React from 'react'
import { Loader2, History } from 'lucide-react'
import { ActionBadge } from '@/components/shared/UICommons'
import type { ActivityLog } from '@/hooks/useAudit'
import { formatChangeEntries } from '@/lib/activityFormat'
import { formatDateTime } from '@/lib/utils'

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


function metaPillsFor(log: ActivityLog): { label: string; value: string }[] {
    const meta = (log.metadata ?? {}) as Record<string, unknown>
    const pills: { label: string; value: string }[] = []
    if (meta.kind === 'attendance' && typeof meta.locationName === 'string' && meta.locationName) {
        pills.push({ label: 'Location', value: String(meta.locationName) })
    }
    if (meta.kind === 'attendance' && typeof meta.deviceName === 'string' && meta.deviceName) {
        pills.push({ label: 'Device', value: String(meta.deviceName) })
    }
    if (meta.kind === 'document' && typeof meta.docType === 'string' && meta.docType) {
        pills.push({ label: 'Doc type', value: String(meta.docType) })
    }
    if (meta.kind === 'document' && typeof meta.reason === 'string' && meta.reason) {
        pills.push({ label: 'Reason', value: String(meta.reason) })
    }
    if (meta.kind === 'leave') {
        if (typeof meta.startDate === 'string' && meta.startDate) pills.push({ label: 'From', value: String(meta.startDate) })
        if (typeof meta.endDate === 'string' && meta.endDate) pills.push({ label: 'To', value: String(meta.endDate) })
        if (typeof meta.notes === 'string' && meta.notes) pills.push({ label: 'Notes', value: String(meta.notes) })
    }
    if (meta.kind === 'loan') {
        if (typeof meta.reason === 'string' && meta.reason) pills.push({ label: 'Reason', value: String(meta.reason) })
        if (typeof meta.notes === 'string' && meta.notes) pills.push({ label: 'Notes', value: String(meta.notes) })
        if (typeof meta.startDate === 'string' && meta.startDate) pills.push({ label: 'Starts', value: String(meta.startDate) })
    }
    if (meta.kind === 'transfer') {
        if (typeof meta.toDesignation === 'string' && meta.toDesignation) pills.push({ label: 'New designation', value: String(meta.toDesignation) })
        if (typeof meta.transferDate === 'string' && meta.transferDate) pills.push({ label: 'Effective', value: String(meta.transferDate) })
        if (typeof meta.reason === 'string' && meta.reason) pills.push({ label: 'Reason', value: String(meta.reason) })
    }
    if (meta.kind === 'exit') {
        if (typeof meta.exitType === 'string' && meta.exitType) pills.push({ label: 'Type', value: String(meta.exitType).replace(/_/g, ' ') })
        if (typeof meta.exitDate === 'string' && meta.exitDate) pills.push({ label: 'Exit date', value: String(meta.exitDate) })
        if (typeof meta.reason === 'string' && meta.reason) pills.push({ label: 'Reason', value: String(meta.reason) })
        if (meta.override === true) pills.push({ label: 'Override', value: 'yes' })
    }
    if (meta.kind === 'visa') {
        if (typeof meta.visaType === 'string' && meta.visaType) pills.push({ label: 'Visa type', value: String(meta.visaType).replace(/_/g, ' ') })
        if (typeof meta.fromStepLabel === 'string' && typeof meta.toStepLabel === 'string') pills.push({ label: 'Stage', value: `${meta.fromStepLabel} → ${meta.toStepLabel}` })
        if (typeof meta.reason === 'string' && meta.reason) pills.push({ label: 'Reason', value: String(meta.reason) })
    }
    if (meta.kind === 'asset') {
        if (typeof meta.assignedDate === 'string' && meta.assignedDate) pills.push({ label: 'Assigned', value: String(meta.assignedDate) })
        if (typeof meta.expectedReturnDate === 'string' && meta.expectedReturnDate) pills.push({ label: 'Due', value: String(meta.expectedReturnDate) })
        if (typeof meta.actualReturnDate === 'string' && meta.actualReturnDate) pills.push({ label: 'Returned', value: String(meta.actualReturnDate) })
    }
    if (meta.kind === 'payroll') {
        if (typeof meta.month === 'number' && typeof meta.year === 'number') {
            pills.push({ label: 'Period', value: `${String(meta.month).padStart(2, '0')}/${meta.year}` })
        }
    }
    if (meta.kind === 'profile' && meta.subKind === 'change-rejected' && typeof meta.reason === 'string' && meta.reason) {
        pills.push({ label: 'Reason', value: String(meta.reason) })
    }
    return pills
}

export interface ActivityRowProps {
    log: ActivityLog
    /** "hr" shows the actor name + IP; "self" shortens it for the employee portal. */
    viewer?: 'hr' | 'self'
}

export function ActivityRow({ log, viewer = 'hr' }: ActivityRowProps) {
    const [expanded, setExpanded] = React.useState(false)
    const changes = formatChangeEntries(log.changes)
    const visibleChanges = expanded ? changes : changes.slice(0, 3)
    const initials = (log.actorName ?? '?')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(n => n[0]?.toUpperCase() ?? '')
        .join('') || '?'
    const pills = metaPillsFor(log)

    return (
        <div className="px-4 py-3.5 hover:bg-muted/30 transition-colors">
            <div className="flex items-start gap-3">
                <div className="size-9 rounded-full bg-primary/10 text-primary text-[11px] font-semibold flex items-center justify-center shrink-0">
                    {initials}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0 flex-1">
                            {/* Headline already includes the actor name (or
                                "You" / "System") so we don't prepend an
                                actorLabel here anymore — that used to
                                double-print the name once buildActivityHeadline
                                was promoted to emit a full sentence. */}
                            <p className="text-sm leading-snug">
                                {buildActivityHeadline(log, changes.length, viewer)}
                            </p>
                            <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground flex-wrap">
                                <ActionBadge action={log.action} />
                                {viewer === 'hr' && log.actorRole && (
                                    <span className="capitalize">· {log.actorRole.replace(/_/g, ' ')}</span>
                                )}
                                {viewer === 'hr' && log.ipAddress && (
                                    <span className="font-mono text-[10px]">· {log.ipAddress}</span>
                                )}
                            </div>
                        </div>
                        <div className="text-right shrink-0">
                            <p className="text-[11px] text-muted-foreground tabular-nums">
                                {formatDateTime(log.createdAt)}
                            </p>
                        </div>
                    </div>

                    {changes.length > 0 && (
                        <div className="mt-2.5 rounded-lg bg-muted/30 border p-2.5 space-y-2">
                            {visibleChanges.map(c => (
                                <div key={c.key} className="grid grid-cols-[minmax(120px,180px)_1fr] gap-3 text-[12px] items-baseline">
                                    <span className="font-medium text-muted-foreground truncate">{c.label}</span>
                                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                                        <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 text-[11px] line-through break-all">
                                            {c.from}
                                        </span>
                                        <span className="text-muted-foreground shrink-0">→</span>
                                        <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[11px] font-medium break-all">
                                            {c.to}
                                        </span>
                                    </div>
                                </div>
                            ))}
                            {changes.length > 3 && (
                                <button
                                    type="button"
                                    onClick={() => setExpanded(v => !v)}
                                    className="text-[11px] text-primary hover:underline pt-0.5"
                                >
                                    {expanded ? 'Show less' : `Show ${changes.length - 3} more change${changes.length - 3 === 1 ? '' : 's'}`}
                                </button>
                            )}
                        </div>
                    )}
                    {pills.length > 0 && (
                        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                            {pills.map(p => (
                                <span key={p.label} className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-muted/60 text-foreground/80">
                                    <span className="text-muted-foreground">{p.label}:</span>
                                    <span className="font-medium">{p.value}</span>
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export interface ActivityFeedProps {
    logs: ActivityLog[]
    isLoading: boolean
    hasNextPage: boolean
    isFetchingNextPage: boolean
    fetchNextPage: () => void
    viewer?: 'hr' | 'self'
    emptyTitle?: string
    emptyDescription?: string
}

/**
 * Activity list + IntersectionObserver-driven infinite scroll. Owns its own
 * sentinel ref so callers can drop it into any container without wiring.
 */
export function ActivityFeed({
    logs,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    viewer = 'hr',
    emptyTitle = 'No activity yet',
    emptyDescription = 'Recent updates will appear here.',
}: ActivityFeedProps) {
    const sentinelRef = React.useRef<HTMLDivElement | null>(null)
    React.useEffect(() => {
        const el = sentinelRef.current
        if (!el) return
        const io = new IntersectionObserver((entries) => {
            if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
                fetchNextPage()
            }
        }, { rootMargin: '200px' })
        io.observe(el)
        return () => io.disconnect()
    }, [hasNextPage, isFetchingNextPage, fetchNextPage])

    if (isLoading) {
        return (
            <div className="p-4 space-y-2">
                {[1, 2, 3, 4, 5].map(i => (
                    <div key={`act-skel-${i}`} className="h-16 rounded bg-muted animate-pulse" />
                ))}
            </div>
        )
    }
    if (!logs.length) {
        return (
            <div className="text-center py-12 text-muted-foreground">
                <History className="size-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm font-medium">{emptyTitle}</p>
                <p className="text-xs mt-0.5">{emptyDescription}</p>
            </div>
        )
    }
    return (
        <div className="divide-y">
            {logs.map(log => <ActivityRow key={log.id} log={log} viewer={viewer} />)}
            <div ref={sentinelRef} className="h-6" />
            {isFetchingNextPage && (
                <div className="flex justify-center items-center gap-2 py-4 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" /> Loading more…
                </div>
            )}
            {!hasNextPage && logs.length >= 20 && (
                <div className="text-center py-3 text-[11px] text-muted-foreground/70">
                    End of activity
                </div>
            )}
        </div>
    )
}
