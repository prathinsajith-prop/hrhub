-- ─────────────────────────────────────────────────────────────────────────────
-- 0016_salary_revision_allowances
-- Adds housing, transport, and other allowance columns to salary_revisions
-- so the full compensation breakdown is captured alongside basic/total.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "salary_revisions"
    ADD COLUMN IF NOT EXISTS "previous_housing_allowance"   numeric(12, 2),
    ADD COLUMN IF NOT EXISTS "new_housing_allowance"        numeric(12, 2),
    ADD COLUMN IF NOT EXISTS "previous_transport_allowance" numeric(12, 2),
    ADD COLUMN IF NOT EXISTS "new_transport_allowance"      numeric(12, 2),
    ADD COLUMN IF NOT EXISTS "previous_other_allowances"    numeric(12, 2),
    ADD COLUMN IF NOT EXISTS "new_other_allowances"         numeric(12, 2);
