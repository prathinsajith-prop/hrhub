/**
 * One-shot script: create a second demo tenant and add admin@hrhub.ae as super_admin.
 * Run: pnpm tsx src/db/seed-second-org.ts
 */
import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { db } from './index.js'
import { tenants, users, tenantMemberships } from './schema/index.js'

async function run() {
    const SECOND_LICENSE = 'DIFC-2022-99999'

    // Guard: skip if already exists
    const [existing] = await db.select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.tradeLicenseNo, SECOND_LICENSE))
        .limit(1)

    // Find admin@hrhub.ae user
    const [adminUser] = await db.select({ id: users.id, name: users.name })
        .from(users)
        .where(eq(users.email, 'admin@hrhub.ae'))
        .limit(1)

    if (!adminUser) {
        console.error('❌ Could not find admin@hrhub.ae — has the DB been seeded?')
        process.exit(1)
    }

    let tenant2Id: string

    if (existing) {
        console.log('ℹ️  Second org already exists, id:', existing.id)
        tenant2Id = existing.id
    } else {
        // Use only columns guaranteed to be in the DB (from 0000_init.sql)
        const [tenant2] = await db.insert(tenants).values({
            name: 'Noor Tech Solutions DIFC',
            tradeLicenseNo: SECOND_LICENSE,
            jurisdiction: 'freezone',
            industryType: 'technology',
            subscriptionPlan: 'starter',
            isActive: true,
        } as any).returning({ id: tenants.id, name: tenants.name })
        tenant2Id = tenant2.id
        console.log('✓ Created second tenant:', tenant2.name, '—', tenant2.id)
    }

    // Check if membership already exists
    const [existingMembership] = await db.select({ id: tenantMemberships.id })
        .from(tenantMemberships)
        .where(eq(tenantMemberships.userId, adminUser.id))
        .limit(1)

    // Find any membership for this specific tenant
    const allMemberships = await db.select({ id: tenantMemberships.id, tenantId: tenantMemberships.tenantId })
        .from(tenantMemberships)
        .where(eq(tenantMemberships.userId, adminUser.id))

    const alreadyMember = allMemberships.some(m => m.tenantId === tenant2Id)

    if (alreadyMember) {
        console.log('ℹ️  admin@hrhub.ae is already a member of the second org. All good!')
    } else {
        await db.insert(tenantMemberships).values({
            tenantId: tenant2Id,
            userId: adminUser.id,
            role: 'super_admin',
            inviteStatus: 'accepted',
            isActive: true,
            acceptedAt: new Date(),
        })
        console.log('✓ Added admin@hrhub.ae as super_admin to Noor Tech Solutions DIFC')
    }

    console.log('\n✅ Done! Log in as admin@hrhub.ae — you should now see org switcher.')
    process.exit(0)
}

run().catch(err => { console.error(err); process.exit(1) })
