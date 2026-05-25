// ─── Default shift seed for new tenants ─────────────────────────────────────
//
// Every freshly-created tenant gets a "General" shift (09:00 → 18:00,
// Fri/Sat weekend) so that:
//   • the portal's check-in band has something sensible to render before HR
//     has done any setup, and
//   • employees can be created and assigned a shift on day 1 without HR
//     having to visit Org Settings first.
//
// HR can edit / rename / delete this entry from Org Settings → Shifts later.

import type { shifts } from '../../db/schema/shifts.js'

type ShiftInsert = typeof shifts.$inferInsert

export function buildDefaultShiftRow(tenantId: string): ShiftInsert {
    return {
        tenantId,
        name: 'General',
        color: '#3b82f6',
        startTime: '09:00',
        endTime: '18:00',
        // UAE convention — Friday/Saturday weekend. Tenants on a Sat/Sun
        // weekend (mostly multinationals) can edit this from settings.
        weeklyOffDays: ['friday', 'saturday'],
        isActive: true,
        sortOrder: 0,
    }
}
