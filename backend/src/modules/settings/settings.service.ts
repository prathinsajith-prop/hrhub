import { eq, and, ne } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { tenants, users } from '../../db/schema/index.js'

export async function getCompanySettings(tenantId: string) {
    const [tenant] = await db
        .select({
            id: tenants.id,
            name: tenants.name,
            tradeLicenseNo: tenants.tradeLicenseNo,
            jurisdiction: tenants.jurisdiction,
            industryType: tenants.industryType,
            subscriptionPlan: tenants.subscriptionPlan,
            logoUrl: tenants.logoUrl,
        })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1)

    return tenant ?? null
}

export async function updateCompanySettings(
    tenantId: string,
    data: Partial<{
        name: string
        tradeLicenseNo: string
        jurisdiction: 'mainland' | 'freezone'
        industryType: string
        logoUrl: string
    }>,
) {
    const [updated] = await db
        .update(tenants)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(tenants.id, tenantId))
        .returning({
            id: tenants.id,
            name: tenants.name,
            tradeLicenseNo: tenants.tradeLicenseNo,
            jurisdiction: tenants.jurisdiction,
            industryType: tenants.industryType,
            subscriptionPlan: tenants.subscriptionPlan,
            logoUrl: tenants.logoUrl,
        })

    return updated ?? null
}

export async function listTenantUsers(tenantId: string) {
    const rows = await db
        .select({
            id: users.id,
            name: users.name,
            email: users.email,
            role: users.role,
            department: users.department,
            isActive: users.isActive,
            lastLoginAt: users.lastLoginAt,
            createdAt: users.createdAt,
        })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), ne(users.role, 'employee')))
        .orderBy(users.createdAt)

    return rows
}
