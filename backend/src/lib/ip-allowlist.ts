// ─── IPv4 allowlist matching ──────────────────────────────────────────────────
//
// Shared by:
//   • plugins/authenticate.ts — tenant-level IP allowlist (Org Settings →
//     Security). Empty list = no restriction; non-empty = requests must
//     originate from a listed IP/CIDR.
//   • modules/attendance/external-auth.ts — per-app allowlist for Connected-App
//     (biometric vendor) credentials.
//
// Entries are validated on write (settings PUT) with `^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$`,
// i.e. plain IPv4 or IPv4/CIDR with any prefix length — so the matcher here
// supports arbitrary prefixes, not just /16 and /24. Malformed entries (or a
// caller IP we can't parse) never match: the check fails CLOSED.

/** Parse a dotted-quad IPv4 into a 32-bit unsigned int; null if malformed. */
export function ipv4ToInt(ip: string): number | null {
    const parts = ip.split('.')
    if (parts.length !== 4) return null
    let out = 0
    for (const part of parts) {
        if (!/^\d{1,3}$/.test(part)) return null
        const n = Number(part)
        if (n > 255) return null
        out = (out << 8) | n
    }
    return out >>> 0
}

/**
 * Normalise a Fastify `request.ip` for IPv4 matching. Node reports
 * IPv4-mapped IPv6 addresses as `::ffff:1.2.3.4` — strip the prefix so they
 * compare equal to their dotted-quad form. Pure IPv6 addresses return as-is
 * (they won't parse as IPv4 and therefore won't match an IPv4 allowlist).
 */
export function normalizeIp(ip: string): string {
    const lower = ip.trim().toLowerCase()
    return lower.startsWith('::ffff:') ? lower.slice(7) : lower
}

/** True when `ip` matches `entry` — exact IPv4 or IPv4/CIDR (any prefix 0–32). */
export function ipMatchesEntry(ip: string, entry: string): boolean {
    const trimmed = entry.trim()
    const slash = trimmed.indexOf('/')
    const ipInt = ipv4ToInt(ip)
    if (ipInt === null) return false

    if (slash === -1) {
        const entryInt = ipv4ToInt(trimmed)
        return entryInt !== null && entryInt === ipInt
    }

    const baseInt = ipv4ToInt(trimmed.slice(0, slash))
    const prefix = Number(trimmed.slice(slash + 1))
    if (baseInt === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false
    if (prefix === 0) return true
    const mask = prefix === 32 ? 0xffffffff : (~((1 << (32 - prefix)) - 1)) >>> 0
    return (ipInt & mask) >>> 0 === (baseInt & mask) >>> 0
}

/**
 * True when `ip` is allowed by the list. An EMPTY list means "no restriction"
 * (allow). A non-empty list allows only matching IPs — an unparsable caller
 * IP is rejected (fail closed).
 */
export function ipInAllowlist(ip: string, allowlist: readonly string[]): boolean {
    if (!allowlist || allowlist.length === 0) return true
    const normalized = normalizeIp(ip)
    return allowlist.some((entry) => ipMatchesEntry(normalized, entry))
}
