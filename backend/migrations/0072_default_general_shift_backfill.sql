-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0072 — Default "General" shift backfill
--
-- Going forward, registerTenant() and addNewTenant() both seed a default
-- 09:00–18:00 "General" shift on tenant creation (see
-- backend/src/modules/shifts/shifts.defaults.ts). This migration back-fills
-- the same row for every existing tenant that currently has zero shifts
-- defined — so the portal's attendance band has a sensible default for
-- all orgs without HR having to visit Org Settings → Shifts.
--
-- Idempotent: the NOT EXISTS guard skips any tenant that already has at
-- least one shift configured.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO shifts (
    tenant_id,
    name,
    color,
    start_time,
    end_time,
    weekly_off_days,
    is_active,
    sort_order
)
SELECT
    t.id,
    'General',
    '#3b82f6',
    '09:00',
    '18:00',
    ARRAY['friday', 'saturday']::text[],
    true,
    0
FROM tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM shifts s WHERE s.tenant_id = t.id
);
