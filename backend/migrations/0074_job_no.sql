-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0074 — Recruitment job number
--
-- Adds `recruitment_jobs.job_no` — a human-readable per-tenant requisition
-- number (e.g. "JOB-0001") shown in the admin listing and the portal referral
-- job picker. Existing jobs are back-filled sequentially per tenant (by
-- created_at), and a partial-unique index keeps numbers unique per tenant.
--
-- Idempotent (IF NOT EXISTS / NULL-only backfill).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "recruitment_jobs" ADD COLUMN IF NOT EXISTS "job_no" text;

-- Back-fill existing rows: JOB-0001, JOB-0002, … per tenant, oldest first.
WITH numbered AS (
    SELECT id,
           'JOB-' || LPAD((ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY created_at, id))::text, 4, '0') AS jn
    FROM "recruitment_jobs"
    WHERE job_no IS NULL
)
UPDATE "recruitment_jobs" r
   SET job_no = n.jn
  FROM numbered n
 WHERE r.id = n.id;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_jobs_tenant_no_uniq"
    ON "recruitment_jobs" ("tenant_id", "job_no") WHERE "job_no" IS NOT NULL;
