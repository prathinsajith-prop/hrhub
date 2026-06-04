-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0073 — Employee referrals
--
-- Adds the employee-portal referral feature:
--   1. `job_applications.source` ('direct' | 'referral') + `referred_by_employee_id`
--      so referred candidates appear in the recruitment pipeline tagged with the
--      referrer (drives the "Referred by" badge in the admin listing/kanban).
--   2. `referrals` table — the portal's source of truth for who referred whom,
--      linked 1:1 to the created job_application via `job_application_id`.
--
-- Idempotent (IF NOT EXISTS) so it is safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Tag applications with their origin + referrer.
ALTER TABLE "job_applications"
    ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'direct';

ALTER TABLE "job_applications"
    ADD COLUMN IF NOT EXISTS "referred_by_employee_id" uuid;

DO $$ BEGIN
    ALTER TABLE "job_applications"
        ADD CONSTRAINT "job_applications_referred_by_employee_id_employees_id_fk"
        FOREIGN KEY ("referred_by_employee_id") REFERENCES "employees"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "idx_applications_referrer"
    ON "job_applications" ("referred_by_employee_id");

-- 2. Referrals table.
CREATE TABLE IF NOT EXISTS "referrals" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL,
    "job_id" uuid NOT NULL,
    "referred_by_employee_id" uuid NOT NULL,
    "job_application_id" uuid,
    "candidate_name" text NOT NULL,
    "candidate_email" text NOT NULL,
    "candidate_phone" text,
    "relationship" text,
    "notes" text,
    "resume_url" text,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
    ALTER TABLE "referrals" ADD CONSTRAINT "referrals_tenant_id_tenants_id_fk"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "referrals" ADD CONSTRAINT "referrals_job_id_recruitment_jobs_id_fk"
        FOREIGN KEY ("job_id") REFERENCES "recruitment_jobs"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_by_employee_id_employees_id_fk"
        FOREIGN KEY ("referred_by_employee_id") REFERENCES "employees"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "referrals" ADD CONSTRAINT "referrals_job_application_id_job_applications_id_fk"
        FOREIGN KEY ("job_application_id") REFERENCES "job_applications"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "idx_referrals_tenant" ON "referrals" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_referrals_referrer" ON "referrals" ("referred_by_employee_id");
CREATE INDEX IF NOT EXISTS "idx_referrals_job" ON "referrals" ("job_id");
CREATE INDEX IF NOT EXISTS "idx_referrals_application" ON "referrals" ("job_application_id");

-- No duplicate referrals: one live referral per (tenant, job, candidate email).
-- Partial so a candidate can be re-referred after a prior referral is removed.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_referrals_candidate_uniq"
    ON "referrals" ("tenant_id", "job_id", "candidate_email") WHERE "deleted_at" IS NULL;
