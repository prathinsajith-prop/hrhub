-- Extend shifts with the timekeeping fields commonly needed by attendance.
--
-- - color: optional UI swatch so HR can spot shifts at a glance in tables /
--   calendar grids.
-- - shift_margin_before_minutes / shift_margin_after_minutes: punch-in / out
--   are payable only inside [start - before, end + after]. Null means "no
--   margin enforcement" (legacy behaviour: every clock event counts).
-- - core_working_hours: jsonb array of { from, to } pairs (HH:MM each). When
--   non-empty, employees must be present during these windows; attendance
--   reports can flag absences against them.
-- - restrict_breaks_during_core_hours: when true, automatic and manual breaks
--   cannot overlap any core_working_hours window.

ALTER TABLE "shifts"
    ADD COLUMN IF NOT EXISTS "color" text,
    ADD COLUMN IF NOT EXISTS "shift_margin_before_minutes" integer,
    ADD COLUMN IF NOT EXISTS "shift_margin_after_minutes" integer,
    ADD COLUMN IF NOT EXISTS "core_working_hours" jsonb NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS "restrict_breaks_during_core_hours" boolean NOT NULL DEFAULT false;

-- Sanity guards: margins are non-negative when set; if either is set the
-- other must be too (treat the pair as a single toggle).
ALTER TABLE "shifts"
    ADD CONSTRAINT "shifts_margin_before_nonneg"
        CHECK ("shift_margin_before_minutes" IS NULL OR "shift_margin_before_minutes" >= 0),
    ADD CONSTRAINT "shifts_margin_after_nonneg"
        CHECK ("shift_margin_after_minutes" IS NULL OR "shift_margin_after_minutes" >= 0),
    ADD CONSTRAINT "shifts_margin_both_or_neither"
        CHECK (("shift_margin_before_minutes" IS NULL) = ("shift_margin_after_minutes" IS NULL));
