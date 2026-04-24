-- Migration: 0012_employees_reporting_to_fk
--
-- employees.reporting_to is already declared as UUID but has no foreign-key
-- constraint and no supporting index. Add both, and keep the existing
-- manager_name column as a denormalised snapshot used by email templates and
-- list views (avoids a self-join on every employee fetch).
--
-- The FK uses ON DELETE SET NULL because a manager leaving should not cascade
-- and remove their reports.
--
-- We pre-clean any rows whose reporting_to no longer points at a real
-- employee so the constraint can be added without errors.

UPDATE employees
SET reporting_to = NULL
WHERE reporting_to IS NOT NULL
  AND reporting_to NOT IN (SELECT id FROM employees);

ALTER TABLE employees
    DROP CONSTRAINT IF EXISTS fk_employees_reporting_to;

ALTER TABLE employees
    ADD CONSTRAINT fk_employees_reporting_to
        FOREIGN KEY (reporting_to)
        REFERENCES employees(id)
        ON DELETE SET NULL
        DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX IF NOT EXISTS idx_employees_reporting_to
    ON employees(reporting_to)
    WHERE reporting_to IS NOT NULL;

-- Useful for "all reports under this tenant" queries.
CREATE INDEX IF NOT EXISTS idx_employees_tenant_reporting_to
    ON employees(tenant_id, reporting_to)
    WHERE reporting_to IS NOT NULL;

ANALYZE employees;
