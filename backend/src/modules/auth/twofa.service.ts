import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib'
import QRCode from 'qrcode'
import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { users } from '../../db/schema/index.js'

const APP_NAME = 'HRHub'
const totp = new TOTP({ crypto: new NobleCryptoPlugin(), base32: new ScureBase32Plugin() })

export async function setupTotp(userId: string): Promise<{ secret: string; otpauthUrl: string; qrDataUrl: string }> {
    const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1)
    if (!user) throw new Error('User not found')

    const secret = totp.generateSecret()
    const otpauthUrl = totp.toURI({ label: user.email, issuer: APP_NAME, secret })
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl)

    await db.update(users).set({ totpSecret: secret, updatedAt: new Date() }).where(eq(users.id, userId))
    return { secret, otpauthUrl, qrDataUrl }
}

export async function verifyAndEnableTotp(userId: string, token: string): Promise<boolean> {
    const [user] = await db.select({ totpSecret: users.totpSecret }).from(users).where(eq(users.id, userId)).limit(1)
    if (!user?.totpSecret) return false
    const isValid = await totp.verify(token, { secret: user.totpSecret })
    if (!isValid) return false
    await db.update(users).set({ twoFaEnabled: true, updatedAt: new Date() }).where(eq(users.id, userId))
    return true
}

export async function disableTotp(userId: string, token: string): Promise<boolean> {
    const [user] = await db.select({ totpSecret: users.totpSecret, twoFaEnabled: users.twoFaEnabled }).from(users).where(eq(users.id, userId)).limit(1)
    if (!user?.totpSecret || !user.twoFaEnabled) return false
    const isValid = await totp.verify(token, { secret: user.totpSecret })
    if (!isValid) return false
    await db.update(users).set({ twoFaEnabled: false, totpSecret: null, updatedAt: new Date() }).where(eq(users.id, userId))
    return true
}

export async function getTotpStatus(userId: string): Promise<{ enabled: boolean }> {
    const [user] = await db.select({ twoFaEnabled: users.twoFaEnabled }).from(users).where(eq(users.id, userId)).limit(1)
    return { enabled: user?.twoFaEnabled ?? false }
}

/** Verify a TOTP code for a user without changing any DB state. */
export async function verifyTotpCode(userId: string, token: string): Promise<boolean> {
    const [user] = await db.select({ totpSecret: users.totpSecret, twoFaEnabled: users.twoFaEnabled }).from(users).where(eq(users.id, userId)).limit(1)
    if (!user?.totpSecret || !user.twoFaEnabled) return false
    const result = await totp.verify(token, { secret: user.totpSecret })
    return !!result
}
