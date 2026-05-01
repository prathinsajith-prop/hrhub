-- Training & Development records
CREATE TABLE IF NOT EXISTS "training_records" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "employee_id" uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
    "title" text NOT NULL,
    "provider" text,
    "type" text NOT NULL DEFAULT 'external',
    "start_date" date NOT NULL,
    "end_date" date,
    "cost" numeric(12, 2),
    "currency" text DEFAULT 'AED',
    "status" text NOT NULL DEFAULT 'planned',
    "certificate_url" text,
    "certificate_expiry" date,
    "notes" text,
    "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_training_records_tenant" ON "training_records" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_training_records_employee" ON "training_records" ("employee_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_training_records_status" ON "training_records" ("tenant_id", "status");

-- Employee Loans / Salary Advances
CREATE TABLE IF NOT EXISTS "employee_loans" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "employee_id" uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
    "amount" numeric(12, 2) NOT NULL,
    "monthly_deduction" numeric(12, 2) NOT NULL,
    "reason" text,
    "status" text NOT NULL DEFAULT 'pending',
    "approved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "approved_at" timestamp with time zone,
    "start_date" date,
    "total_installments" integer,
    "paid_installments" integer NOT NULL DEFAULT 0,
    "remaining_balance" numeric(12, 2),
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_employee_loans_tenant" ON "employee_loans" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_employee_loans_employee" ON "employee_loans" ("employee_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_employee_loans_status" ON "employee_loans" ("tenant_id", "status");
