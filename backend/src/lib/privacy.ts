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
 * Process-wide TTL cache for the tenant Privacy Policy.
 *
 * The policy is read on every employee list / detail request for peer
 * viewers. It changes only when HR toggles a switch on Org Settings →
 * Organization Policy, so a short TTL is safe and skips ~99% of the DB
 * round-trips on a tenant under load.
 *
 * Stale-after-write: `invalidatePrivacyPolicyCache(tenantId)` is called from
 * the PATCH /settings/org-policy handler so HR sees their changes
 * immediately. The 60-second TTL is a backstop in case a write skips that
 * call (cross-process update, replica lag, etc.).
 */
const POLICY_CACHE_TTL_MS = 60_000
interface CachedPolicy { policy: PrivacyPolicy; expiresAt: number }
const policyCache = new Map<string, CachedPolicy>()

export function invalidatePrivacyPolicyCache(tenantId: string): void {
    policyCache.delete(tenantId)
}

export async function loadPrivacyPolicy(tenantId: string, cache?: Map<string, PrivacyPolicy>): Promise<PrivacyPolicy> {
    // Caller-supplied per-request cache wins (e.g. batch operations within
    // one handler can pre-populate). Falls through to the process cache.
    const requestCached = cache?.get(tenantId)
    if (requestCached) return requestCached

    const now = Date.now()
    const processCached = policyCache.get(tenantId)
    if (processCached && processCached.expiresAt > now) {
        cache?.set(tenantId, processCached.policy)
        return processCached.policy
    }

    const [row] = await db
        .select({ privacyPolicy: tenants.privacyPolicy })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1)
    const policy: PrivacyPolicy = { ...DEFAULT_PRIVACY_POLICY, ...(row?.privacyPolicy ?? {}) }
    policyCache.set(tenantId, { policy, expiresAt: now + POLICY_CACHE_TTL_MS })
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
 * place. Two layers:
 *
 *   1. Feature flag (applies to EVERYONE, including HR): when the org policy
 *      toggle is OFF, the field is hidden regardless of viewer. HR has
 *      explicitly turned off the feature for the whole tenant — there's no
 *      "but I'm HR so I can still see it" override.
 *
 *   2. Self-control (applies to PEERS only): when the org policy is ON but
 *      the individual employee has overridden their setting to off, the
 *      field is hidden for peers only. HR and self-view still see it.
 *
 * Fields touched (kept in one place so the policy schema and the mask stay
 * in sync):
 *   - dateOfBirth                                                   → showBirthday
 *   - joinDate (rounded to year so tenure aggregations still work)  → showWorkAnniversary
 *   - mobileNo, emergencyContact, emergencyContactPhone             → showMobile
 *     (same trust boundary; if you can't see the personal mobile you don't
 *     get the emergency contact either)
 */
export function maskEmployeeForViewer<T extends {
    id: string
    dateOfBirth?: string | Date | null
    joinDate?: string | Date | null
    mobileNo?: string | null
    emergencyContact?: string | null
    emergencyContactPhone?: string | null
    privacyOverrides?: PrivacyOverrides | null
} | Record<string, unknown>>(row: T, policy: PrivacyPolicy, isPeer: boolean): T {
    const overrides = (row as { privacyOverrides?: PrivacyOverrides | null }).privacyOverrides ?? {}
    // shouldHide combines feature-flag (org policy off) AND peer-only opt-out:
    //   - feature off              → hide for everyone
    //   - feature on, peer opt-out → hide for peers
    const shouldHide = (key: keyof PrivacyPolicy): boolean =>
        !policy[key] || (isPeer && overrides[key] === false)

    if (shouldHide('showBirthday')) (row as Record<string, unknown>).dateOfBirth = null
    if (shouldHide('showMobile')) {
        (row as Record<string, unknown>).mobileNo = null
        ;(row as Record<string, unknown>).emergencyContact = null
        ;(row as Record<string, unknown>).emergencyContactPhone = null
    }
    if (shouldHide('showWorkAnniversary') && (row as { joinDate?: string | Date | null }).joinDate) {
        const raw = (row as { joinDate: string | Date }).joinDate
        const year = typeof raw === 'string' ? raw.slice(0, 4) : new Date(raw).getUTCFullYear().toString()
        if (year && /^\d{4}$/.test(year)) (row as Record<string, unknown>).joinDate = `${year}-01-01`
    }
    return row
}

/**
 * @deprecated Use `maskEmployeeForViewer(row, policy, true)` instead. Kept
 * as a thin shim for call sites that haven't migrated.
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
    return maskEmployeeForViewer(row, policy, true)
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
