CREATE TABLE IF NOT EXISTS "designations" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    "is_active" boolean NOT NULL DEFAULT true,
    "sort_order" integer NOT NULL DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    UNIQUE ("tenant_id", "name")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_designations_tenant" ON "designations" ("tenant_id");
