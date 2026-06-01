import { db } from '../../db/index.js'
import { orgUnits, gradeLevels, sponsoringEntities, employees } from '../../db/schema/index.js'
import { and, eq, inArray } from 'drizzle-orm'

/**
 * Reusable audit change-set helpers (the start of the centralized change engine).
 *
 * Two concerns live here so every module records changes consistently:
 *  1. resolveReferenceNames — turns foreign-key ID changes (division/branch/grade/
 *     manager/…) into human-readable from→to names, so those changes don't go dark
 *     in the audit trail (they were previously excluded to avoid raw UUIDs).
 *  2. maskAuditChanges — redacts sensitive identifiers (IBAN, account no., passport,
 *     Emirates ID, SWIFT) to a last-4 form before they are persisted in `changes`.
 */

export type AuditChanges = Record<string, { from: unknown; to: unknown }>

/** Fields whose values must never be stored verbatim in the audit trail. */
export const SENSITIVE_AUDIT_FIELDS = new Set([
    'iban', 'accountNumber', 'passportNo', 'emiratesId', 'swiftCode',
])

/** Redact a value to a `••••1234` last-4 form (or `••••` when too short). */
export function maskSensitiveValue(value: unknown): unknown {
    if (value === null || value === undefined || value === '') return value
    const s = String(value)
    return s.length <= 4 ? '••••' : `••••${s.slice(-4)}`
}

/** Mask any sensitive fields in a change-set in place; returns the same object. */
export function maskAuditChanges(changes: AuditChanges): AuditChanges {
    for (const key of Object.keys(changes)) {
        if (SENSITIVE_AUDIT_FIELDS.has(key)) {
            changes[key] = {
                from: maskSensitiveValue(changes[key].from),
                to: maskSensitiveValue(changes[key].to),
            }
        }
    }
    return changes
}

type RefSource = 'orgUnit' | 'grade' | 'sponsor' | 'employee'
interface RefSpec { idField: string; label: string; source: RefSource }

/**
 * Employee foreign-key fields that should be audited by their resolved NAME.
 * These were previously dropped from the diff because they render as raw UUIDs.
 */
const EMPLOYEE_REF_SPECS: RefSpec[] = [
    { idField: 'departmentId', label: 'department', source: 'orgUnit' },
    { idField: 'divisionId', label: 'division', source: 'orgUnit' },
    { idField: 'branchId', label: 'branch', source: 'orgUnit' },
    { idField: 'gradeLevelId', label: 'grade', source: 'grade' },
    { idField: 'sponsoringEntityId', label: 'sponsor', source: 'sponsor' },
    { idField: 'reportingTo', label: 'manager', source: 'employee' },
]

/**
 * For each employee FK field that changed between `before` and `after`, resolve
 * the old and new IDs to names and return readable `{ label: { from, to } }`
 * entries (e.g. `{ division: { from: 'Ops', to: 'Engineering' } }`). Tenant-scoped.
 */
export async function resolveReferenceNames(
    tenantId: string,
    before: Record<string, unknown> | null | undefined,
    after: Record<string, unknown> | null | undefined,
): Promise<AuditChanges> {
    const changed = EMPLOYEE_REF_SPECS.filter(
        s => (before?.[s.idField] ?? null) !== (after?.[s.idField] ?? null),
    )
    if (changed.length === 0) return {}

    const idsBySource: Record<RefSource, Set<string>> = {
        orgUnit: new Set(), grade: new Set(), sponsor: new Set(), employee: new Set(),
    }
    for (const s of changed) {
        for (const v of [before?.[s.idField], after?.[s.idField]]) {
            if (typeof v === 'string' && v) idsBySource[s.source].add(v)
        }
    }

    const nameMap = new Map<string, string>()
    // Resolve every source concurrently — at most one round-trip of latency.
    await Promise.all([
        idsBySource.orgUnit.size
            ? db.select({ id: orgUnits.id, name: orgUnits.name }).from(orgUnits)
                .where(and(eq(orgUnits.tenantId, tenantId), inArray(orgUnits.id, [...idsBySource.orgUnit])))
                .then(rows => rows.forEach(r => nameMap.set(r.id, r.name)))
            : null,
        idsBySource.grade.size
            ? db.select({ id: gradeLevels.id, name: gradeLevels.name }).from(gradeLevels)
                .where(and(eq(gradeLevels.tenantId, tenantId), inArray(gradeLevels.id, [...idsBySource.grade])))
                .then(rows => rows.forEach(r => nameMap.set(r.id, r.name)))
            : null,
        idsBySource.sponsor.size
            ? db.select({ id: sponsoringEntities.id, name: sponsoringEntities.name }).from(sponsoringEntities)
                .where(and(eq(sponsoringEntities.tenantId, tenantId), inArray(sponsoringEntities.id, [...idsBySource.sponsor])))
                .then(rows => rows.forEach(r => nameMap.set(r.id, r.name)))
            : null,
        idsBySource.employee.size
            ? db.select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName }).from(employees)
                .where(and(eq(employees.tenantId, tenantId), inArray(employees.id, [...idsBySource.employee])))
                .then(rows => rows.forEach(r => nameMap.set(r.id, `${r.firstName} ${r.lastName}`.trim())))
            : null,
    ])

    const out: AuditChanges = {}
    for (const s of changed) {
        const a = (before?.[s.idField] ?? null) as string | null
        const b = (after?.[s.idField] ?? null) as string | null
        out[s.label] = {
            from: a ? (nameMap.get(a) ?? null) : null,
            to: b ? (nameMap.get(b) ?? null) : null,
        }
    }
    return out
}
