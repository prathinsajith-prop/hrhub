-- Promote shifts from per-employee inline columns (0033) to a tenant-scoped
-- lookup table. An employee references one shift via employees.shift_id;
-- null = "use the tenant default working week".
CREATE TABLE IF NOT EXISTS "shifts" (
    "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"        uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "name"             text NOT NULL,
    "start_time"       text NOT NULL,
    "end_time"         text NOT NULL,
    "weekly_off_days"  text[] NOT NULL DEFAULT '{}'::text[],
    "is_active"        boolean NOT NULL DEFAULT true,
    "sort_order"       integer NOT NULL DEFAULT 0,
    "created_at"       timestamptz NOT NULL DEFAULT now(),
    "updated_at"       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_shifts_tenant" ON "shifts" ("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_shifts_tenant_name" ON "shifts" ("tenant_id", "name");

-- Drop the inline shift columns introduced in 0033; they were never exposed in
-- the UI as a stable contract.
ALTER TABLE "employees"
    DROP COLUMN IF EXISTS "shift_start",
    DROP COLUMN IF EXISTS "shift_end",
    DROP COLUMN IF EXISTS "weekly_off_days",
    ADD COLUMN IF NOT EXISTS "shift_id" uuid REFERENCES "shifts"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_employees_shift" ON "employees" ("shift_id");
