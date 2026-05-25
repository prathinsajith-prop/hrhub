-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0071 — Offboarding workflow: multi-action support
--
-- Adds `actions text[]` so a single workflow can fan out to BOTH an email
-- alert and an in-app notification when its trigger fires (the previous
-- one-action-per-row design forced HR to create two workflows for the same
-- event).
--
-- `custom_function` is HIDDEN from the UI going forward but kept in the data
-- model so legacy rows continue to round-trip. fireWorkflows() logs + skips
-- it (the sandbox runner was never implemented).
--
-- Migration is idempotent (`IF NOT EXISTS`) and the legacy `action_type`
-- column is kept in sync with `actions[0]` so any straggling read still
-- resolves a valid value.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add the new array column.
ALTER TABLE offboarding_workflows
    ADD COLUMN IF NOT EXISTS actions text[] NOT NULL DEFAULT ARRAY['email_alert']::text[];

-- 2. Back-fill `actions` from the legacy single-value column for rows still
--    using the default. Preserves custom_function so legacy rows remain
--    intact — the UI just doesn't expose the option for new rows.
UPDATE offboarding_workflows
   SET actions = ARRAY[action_type]::text[]
 WHERE actions = ARRAY['email_alert']::text[]
   AND action_type IS NOT NULL
   AND action_type <> 'email_alert';
