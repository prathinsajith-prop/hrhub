-- Travel module: travel_requests + travel_expenses.
--
-- See backend/src/db/schema/travel.ts for the design rationale. Both tables
-- carry deleted_at (soft delete) and a generous index set so the lists scale
-- to thousands of trips per tenant without table scans.

CREATE TABLE IF NOT EXISTS "travel_requests" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "employee_id" uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
    "travel_no" text NOT NULL,
    "place_of_visit" text,
    "departure_date" date NOT NULL,
    "arrival_date" date NOT NULL,
    "duration_days" integer NOT NULL,
    "purpose_of_visit" text,
    "customer_name" text,
    "is_billable_to_customer" boolean NOT NULL DEFAULT false,
    "status" text NOT NULL DEFAULT 'draft',
    "approved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "approved_at" timestamp with time zone,
    "rejection_reason" text,
    "notes" text,
    "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "chk_travel_requests_status"
        CHECK ("status" IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled', 'completed')),
    CONSTRAINT "chk_travel_requests_dates"
        CHECK ("arrival_date" >= "departure_date"),
    CONSTRAINT "chk_travel_requests_duration_positive"
        CHECK ("duration_days" >= 1)
);

CREATE INDEX IF NOT EXISTS "idx_travel_requests_tenant"
    ON "travel_requests"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_travel_requests_employee"
    ON "travel_requests"("employee_id");
CREATE INDEX IF NOT EXISTS "idx_travel_requests_tenant_employee"
    ON "travel_requests"("tenant_id", "employee_id");
CREATE INDEX IF NOT EXISTS "idx_travel_requests_status"
    ON "travel_requests"("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "idx_travel_requests_departure"
    ON "travel_requests"("tenant_id", "departure_date");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_travel_requests_travel_no"
    ON "travel_requests"("tenant_id", "travel_no");


CREATE TABLE IF NOT EXISTS "travel_expenses" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "travel_request_id" uuid NOT NULL REFERENCES "travel_requests"("id") ON DELETE CASCADE,
    "employee_id" uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
    "description" text,
    "expense_date" date NOT NULL,
    "ticket" numeric(12, 2) NOT NULL DEFAULT 0,
    "lodging" numeric(12, 2) NOT NULL DEFAULT 0,
    "boarding" numeric(12, 2) NOT NULL DEFAULT 0,
    "phone" numeric(12, 2) NOT NULL DEFAULT 0,
    "local_conveyance" numeric(12, 2) NOT NULL DEFAULT 0,
    "incidentals" numeric(12, 2) NOT NULL DEFAULT 0,
    "others" numeric(12, 2) NOT NULL DEFAULT 0,
    "currency" text NOT NULL DEFAULT 'AED',
    "receipt_s3_key" text,
    "status" text NOT NULL DEFAULT 'pending',
    "approved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "approved_at" timestamp with time zone,
    "rejection_reason" text,
    "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "chk_travel_expenses_status"
        CHECK ("status" IN ('pending', 'approved', 'rejected', 'reimbursed')),
    CONSTRAINT "chk_travel_expenses_nonneg"
        CHECK (
            "ticket" >= 0 AND "lodging" >= 0 AND "boarding" >= 0
            AND "phone" >= 0 AND "local_conveyance" >= 0
            AND "incidentals" >= 0 AND "others" >= 0
        )
);

CREATE INDEX IF NOT EXISTS "idx_travel_expenses_tenant"
    ON "travel_expenses"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_travel_expenses_request"
    ON "travel_expenses"("travel_request_id");
CREATE INDEX IF NOT EXISTS "idx_travel_expenses_tenant_request"
    ON "travel_expenses"("tenant_id", "travel_request_id");
CREATE INDEX IF NOT EXISTS "idx_travel_expenses_tenant_employee"
    ON "travel_expenses"("tenant_id", "employee_id");
CREATE INDEX IF NOT EXISTS "idx_travel_expenses_status"
    ON "travel_expenses"("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "idx_travel_expenses_date"
    ON "travel_expenses"("tenant_id", "expense_date");
