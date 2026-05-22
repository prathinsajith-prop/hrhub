-- Tenant-defined custom categories for payroll adjustments.
--
-- The 8 built-in categories (overtime, commission, bonus, loan_repayment,
-- salary_advance, unpaid_leave, sick_half_pay, manual) stay in the application
-- layer because they have semantic meaning for runPayroll's totals math.
--
-- This table lets HR add their own labels (e.g. "site_allowance",
-- "ramadan_bonus") that get pooled into the generic addition / deduction
-- buckets — they show in the picker and behave like a manual addition or
-- deduction for payroll computation.

CREATE TABLE IF NOT EXISTS "payroll_adjustment_categories" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "value" text NOT NULL,
    "label" text NOT NULL,
    "kind" text NOT NULL,
    "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- One category per (tenant, slug) — case-insensitive so "Bonus" and "bonus"
-- don't double-register. We store the lowercased slug in `value` and the
-- human label in `label` so the picker displays "Site Allowance" even though
-- the column value is "site_allowance".
CREATE UNIQUE INDEX IF NOT EXISTS "uq_payroll_adj_categories_tenant_value"
    ON "payroll_adjustment_categories"("tenant_id", "value");

CREATE INDEX IF NOT EXISTS "idx_payroll_adj_categories_tenant"
    ON "payroll_adjustment_categories"("tenant_id");
