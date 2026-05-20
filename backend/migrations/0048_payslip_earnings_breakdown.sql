-- Add a JSONB column to `payslips` storing the catalog-driven earnings
-- breakdown that was actually used to compute this run. The legacy
-- basic/housing/transport/other columns stay populated for WPS export and
-- back-compat; this new column lets the UI render dynamic per-component
-- rows (Communication Allowance, Cost of Living, etc.) instead of
-- collapsing everything beyond the three named buckets into "Other".
--
-- Shape: jsonb array of `{ componentId, category, name, amount }`. Empty
-- array for any payslip generated before this migration — the UI must
-- handle that case by falling back to the four numeric columns.

ALTER TABLE payslips
    ADD COLUMN IF NOT EXISTS earnings_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb;
