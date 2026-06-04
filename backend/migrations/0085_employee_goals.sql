-- Employee personal goals (SMART / OKR style self-service items).
--
-- Distinct from performance_reviews (HR-driven review cycles): these are
-- goals an employee sets for themselves in the portal, tracks progress on
-- (0-100%), and marks complete. Tenant + employee scoped, soft-deletable.
--
-- progress is an integer percent clamped 0-100 at the route layer.
-- status is a text enum: 'active' | 'completed' | 'archived'.
-- category is a free-text bucket (e.g. 'professional', 'personal', 'okr').

CREATE TABLE IF NOT EXISTS "employee_goals" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "employee_id" uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
    "title" text NOT NULL,
    "description" text,
    "category" text NOT NULL DEFAULT 'professional',
    "status" text NOT NULL DEFAULT 'active',
    "progress" integer NOT NULL DEFAULT 0,
    "target_date" date,
    "completed_at" timestamp with time zone,
    "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Per-employee list (the portal's primary read), newest first.
CREATE INDEX IF NOT EXISTS "idx_employee_goals_employee"
    ON "employee_goals" ("tenant_id", "employee_id", "created_at");
-- Tenant-wide scan for any future HR rollup.
CREATE INDEX IF NOT EXISTS "idx_employee_goals_tenant"
    ON "employee_goals" ("tenant_id");
