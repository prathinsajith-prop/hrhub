CREATE TABLE IF NOT EXISTS "visa_costs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "visa_application_id" uuid REFERENCES "visa_applications"("id") ON DELETE SET NULL,
    "employee_id" uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
    "category" text NOT NULL,
    "description" text,
    "amount" numeric(12, 2) NOT NULL,
    "currency" text NOT NULL DEFAULT 'AED',
    "paid_date" date NOT NULL,
    "receipt_ref" text,
    "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_visa_costs_tenant" ON "visa_costs" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_visa_costs_visa" ON "visa_costs" ("visa_application_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_visa_costs_employee" ON "visa_costs" ("employee_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_visa_costs_paid_date" ON "visa_costs" ("paid_date");
