-- 0016: Visa step history + cost stage tracking
-- Adds an append-only journal of every visa step transition and links each
-- recorded cost back to the stage it was incurred in.

ALTER TABLE "visa_costs"
    ADD COLUMN IF NOT EXISTS "step_number" integer,
    ADD COLUMN IF NOT EXISTS "step_label" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_visa_costs_step" ON "visa_costs" ("visa_application_id", "step_number");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "visa_step_history" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "visa_application_id" uuid NOT NULL REFERENCES "visa_applications"("id") ON DELETE CASCADE,
    "from_step" integer NOT NULL,
    "to_step" integer NOT NULL,
    "from_step_label" text NOT NULL,
    "to_step_label" text,
    "from_status" text NOT NULL,
    "to_status" text NOT NULL,
    "costs_total" numeric(12, 2) NOT NULL DEFAULT '0',
    "costs_count" integer NOT NULL DEFAULT 0,
    "notes" text,
    "advanced_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "advanced_by_name" text,
    "advanced_by_role" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_visa_step_history_tenant" ON "visa_step_history" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_visa_step_history_visa" ON "visa_step_history" ("visa_application_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_visa_step_history_created" ON "visa_step_history" ("created_at");
