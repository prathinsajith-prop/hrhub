import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib'
import QRCode from 'qrcode'
import bcrypt from 'bcrypt'
import crypto from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { users } from '../../db/schema/index.js'

const APP_NAME = 'HRHub'
const totp = new TOTP({ crypto: new NobleCryptoPlugin(), base32: new ScureBase32Plugin() })

const BACKUP_CODE_COUNT = 10
const BACKUP_CODE_BYTES = 5 // 10 hex chars → formatted as XXXXX-XXXXX

/** Generate `count` cryptographically random codes formatted XXXXX-XXXXX. */
function generateRandomCodes(count = BACKUP_CODE_COUNT): string[] {
    const codes: string[] = []
    for (let i = 0; i < count; i++) {
        const hex = crypto.randomBytes(BACKUP_CODE_BYTES).toString('hex').toUpperCase()
        codes.push(`${hex.slice(0, 5)}-${hex.slice(5, 10)}`)
    }
    return codes
}

/** Normalise user input — strip whitespace and dashes, uppercase. */
function normaliseCode(input: string): string {
    return input.replace(/[\s-]+/g, '').toUpperCase()
}

/** Hash + store new backup codes for a user. Returns plaintext codes (shown ONCE). */
async function issueBackupCodes(userId: string): Promise<string[]> {
    const plain = generateRandomCodes()
    const hashed = await Promise.all(plain.map((c) => bcrypt.hash(normaliseCode(c), 10)))
    await db.update(users).set({ twoFaBackupCodes: hashed, updatedAt: new Date() }).where(eq(users.id, userId))
    return plain
}

export async function setupTotp(userId: string): Promise<{ secret: string; otpauthUrl: string; qrDataUrl: string }> {
    const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1)
    if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 })

    const secret = totp.generateSecret()
    const otpauthUrl = totp.toURI({ label: user.email, issuer: APP_NAME, secret })
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl)

    await db.update(users).set({ totpSecret: secret, updatedAt: new Date() }).where(eq(users.id, userId))
    return { secret, otpauthUrl, qrDataUrl }
}

export async function verifyAndEnableTotp(userId: string, token: string): Promise<{ enabled: boolean; backupCodes?: string[] }> {
    const [user] = await db.select({ totpSecret: users.totpSecret }).from(users).where(eq(users.id, userId)).limit(1)
    if (!user?.totpSecret) return { enabled: false }
    const isValid = await totp.verify(token, { secret: user.totpSecret })
    if (!isValid) return { enabled: false }
    await db.update(users).set({ twoFaEnabled: true, updatedAt: new Date() }).where(eq(users.id, userId))
    // Auto-issue a fresh set of backup codes when 2FA is first enabled
    const backupCodes = await issueBackupCodes(userId)
    return { enabled: true, backupCodes }
}

export async function disableTotp(userId: string, token: string): Promise<boolean> {
    const [user] = await db.select({ totpSecret: users.totpSecret, twoFaEnabled: users.twoFaEnabled }).from(users).where(eq(users.id, userId)).limit(1)
    if (!user?.totpSecret || !user.twoFaEnabled) return false
    const isValid = await totp.verify(token, { secret: user.totpSecret })
    if (!isValid) return false
    await db.update(users).set({
        twoFaEnabled: false,
        totpSecret: null,
        twoFaBackupCodes: [],
        updatedAt: new Date(),
    }).where(eq(users.id, userId))
    return true
}

export async function getTotpStatus(userId: string): Promise<{ enabled: boolean; backupCodesRemaining: number }> {
    const [user] = await db.select({
        twoFaEnabled: users.twoFaEnabled,
        twoFaBackupCodes: users.twoFaBackupCodes,
    }).from(users).where(eq(users.id, userId)).limit(1)
    return {
        enabled: user?.twoFaEnabled ?? false,
        backupCodesRemaining: user?.twoFaBackupCodes?.length ?? 0,
    }
}

/** Verify a TOTP code for a user without changing any DB state. */
export async function verifyTotpCode(userId: string, token: string): Promise<boolean> {
    const [user] = await db.select({ totpSecret: users.totpSecret, twoFaEnabled: users.twoFaEnabled }).from(users).where(eq(users.id, userId)).limit(1)
    if (!user?.totpSecret || !user.twoFaEnabled) return false
    const result = await totp.verify(token, { secret: user.totpSecret })
    return !!result
}

/**
 * Verify a single-use backup recovery code. On success, removes the matched hash
 * from storage so it cannot be reused. Returns true when accepted.
 */
export async function verifyAndConsumeBackupCode(userId: string, code: string): Promise<boolean> {
    const normalised = normaliseCode(code)
    if (normalised.length < 8) return false
    const [user] = await db.select({
        twoFaEnabled: users.twoFaEnabled,
        twoFaBackupCodes: users.twoFaBackupCodes,
    }).from(users).where(eq(users.id, userId)).limit(1)
    if (!user?.twoFaEnabled) return false
    const hashes = user.twoFaBackupCodes ?? []
    if (hashes.length === 0) return false

    let matchIndex = -1
    for (let i = 0; i < hashes.length; i++) {
        // bcrypt.compare is constant-time relative to a single hash; iterating is acceptable for ≤10 codes
        // eslint-disable-next-line no-await-in-loop
        if (await bcrypt.compare(normalised, hashes[i])) { matchIndex = i; break }
    }
    if (matchIndex === -1) return false

    const remaining = hashes.filter((_, i) => i !== matchIndex)
    await db.update(users).set({ twoFaBackupCodes: remaining, updatedAt: new Date() }).where(eq(users.id, userId))
    return true
}

/**
 * Regenerate backup codes (invalidates all previous ones). Requires a valid TOTP
 * code as proof of identity. Returns the new plaintext codes (shown once) or null.
 */
export async function regenerateBackupCodes(userId: string, totpCode: string): Promise<string[] | null> {
    const ok = await verifyTotpCode(userId, totpCode)
    if (!ok) return null
    return issueBackupCodes(userId)
}

