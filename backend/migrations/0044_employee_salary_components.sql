-- Employee → salary-component assignments.
--
-- Phase 2 of the salary-components feature. The catalog (migration 0043) is
-- the tenant-wide definition layer; this table is the per-employee assignment
-- layer. Payroll now reads from these assignments instead of the legacy
-- static fields (employees.basic_salary / housing_allowance / transport_allowance
-- / other_allowances) — but the static fields are KEPT, populated by the
-- backfill below, so other consumers (WPS, gratuity, salary_revisions,
-- Employee profile UI, exit settlement) keep working unchanged.
--
-- Design choices:
--   * One row per (employee, component). UNIQUE constraint enforces this.
--   * `amount` is nullable — NULL means "use the catalog default". For flat
--     components the assignment overrides the catalog amount; for percentage
--     components the assignment overrides the percentage value (0–100).
--   * `effective_from` / `effective_to` give us a future-proof slot for
--     salary changes ("Housing jumps from 25% → 30% from June"), but the
--     runtime today picks the assignment that's effective on the payroll
--     period start date.
--   * A tenant-alignment trigger (matching the pattern from migrations 0039
--     and 0040) keeps employee + component tenant_ids in sync.

CREATE TABLE IF NOT EXISTS employee_salary_components (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    component_id uuid NOT NULL REFERENCES salary_components(id) ON DELETE CASCADE,

    amount numeric(12, 2),
    is_active boolean NOT NULL DEFAULT true,
    effective_from date NOT NULL DEFAULT CURRENT_DATE,
    effective_to date,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_employee_salary_components
    ON employee_salary_components (employee_id, component_id);

CREATE INDEX IF NOT EXISTS idx_emp_salary_components_tenant_employee
    ON employee_salary_components (tenant_id, employee_id)
    WHERE is_active = true;

-- ────────────────────────────────────────────────────────────────────────
-- Tenant-alignment trigger
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enforce_emp_salary_component_tenant_alignment()
RETURNS TRIGGER AS $$
DECLARE
    emp_tenant uuid;
    comp_tenant uuid;
BEGIN
    SELECT tenant_id INTO emp_tenant FROM employees WHERE id = NEW.employee_id;
    SELECT tenant_id INTO comp_tenant FROM salary_components WHERE id = NEW.component_id;

    IF emp_tenant IS NULL THEN
        RAISE EXCEPTION 'employee_salary_components.employee_id % does not exist', NEW.employee_id;
    END IF;
    IF comp_tenant IS NULL THEN
        RAISE EXCEPTION 'employee_salary_components.component_id % does not exist', NEW.component_id;
    END IF;
    IF NEW.tenant_id <> emp_tenant THEN
        RAISE EXCEPTION 'employee_salary_components.tenant_id % does not match employee tenant %', NEW.tenant_id, emp_tenant;
    END IF;
    IF NEW.tenant_id <> comp_tenant THEN
        RAISE EXCEPTION 'employee_salary_components.tenant_id % does not match component tenant %', NEW.tenant_id, comp_tenant;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_emp_salary_components_tenant_alignment ON employee_salary_components;
CREATE TRIGGER trg_emp_salary_components_tenant_alignment
    BEFORE INSERT OR UPDATE OF tenant_id, employee_id, component_id ON employee_salary_components
    FOR EACH ROW
    EXECUTE FUNCTION enforce_emp_salary_component_tenant_alignment();

-- ────────────────────────────────────────────────────────────────────────
-- Backfill — convert existing static earnings into assignments
-- ────────────────────────────────────────────────────────────────────────
-- For every employee that has a non-null/non-zero basic / housing /
-- transport / other allowance, create an assignment pointing at the
-- corresponding catalog row. Matches by (tenant_id, kind='earning', category).
--
-- Housing & transport are stored as flat AED amounts in the legacy columns
-- even when the catalog default is a percentage; the assignment's amount
-- column takes precedence per the resolver's rules, so payroll keeps
-- producing the same per-employee gross it did before this migration.
--
-- otherAllowances has no fixed catalog mapping; we look for the tenant's
-- "Other Allowance" or "Custom Allowance" component if one exists, else
-- skip the row (the static column remains the source until HR creates a
-- component for it).

INSERT INTO employee_salary_components (tenant_id, employee_id, component_id, amount, is_active, effective_from)
SELECT
    e.tenant_id,
    e.id,
    sc.id,
    e.basic_salary,
    true,
    COALESCE(e.join_date, CURRENT_DATE)
FROM employees e
JOIN salary_components sc
    ON sc.tenant_id = e.tenant_id
   AND sc.kind = 'earning'
   AND sc.category = 'basic'
WHERE e.is_archived = false
  AND e.basic_salary IS NOT NULL
  AND e.basic_salary::numeric > 0
ON CONFLICT (employee_id, component_id) DO NOTHING;

INSERT INTO employee_salary_components (tenant_id, employee_id, component_id, amount, is_active, effective_from)
SELECT
    e.tenant_id, e.id, sc.id, e.housing_allowance, true, COALESCE(e.join_date, CURRENT_DATE)
FROM employees e
JOIN salary_components sc
    ON sc.tenant_id = e.tenant_id
   AND sc.kind = 'earning'
   AND sc.category = 'housing'
WHERE e.is_archived = false
  AND e.housing_allowance IS NOT NULL
  AND e.housing_allowance::numeric > 0
ON CONFLICT (employee_id, component_id) DO NOTHING;

INSERT INTO employee_salary_components (tenant_id, employee_id, component_id, amount, is_active, effective_from)
SELECT
    e.tenant_id, e.id, sc.id, e.transport_allowance, true, COALESCE(e.join_date, CURRENT_DATE)
FROM employees e
JOIN salary_components sc
    ON sc.tenant_id = e.tenant_id
   AND sc.kind = 'earning'
   AND sc.category = 'transport'
WHERE e.is_archived = false
  AND e.transport_allowance IS NOT NULL
  AND e.transport_allowance::numeric > 0
ON CONFLICT (employee_id, component_id) DO NOTHING;

-- otherAllowances → first match on 'custom_allowance' for the tenant
INSERT INTO employee_salary_components (tenant_id, employee_id, component_id, amount, is_active, effective_from)
SELECT DISTINCT ON (e.id)
    e.tenant_id, e.id, sc.id, e.other_allowances, true, COALESCE(e.join_date, CURRENT_DATE)
FROM employees e
JOIN salary_components sc
    ON sc.tenant_id = e.tenant_id
   AND sc.kind = 'earning'
   AND sc.category = 'custom_allowance'
WHERE e.is_archived = false
  AND e.other_allowances IS NOT NULL
  AND e.other_allowances::numeric > 0
ON CONFLICT (employee_id, component_id) DO NOTHING;
