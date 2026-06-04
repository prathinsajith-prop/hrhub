-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0089 — Required years of experience on a job posting
--
-- HR sets the minimum years of professional experience the role expects. Used
-- in the job create/edit dialog, displayed on the admin job-detail page and
-- the public careers detail page so applicants self-screen before applying.
--
-- Nullable — pre-existing rows have no constraint until HR edits the job.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "recruitment_jobs" ADD COLUMN "experience_years" integer;
