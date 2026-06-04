-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0078 — Recruitment job posting fields
--
-- Extends `recruitment_jobs` with metadata that hiring managers and candidates
-- expect on a modern job post:
--   • workplace_type  — on_site / hybrid / remote (separate from contract type)
--   • skills          — jsonb array of skill tags (TypeScript, Negotiation, ...)
--   • qualifications  — jsonb array of qualification bullets (Bachelor's in CS,
--                       PMP cert, ...)
--
-- Backwards compatible: all new columns nullable / default empty. Existing rows
-- get '[]' for the jsonb fields and 'on_site' for workplace_type.
-- Idempotent (IF NOT EXISTS).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "recruitment_jobs"
    ADD COLUMN IF NOT EXISTS "workplace_type" text NOT NULL DEFAULT 'on_site',
    ADD COLUMN IF NOT EXISTS "skills" jsonb NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS "qualifications" jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Filter index for the public careers listing's workplace-type facet.
CREATE INDEX IF NOT EXISTS "idx_jobs_workplace" ON "recruitment_jobs" ("tenant_id", "workplace_type");
