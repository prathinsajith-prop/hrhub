-- ─────────────────────────────────────────────────────────────────────────────
-- 0011_employee_dependents_notes
-- Adds: employee_dependents, employee_notes
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "employee_dependents" (
    "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id"         uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "employee_id"       uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
    "reference"         text NOT NULL,
    "name"              text NOT NULL,
    "birth_date"        date,
    "relation"          text NOT NULL,
    "nationality"       text,
    "visa_number"       text,
    "medical_insurance" text,
    "created_by_id"     uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "created_by_name"   text,
    "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at"        timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_emp_dependents_reference" ON "employee_dependents" ("tenant_id", "reference");
--> statement-breakpoint
CREATE INDEX "idx_emp_dependents_employee" ON "employee_dependents" ("employee_id");
--> statement-breakpoint
CREATE INDEX "idx_emp_dependents_tenant" ON "employee_dependents" ("tenant_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "employee_notes" (
    "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id"       uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "employee_id"     uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
    "content"         text NOT NULL,
    "created_by_id"   uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "created_by_name" text,
    "created_at"      timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "idx_emp_notes_employee" ON "employee_notes" ("employee_id");
--> statement-breakpoint
CREATE INDEX "idx_emp_notes_tenant" ON "employee_notes" ("tenant_id");
