-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0088 — Recruitment skill & qualification catalogs
--
-- Normalises the recruitment tag vocabulary into two dedicated, per-tenant
-- catalog tables. Previously the type-ahead suggestions were derived at query
-- time by unnesting the jsonb `skills` / `qualifications` arrays on every job —
-- correct but unindexed and recomputed per request. These tables are the single
-- source of truth for suggestions and are curated exclusively from the job
-- create/edit screens (résumé-upload areas only READ them, never add to them).
--
--   • recruitment_skills          — distinct skill tags per tenant
--   • recruitment_qualifications  — distinct qualification tags per tenant
--
-- Each is case-insensitively unique per tenant (first-seen casing wins, enforced
-- by a UNIQUE index on (tenant_id, lower(name))). Backfilled from existing jobs
-- so suggestions are populated immediately.
--
-- Idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "recruitment_skills" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "recruitment_qualifications" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    "created_at" timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness per tenant; also the conflict target for upserts.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_recruitment_skills_tenant_name"
    ON "recruitment_skills" ("tenant_id", lower("name"));
CREATE UNIQUE INDEX IF NOT EXISTS "uq_recruitment_qualifications_tenant_name"
    ON "recruitment_qualifications" ("tenant_id", lower("name"));

-- Tenant-scoped alphabetical listing (suggestions order by name).
CREATE INDEX IF NOT EXISTS "idx_recruitment_skills_tenant_name"
    ON "recruitment_skills" ("tenant_id", "name");
CREATE INDEX IF NOT EXISTS "idx_recruitment_qualifications_tenant_name"
    ON "recruitment_qualifications" ("tenant_id", "name");

-- ── Backfill from existing job tag arrays ───────────────────────────────────
INSERT INTO "recruitment_skills" ("tenant_id", "name")
SELECT DISTINCT j."tenant_id", btrim(s.value) AS name
FROM "recruitment_jobs" j
CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(j."skills", '[]'::jsonb)) AS s(value)
WHERE j."deleted_at" IS NULL AND btrim(s.value) <> ''
ON CONFLICT DO NOTHING;

INSERT INTO "recruitment_qualifications" ("tenant_id", "name")
SELECT DISTINCT j."tenant_id", btrim(q.value) AS name
FROM "recruitment_jobs" j
CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(j."qualifications", '[]'::jsonb)) AS q(value)
WHERE j."deleted_at" IS NULL AND btrim(q.value) <> ''
ON CONFLICT DO NOTHING;
