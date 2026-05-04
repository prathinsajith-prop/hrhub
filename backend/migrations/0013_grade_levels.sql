-- ─────────────────────────────────────────────────────────────────────────────
-- 0013_grade_levels
-- Adds: grade_levels (org-managed list, mirrors designations pattern)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "grade_levels" (
    "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id"  uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "name"       text NOT NULL,
    "is_active"  boolean NOT NULL DEFAULT true,
    "sort_order" integer NOT NULL DEFAULT 0,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "uq_grade_levels_tenant_name" UNIQUE ("tenant_id", "name")
);
--> statement-breakpoint
CREATE INDEX "idx_grade_levels_tenant" ON "grade_levels" ("tenant_id");
