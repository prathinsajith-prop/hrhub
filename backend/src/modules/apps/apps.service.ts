import crypto from 'node:crypto'
import bcrypt from 'bcrypt'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { connectedApps } from '../../db/schema/index.js'

const BCRYPT_ROUNDS = 12

function http(message: string, statusCode: number): Error {
    return Object.assign(new Error(message), { statusCode })
}

function generateAppKey(): string {
    return `app_live_${crypto.randomBytes(12).toString('hex')}`
}

function generateAppSecret(): string {
    return `sk_${crypto.randomBytes(24).toString('hex')}`
}

function publicShape(row: any) {
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        appKey: row.appKey,
        scopes: row.scopes,
        ipAllowlist: row.ipAllowlist,
        status: row.status,
        lastUsedAt: row.lastUsedAt,
        requestCount: row.requestCount,
        revokedAt: row.revokedAt,
        createdBy: row.createdBy,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    }
}

export async function listApps(tenantId: string) {
    const rows = await db.select().from(connectedApps)
        .where(eq(connectedApps.tenantId, tenantId))
        .orderBy(desc(connectedApps.createdAt))
    return rows.map(publicShape)
}

export async function createApp(opts: {
    tenantId: string
    actorUserId: string
    name: string
    description?: string
    scopes?: string[]
    ipAllowlist?: string[]
}) {
    if (!opts.name?.trim()) throw http('name is required', 400)
    const appKey = generateAppKey()
    const secret = generateAppSecret()
    const secretHash = await bcrypt.hash(secret, BCRYPT_ROUNDS)

    const [row] = await db.insert(connectedApps).values({
        tenantId: opts.tenantId,
        name: opts.name.trim(),
        description: opts.description ?? null,
        appKey,
        secretHash,
        scopes: opts.scopes ?? [],
        ipAllowlist: opts.ipAllowlist ?? [],
        status: 'active',
        createdBy: opts.actorUserId,
    }).returning()

    // Plain secret returned ONCE.
    return { app: publicShape(row), appSecret: secret }
}

export async function updateApp(opts: {
    tenantId: string
    appId: string
    patch: { name?: string; description?: string; scopes?: string[]; ipAllowlist?: string[]; status?: 'active' | 'revoked' }
}) {
    const [existing] = await db.select().from(connectedApps)
        .where(and(eq(connectedApps.id, opts.appId), eq(connectedApps.tenantId, opts.tenantId)))
        .limit(1)
    if (!existing) throw http('App not found', 404)

    const update: Record<string, any> = { updatedAt: new Date() }
    if (opts.patch.name !== undefined) update.name = opts.patch.name
    if (opts.patch.description !== undefined) update.description = opts.patch.description
    if (opts.patch.scopes !== undefined) update.scopes = opts.patch.scopes
    if (opts.patch.ipAllowlist !== undefined) update.ipAllowlist = opts.patch.ipAllowlist
    if (opts.patch.status !== undefined) {
        update.status = opts.patch.status
        update.revokedAt = opts.patch.status === 'revoked' ? new Date() : null
    }

    const [row] = await db.update(connectedApps)
        .set(update)
        .where(eq(connectedApps.id, opts.appId))
        .returning()
    return publicShape(row)
}

export async function regenerateAppSecret(tenantId: string, appId: string) {
    const [existing] = await db.select().from(connectedApps)
        .where(and(eq(connectedApps.id, appId), eq(connectedApps.tenantId, tenantId)))
        .limit(1)
    if (!existing) throw http('App not found', 404)

    const secret = generateAppSecret()
    const secretHash = await bcrypt.hash(secret, BCRYPT_ROUNDS)
    const [row] = await db.update(connectedApps)
        .set({ secretHash, updatedAt: new Date() })
        .where(eq(connectedApps.id, appId))
        .returning()
    return { app: publicShape(row), appSecret: secret }
}

export async function getApp(tenantId: string, appId: string) {
    // Accept either a UUID (id) or an appKey (app_live_xxx)
    const isAppKey = appId.startsWith('app_')
    const whereClause = isAppKey
        ? and(eq(connectedApps.appKey, appId), eq(connectedApps.tenantId, tenantId))
        : and(eq(connectedApps.id, appId), eq(connectedApps.tenantId, tenantId))
    const [row] = await db.select().from(connectedApps).where(whereClause).limit(1)
    if (!row) throw http('App not found', 404)
    return publicShape(row)
}

export async function deleteApp(tenantId: string, appId: string) {
    const [existing] = await db.select().from(connectedApps)
        .where(and(eq(connectedApps.id, appId), eq(connectedApps.tenantId, tenantId)))
        .limit(1)
    if (!existing) throw http('App not found', 404)
    await db.delete(connectedApps).where(eq(connectedApps.id, appId))
    return { ok: true }
}
