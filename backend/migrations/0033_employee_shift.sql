-- Per-employee shift schedule.
--
-- - shift_start / shift_end: 'HH:MM' (24-hour) strings. Stored as text so we
--   don't have to deal with timezone semantics on a time-of-day value.
-- - weekly_off_days: text[] of weekday names (e.g. ['saturday','sunday']).
--   Overrides the tenant's default weekend defined in tenants.leave_settings.
-- Null on any column means "fall back to the tenant default".
--
-- NOTE: these columns were short-lived. Migration 0034 replaces them with a
-- shift_id FK so shift templates live at the tenant level.
ALTER TABLE "employees"
    ADD COLUMN IF NOT EXISTS "shift_start"      text,
    ADD COLUMN IF NOT EXISTS "shift_end"        text,
    ADD COLUMN IF NOT EXISTS "weekly_off_days"  text[];
