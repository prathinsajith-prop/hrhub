-- ─────────────────────────────────────────────────────────────────────────────
-- 0020_grade_levels_enhanced
-- Adds structured fields to grade_levels: code (G1…), numeric level,
-- hierarchy band, salary range, and description.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "grade_levels"
    ADD COLUMN IF NOT EXISTS "code"        text,
    ADD COLUMN IF NOT EXISTS "level"       integer,
    ADD COLUMN IF NOT EXISTS "hierarchy"   text,
    ADD COLUMN IF NOT EXISTS "salary_min"  integer,
    ADD COLUMN IF NOT EXISTS "salary_max"  integer,
    ADD COLUMN IF NOT EXISTS "description" text;
--> statement-breakpoint

-- Unique level per tenant (partial — only enforced when level is set)
CREATE UNIQUE INDEX IF NOT EXISTS "uq_grade_levels_tenant_level"
    ON "grade_levels" ("tenant_id", "level")
    WHERE "level" IS NOT NULL;
--> statement-breakpoint

-- Unique code per tenant (partial)
CREATE UNIQUE INDEX IF NOT EXISTS "uq_grade_levels_tenant_code"
    ON "grade_levels" ("tenant_id", "code")
    WHERE "code" IS NOT NULL;
