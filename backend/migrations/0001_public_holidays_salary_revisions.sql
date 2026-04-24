-- ─────────────────────────────────────────────────────────────────────────────
-- 0001_public_holidays_salary_revisions.sql
--
-- Adds two tables:
--   1. public_holidays  — UAE national & custom holiday calendar per tenant
--   2. salary_revisions — immutable salary change audit trail per employee
-- ─────────────────────────────────────────────────────────────────────────────

--> statement-breakpoint

-- ─── 1. public_holidays ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "public_holidays" (
    "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id"    uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "name"         text NOT NULL,
    "date"         date NOT NULL,
    "year"         integer NOT NULL,
    "is_recurring" boolean DEFAULT false NOT NULL,
    "country"      text DEFAULT 'UAE' NOT NULL,
    "notes"        text,
    "created_at"   timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at"   timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_public_holidays_tenant" ON "public_holidays" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_public_holidays_year"   ON "public_holidays" ("tenant_id", "year");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_public_holidays_tenant_date" ON "public_holidays" ("tenant_id", "date");

--> statement-breakpoint
ALTER TABLE "public_holidays" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'public_holidays' AND policyname = 'public_holidays_tenant_isolation'
  ) THEN
    CREATE POLICY "public_holidays_tenant_isolation" ON "public_holidays"
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
  END IF;
END $$;

--> statement-breakpoint

-- ─── 2. salary_revisions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "salary_revisions" (
    "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id"             uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "employee_id"           uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
    "effective_date"        date NOT NULL,
    "revision_type"         text DEFAULT 'increment' NOT NULL,
    "previous_basic_salary" numeric(12, 2),
    "new_basic_salary"      numeric(12, 2) NOT NULL,
    "previous_total_salary" numeric(12, 2),
    "new_total_salary"      numeric(12, 2),
    "reason"                text,
    "approved_by"           uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at"            timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "salary_revisions_revision_type_check"
        CHECK (revision_type IN ('increment','decrement','promotion','annual_review','probation_completion','correction'))
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_salary_revisions_tenant"    ON "salary_revisions" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_salary_revisions_employee"  ON "salary_revisions" ("employee_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_salary_revisions_effective" ON "salary_revisions" ("employee_id", "effective_date" DESC);

--> statement-breakpoint
ALTER TABLE "salary_revisions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'salary_revisions' AND policyname = 'salary_revisions_tenant_isolation'
  ) THEN
    CREATE POLICY "salary_revisions_tenant_isolation" ON "salary_revisions"
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
  END IF;
END $$;
