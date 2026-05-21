/**
 * Privacy helpers — applies the tenant Organization Policy + per-employee
 * overrides when serialising employee records to peers.
 *
 * Rules of the road:
 *   1. HR roles (`hr_manager`, `super_admin`, `pro_officer`, `dept_head`) see
 *      everything. Privacy is a peer-to-peer concern, not a compliance hide
 *      from HR.
 *   2. An employee always sees their OWN record in full.
 *   3. For every other viewer, each sensitive field is hidden when the org
 *      default is OFF, OR when the target employee has explicitly opted out
 *      via their privacy_overrides jsonb. The override can only RESTRICT
 *      further (employee can't show what the org has hidden).
 *
 * Adding a new field? Three edits:
 *   - extend `PrivacyPolicy` + `PrivacyOverrides`
 *   - extend `SENSITIVE_FIELDS` (db column → policy key)
 *   - update the schema defaults in `tenants` / `employees`
 */
import { db } from '../db/index.js'
import { tenants } from '../db/schema/index.js'
import { eq } from 'drizzle-orm'

export interface PrivacyPolicy {
    showBirthday: boolean
    showWorkAnniversary: boolean
    showMobile: boolean
    searchableInDirectory: boolean
}

export type PrivacyOverrides = Partial<PrivacyPolicy>

/** Fallback used when the tenant row is missing the column or fails to load. */
export const DEFAULT_PRIVACY_POLICY: PrivacyPolicy = {
    showBirthday: true,
    showWorkAnniversary: true,
    showMobile: true,
    searchableInDirectory: true,
}

const HR_ROLES = new Set(['hr_manager', 'super_admin', 'pro_officer', 'dept_head'])

/** Roles that bypass the privacy mask entirely. */
export function viewerCanBypassPrivacy(role: string | undefined): boolean {
    return !!role && HR_ROLES.has(role)
}

/**
 * Tenant policy lookup. Caches in-process for the lifetime of the request
 * via a Map keyed by tenantId — callers pass a shared map when they're
 * applying the mask to many rows from the same tenant.
 */
export async function loadPrivacyPolicy(tenantId: string, cache?: Map<string, PrivacyPolicy>): Promise<PrivacyPolicy> {
    const cached = cache?.get(tenantId)
    if (cached) return cached
    const [row] = await db
        .select({ privacyPolicy: tenants.privacyPolicy })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1)
    const policy: PrivacyPolicy = { ...DEFAULT_PRIVACY_POLICY, ...(row?.privacyPolicy ?? {}) }
    cache?.set(tenantId, policy)
    return policy
}

/** Combined effective visibility for a single (target, viewer) pair. */
export function effectiveVisibility(policy: PrivacyPolicy, overrides: PrivacyOverrides | null | undefined): PrivacyPolicy {
    const o = overrides ?? {}
    return {
        showBirthday: policy.showBirthday && o.showBirthday !== false,
        showWorkAnniversary: policy.showWorkAnniversary && o.showWorkAnniversary !== false,
        showMobile: policy.showMobile && o.showMobile !== false,
        searchableInDirectory: policy.searchableInDirectory && o.searchableInDirectory !== false,
    }
}

/**
 * Mutating mask — redacts sensitive fields on an employee-shaped object in
 * place when the viewer is a peer and the target has opted out. Returns the
 * same object for chaining.
 *
 * Fields touched (kept in one place so the policy schema and the mask stay
 * in sync):
 *   - dateOfBirth  → policy.showBirthday
 *   - joinDate     → policy.showWorkAnniversary  (the date itself isn't
 *                    secret, but a hidden anniversary implies a hidden join
 *                    date — peers can still see tenure aggregations)
 *   - mobileNo     → policy.showMobile
 *   - emergencyContact / emergencyContactPhone → always policy.showMobile
 *     (same trust boundary; if you can't see the personal mobile you don't
 *     get the emergency contact either)
 */
export function maskEmployeeForPeer<T extends {
    id: string
    dateOfBirth?: string | Date | null
    joinDate?: string | Date | null
    mobileNo?: string | null
    emergencyContact?: string | null
    emergencyContactPhone?: string | null
    privacyOverrides?: PrivacyOverrides | null
} | Record<string, unknown>>(row: T, policy: PrivacyPolicy): T {
    const overrides = (row as { privacyOverrides?: PrivacyOverrides | null }).privacyOverrides ?? {}
    const vis = effectiveVisibility(policy, overrides)
    if (!vis.showBirthday) (row as Record<string, unknown>).dateOfBirth = null
    if (!vis.showMobile) {
        (row as Record<string, unknown>).mobileNo = null
        ;(row as Record<string, unknown>).emergencyContact = null
        ;(row as Record<string, unknown>).emergencyContactPhone = null
    }
    // joinDate is the anchor for anniversary calculations. Hide the day but
    // leave the year so peers can still see "2024-01-01" → tenure of ~1 yr.
    // Simplest implementation: round to the first of the year.
    if (!vis.showWorkAnniversary && (row as { joinDate?: string | Date | null }).joinDate) {
        const raw = (row as { joinDate: string | Date }).joinDate
        const year = typeof raw === 'string' ? raw.slice(0, 4) : new Date(raw).getUTCFullYear().toString()
        if (year && /^\d{4}$/.test(year)) (row as Record<string, unknown>).joinDate = `${year}-01-01`
    }
    return row
}

/**
 * Decide whether to skip the mask for a given viewer-target pair.
 * Returns true when masking should be APPLIED, false when it should be
 * bypassed (HR roles, or viewer is the target themselves).
 */
export function shouldMask(viewerRole: string | undefined, viewerEmployeeId: string | undefined, targetEmployeeId: string): boolean {
    if (viewerCanBypassPrivacy(viewerRole)) return false
    if (viewerEmployeeId && viewerEmployeeId === targetEmployeeId) return false
    return true
}
