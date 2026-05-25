-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0068 — Offboarding settings singleton backfill
--
-- Migration 0065 created the offboarding_flow_settings table with a UNIQUE
-- (tenant_id) constraint but did not insert the singleton row for tenants
-- that existed at migration time. The runtime lazy-seed in
-- offboardingFlow/offboarding.service.ts:getSettings() created the row on
-- first GET, but only one tenant has actually visited the page so far —
-- the other eleven still have no row, and any concurrent first-access
-- request would 23505 on the UNIQUE constraint.
--
-- This migration back-fills the row for every tenant that's missing one,
-- with the same defaults as buildDefaultOffboardingSettingsRow().
-- Idempotent: re-running the migration is a no-op.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO offboarding_flow_settings (
    tenant_id,
    notice_period_enabled,
    notice_period_value,
    notice_period_unit,
    hr_partner_user_ids,
    approval_reporting_levels,
    approval_require_hr_partner,
    workflow_trigger
)
SELECT
    t.id,
    true,
    30,
    'days',
    '[]'::jsonb,
    1,
    true,
    'on_request_added'
FROM tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM offboarding_flow_settings s WHERE s.tenant_id = t.id
);
