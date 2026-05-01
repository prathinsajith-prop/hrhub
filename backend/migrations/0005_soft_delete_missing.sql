-- Add missing deleted_at columns for soft delete consistency
ALTER TABLE "employee_loans" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
ALTER TABLE "asset_categories" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
