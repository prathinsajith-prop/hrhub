-- ─────────────────────────────────────────────────────────────────────────────
-- 0012_employee_warnings
-- Adds: employee_warnings
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "employee_warnings" (
    "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id"         uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "employee_id"       uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
    "issue_date"        date NOT NULL,
    "expiry_date"       date,
    "reason"            text,
    "document_s3_key"   text,
    "document_file_name" text,
    "created_by_id"     uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "created_by_name"   text,
    "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at"        timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "idx_emp_warnings_employee" ON "employee_warnings" ("employee_id");
--> statement-breakpoint
CREATE INDEX "idx_emp_warnings_tenant" ON "employee_warnings" ("tenant_id");
