-- Employee-initiated profile field changes that require HR approval before
-- being written onto the employees row. JSONB columns hold the proposed
-- update and a snapshot of the values at request time so reviewers can see
-- exactly what's changing.
CREATE TABLE IF NOT EXISTS "profile_change_requests" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "employee_id" uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
    "requested_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "category" text NOT NULL,
    "status" text NOT NULL DEFAULT 'pending',
    "proposed_changes" jsonb NOT NULL,
    "current_snapshot" jsonb NOT NULL,
    "verified_fields" jsonb,
    "reviewer_notes" text,
    "rejection_reason" text,
    "reviewed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_pcr_tenant" ON "profile_change_requests" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_pcr_employee" ON "profile_change_requests" ("employee_id");
CREATE INDEX IF NOT EXISTS "idx_pcr_tenant_status" ON "profile_change_requests" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "idx_pcr_tenant_employee" ON "profile_change_requests" ("tenant_id", "employee_id");
