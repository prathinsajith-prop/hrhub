-- ─────────────────────────────────────────────────────────────────────────────
-- 0014_grade_level_id_sponsoring_entities
-- Normalises grade_level and sponsoring_entity on employees to FK references.
-- Creates sponsoring_entities master table.
-- Migrates any existing text values into the master tables, then swaps columns.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Create sponsoring_entities master table
CREATE TABLE IF NOT EXISTS "sponsoring_entities" (
    "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id"  uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "name"       text NOT NULL,
    "is_active"  boolean NOT NULL DEFAULT true,
    "sort_order" integer NOT NULL DEFAULT 0,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "uq_sponsoring_entities_tenant_name" UNIQUE ("tenant_id", "name")
);
--> statement-breakpoint
CREATE INDEX "idx_sponsoring_entities_tenant" ON "sponsoring_entities" ("tenant_id");

-- 2. Add new FK columns to employees (nullable)
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "grade_level_id" uuid REFERENCES "grade_levels"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "sponsoring_entity_id" uuid REFERENCES "sponsoring_entities"("id") ON DELETE SET NULL;

-- 3. Migrate existing grade_level text → grade_levels table + FK
--> statement-breakpoint
INSERT INTO "grade_levels" ("tenant_id", "name")
SELECT DISTINCT "tenant_id", TRIM("grade_level")
FROM "employees"
WHERE "grade_level" IS NOT NULL AND TRIM("grade_level") <> ''
ON CONFLICT ON CONSTRAINT "uq_grade_levels_tenant_name" DO NOTHING;
--> statement-breakpoint
UPDATE "employees" e
SET "grade_level_id" = gl."id"
FROM "grade_levels" gl
WHERE e."tenant_id" = gl."tenant_id"
  AND TRIM(e."grade_level") = gl."name"
  AND e."grade_level" IS NOT NULL
  AND TRIM(e."grade_level") <> '';

-- 4. Migrate existing sponsoring_entity text → sponsoring_entities table + FK
--> statement-breakpoint
INSERT INTO "sponsoring_entities" ("tenant_id", "name")
SELECT DISTINCT "tenant_id", TRIM("sponsoring_entity")
FROM "employees"
WHERE "sponsoring_entity" IS NOT NULL AND TRIM("sponsoring_entity") <> ''
ON CONFLICT ON CONSTRAINT "uq_sponsoring_entities_tenant_name" DO NOTHING;
--> statement-breakpoint
UPDATE "employees" e
SET "sponsoring_entity_id" = se."id"
FROM "sponsoring_entities" se
WHERE e."tenant_id" = se."tenant_id"
  AND TRIM(e."sponsoring_entity") = se."name"
  AND e."sponsoring_entity" IS NOT NULL
  AND TRIM(e."sponsoring_entity") <> '';

-- 5. Drop old text columns
--> statement-breakpoint
ALTER TABLE "employees" DROP COLUMN IF EXISTS "grade_level";
--> statement-breakpoint
ALTER TABLE "employees" DROP COLUMN IF EXISTS "sponsoring_entity";

-- 6. Add labour card expiry
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "labour_card_expiry" date;
