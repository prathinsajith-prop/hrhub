-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0086 — Candidate skills
--
-- Adds a structured `skills` field to job_applications so a candidate's skills
-- (captured from the public careers apply form, the HR add-candidate dialog, an
-- employee referral, or auto-extracted from an uploaded résumé) are stored as a
-- first-class jsonb array of tags — mirroring how education_history /
-- experience_history are stored (migration 0081).
--
-- Previously parsed skills were appended to the free-text `notes` field as a
-- "Skills: a, b, c" line because there was nowhere structured to keep them;
-- this column lets the candidate profile render them as proper tags.
--
-- Idempotent (IF NOT EXISTS).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "job_applications"
    ADD COLUMN IF NOT EXISTS "skills" jsonb NOT NULL DEFAULT '[]'::jsonb;
