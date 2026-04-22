import { TOTP, generateSecret } from 'otplib'
import QRCode from 'qrcode'
import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { users } from '../../db/schema/index.js'

const APP_NAME = 'HRHub'
const totp = new TOTP()

/**
 * Generate a new TOTP secret and return the secret + otpauth URI for QR code.
 * Does NOT persist — call enableTotp after user verifies.
 */
export async function setupTotp(userId: string): Promise<{ secret: string; otpauthUrl: string; qrDataUrl: string }> {
    const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1)
    if (!user) throw new Error('User not found')

    const secret = generateSecret()
    const otpauthUrl = totp.toURI({ label: user.email, issuer: APP_NAME, secret })
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl)

    // Store secret temporarily (unconfirmed) — same column, twoFaEnabled stays false
    await db.update(users)
        .set({ totpSecret: secret, updatedAt: new Date() })
        .where(eq(users.id, userId))

    return { secret, otpauthUrl, qrDataUrl }
}

/**
 * Verify the TOTP token and enable 2FA for the user.
 */
export async function verifyAndEnableTotp(userId: string, token: string): Promise<boolean> {
    const [user] = await db
        .select({ totpSecret: users.totpSecret })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

    if (!user?.totpSecret) return false

    const isValid = totp.verify({ token, secret: user.totpSecret })
    if (!isValid) return false

    await db.update(users)
        .set({ twoFaEnabled: true, updatedAt: new Date() })
        .where(eq(users.id, userId))

    return true
}

/**
 * Disable 2FA after verifying the current token.
 */
export async function disableTotp(userId: string, token: string): Promise<boolean> {
    const [user] = await db
        .select({ totpSecret: users.totpSecret, twoFaEnabled: users.twoFaEnabled })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

    if (!user?.totpSecret || !user.twoFaEnabled) return false

    const isValid = totp.verify({ token, secret: user.totpSecret })
    if (!isValid) return false

    await db.update(users)
        .set({ twoFaEnabled: false, totpSecret: null, updatedAt: new Date() })
        .where(eq(users.id, userId))

    return true
}

/**
 * Get current 2FA status for user.
 */
export async function getTotpStatus(userId: string): Promise<{ enabled: boolean }> {
    const [user] = await db
        .select({ twoFaEnabled: users.twoFaEnabled })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

    return { enabled: user?.twoFaEnabled ?? false }
}
