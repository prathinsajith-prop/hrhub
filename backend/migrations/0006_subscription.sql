-- ─── Subscription: employee quota per tenant ──────────────────────────────
-- Adds employeeQuota column to tenants.
-- NULL  = unlimited (enterprise)
-- Value = max active employees allowed (starter=5, growth=custom)

ALTER TABLE "tenants"
    ADD COLUMN IF NOT EXISTS "employee_quota" integer DEFAULT 5;

-- Existing starter tenants keep the default of 5.
-- Existing growth tenants get 20 by default (a reasonable starting quota).
UPDATE "tenants" SET "employee_quota" = 20  WHERE "subscription_plan" = 'growth';
-- Enterprise tenants get NULL (unlimited).
UPDATE "tenants" SET "employee_quota" = NULL WHERE "subscription_plan" = 'enterprise';
