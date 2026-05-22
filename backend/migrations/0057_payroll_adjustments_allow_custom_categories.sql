-- Drop the CHECK constraint that restricted payroll_adjustments.category to
-- the 8 built-in slugs. Validation now lives in the route layer (resolveCategory
-- looks up the tenant's payroll_adjustment_categories catalog), so HR-defined
-- custom categories like "site_allowance" need to be allowed through to the
-- DB. The kind CHECK stays — kind is still constrained to 'addition' /
-- 'deduction'.

ALTER TABLE "payroll_adjustments"
    DROP CONSTRAINT IF EXISTS "payroll_adjustments_category_check";
