-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0070 — Per-user attendance switches
--
-- Two booleans on `users`:
--   - attendance_punch_enabled        — gates live check-in / check-out
--   - attendance_manual_entry_enabled — gates the "Manual entry" panel that
--                                       lets the employee back-fill punches
--
-- Both default to true so existing tenants behave exactly as before. HR
-- toggles them from Users → Manage Access on a per-user basis.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS attendance_punch_enabled boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS attendance_manual_entry_enabled boolean NOT NULL DEFAULT true;
