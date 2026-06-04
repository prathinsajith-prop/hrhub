/**
 * At-rest field encryption for sensitive free-text (e.g. confidential complaint
 * descriptions). AES-256-GCM with a per-value random IV. Output is a versioned,
 * self-describing string so decryption is backward-compatible:
 *
 *   enc:v1:<ivB64>:<tagB64>:<cipherB64>
 *
 * Anything that does NOT start with `enc:v1:` is treated as legacy plaintext and
 * returned as-is — so existing rows keep working and migration is lazy (values
 * get encrypted the next time they're written).
 *
 * Key source: FIELD_ENCRYPTION_KEY if set, else derived from JWT_SECRET via
 * scrypt. Set a dedicated FIELD_ENCRYPTION_KEY in production so rotating the JWT
 * secret never makes stored data unreadable.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { loadEnv } from '../config/env.js'

const PREFIX = 'enc:v1:'
let cachedKey: Buffer | null = null

function key(): Buffer {
    if (cachedKey) return cachedKey
    const env = loadEnv()
    const material = env.FIELD_ENCRYPTION_KEY || env.JWT_SECRET
    // Deterministic 32-byte key. Fixed salt is acceptable here: the secret is
    // already high-entropy and we need stable derivation across restarts.
    cachedKey = scryptSync(material, 'hrhub-field-enc-v1', 32)
    return cachedKey
}

/** Encrypt a string for storage. Empty/nullish input is returned unchanged. */
export function encryptField(plaintext: string | null | undefined): string | null {
    if (plaintext == null || plaintext === '') return plaintext ?? null
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key(), iv)
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`
}

/** Decrypt a stored value. Legacy plaintext (no prefix) is returned as-is. */
export function decryptField(stored: string | null | undefined): string | null {
    if (stored == null) return null
    if (!stored.startsWith(PREFIX)) return stored // legacy plaintext
    try {
        const [, , ivB64, tagB64, ctB64] = stored.split(':')
        const iv = Buffer.from(ivB64, 'base64')
        const tag = Buffer.from(tagB64, 'base64')
        const ct = Buffer.from(ctB64, 'base64')
        const decipher = createDecipheriv('aes-256-gcm', key(), iv)
        decipher.setAuthTag(tag)
        return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
    } catch {
        // Wrong key / corrupted value — never throw into a request path.
        return '[unable to decrypt]'
    }
}
