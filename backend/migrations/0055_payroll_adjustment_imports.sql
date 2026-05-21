-- Bulk import history for payroll adjustments.
--
-- One row per successful import. Stores the original spreadsheet (S3) plus
-- metadata so HR can audit who uploaded what, download the file again, and
-- recognise duplicate uploads server-side.

CREATE TABLE IF NOT EXISTS "payroll_adjustment_imports" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "period_year" integer NOT NULL,
    "period_month" integer NOT NULL,
    "category" text NOT NULL,
    "rows_created" integer NOT NULL,
    "file_name" text NOT NULL,
    "file_size" integer NOT NULL,
    "file_mime" text NOT NULL,
    "file_s3_key" text NOT NULL,
    "file_hash" text NOT NULL,
    "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_payroll_adj_imports_tenant_period"
    ON "payroll_adjustment_imports"("tenant_id", "period_year", "period_month");

CREATE INDEX IF NOT EXISTS "idx_payroll_adj_imports_tenant_created"
    ON "payroll_adjustment_imports"("tenant_id", "created_at" DESC);

-- Same file hash from same tenant + period should not double-import. The
-- partial unique index on (tenant, hash) per (year, month) lets HR re-use the
-- same template across months while preventing accidental re-uploads inside
-- a single period.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_payroll_adj_imports_dedupe"
    ON "payroll_adjustment_imports"("tenant_id", "period_year", "period_month", "file_hash");
