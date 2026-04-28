import { describe, it, expect } from 'vitest'

// The IP allowlist client-side validator must accept both bare IPs and CIDR ranges.
// A previous regression had spaces inside `{1, 3}` quantifiers, which made the regex
// match nothing in JS — every Add-IP attempt was rejected. Keep this in sync with
// the regex used in `frontend/src/pages/settings/SettingsPage.tsx :: IpAllowlistCard`.
const isValidCidr = (val: string) => /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(val.trim())

describe('IP allowlist CIDR validator', () => {
    it.each([
        '192.168.1.1',
        '10.0.0.0/8',
        '192.168.1.0/24',
        '255.255.255.255/32',
        '0.0.0.0/0',
        '  127.0.0.1  ',
    ])('accepts %s', (input) => {
        expect(isValidCidr(input)).toBe(true)
    })

    it.each([
        '',
        'not-an-ip',
        '192.168.1',
        '192.168.1.1.1',
        '192.168.1.1/',
        '192.168.1.1/abc',
        'fe80::1',
    ])('rejects %s', (input) => {
        expect(isValidCidr(input)).toBe(false)
    })
})
