-- Add soft-delete support to performance_reviews and visa_costs
ALTER TABLE "performance_reviews" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
ALTER TABLE "visa_costs" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
