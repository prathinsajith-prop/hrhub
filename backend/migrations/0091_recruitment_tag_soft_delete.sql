-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0091 — Soft delete for recruitment tag catalogs
--
-- The catalog CRUD added alongside migration 0088 hard-deleted rows, which
-- violates the project-wide soft-delete convention (business data must be
-- tombstoned + restorable). This migration:
--
--   1. Adds `deleted_at` to recruitment_skills / recruitment_qualifications.
--   2. Rebuilds the case-insensitive unique indexes as PARTIAL
--      (WHERE deleted_at IS NULL) so a deleted entry frees its name —
--      re-adding it inserts a fresh live row and the tombstone stays behind.
--
-- The job-save catalog upsert uses ON CONFLICT DO NOTHING without an explicit
-- conflict target, which Postgres resolves against partial unique indexes too,
-- so that path keeps working unchanged.
--
-- Idempotent (IF NOT EXISTS / IF EXISTS).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "recruitment_skills" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;
ALTER TABLE "recruitment_qualifications" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;

DROP INDEX IF EXISTS "uq_recruitment_skills_tenant_name";
CREATE UNIQUE INDEX IF NOT EXISTS "uq_recruitment_skills_tenant_name"
    ON "recruitment_skills" ("tenant_id", lower("name"))
    WHERE "deleted_at" IS NULL;

DROP INDEX IF EXISTS "uq_recruitment_qualifications_tenant_name";
CREATE UNIQUE INDEX IF NOT EXISTS "uq_recruitment_qualifications_tenant_name"
    ON "recruitment_qualifications" ("tenant_id", lower("name"))
    WHERE "deleted_at" IS NULL;
