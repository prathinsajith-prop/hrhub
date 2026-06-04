-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0081 — Candidate profile fields
--
-- Adds richer applicant profile data captured from the public careers apply
-- form (and by HR when adding candidates manually):
--   • address              — free-text mailing address
--   • gender               — text enum: male / female / other / prefer_not_to_say
--   • education_history    — jsonb array of {school, degree?, fieldOfStudy?,
--                            startDate?, endDate?, current?, summary?}
--   • experience_history   — jsonb array of {title, company?, industry?,
--                            summary?, startDate?, endDate?, current?}
--
-- NOTE: the existing `experience` (integer, years-of-experience) column is
-- preserved. The new `experience_history` column is for the LinkedIn-style
-- list of past roles. Same idea for education — schools attended.
--
-- Idempotent (IF NOT EXISTS).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "job_applications"
    ADD COLUMN IF NOT EXISTS "address" text,
    ADD COLUMN IF NOT EXISTS "gender" text,
    ADD COLUMN IF NOT EXISTS "education_history" jsonb NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS "experience_history" jsonb NOT NULL DEFAULT '[]'::jsonb;
