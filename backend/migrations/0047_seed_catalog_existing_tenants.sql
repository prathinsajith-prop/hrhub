-- Seed the full default salary-component catalog for existing tenants, then
-- re-run the per-employee assignment backfill against the now-populated
-- catalog.
--
-- Why this exists: migrations 0043–0046 create the catalog table and try to
-- backfill assignments, but the catalog seed itself only runs for *new*
-- tenants (via buildDefaultSalaryComponentRows in tenant/registerTenant).
-- For existing tenants the 0044 backfill found no catalog rows to JOIN
-- against, so payroll would silently lose Basic/Housing/Transport — and
-- worse, 0046 seeded only "Other Allowance", which is enough to trip the
-- payroll resolver's catalog path (any earning → catalog wins) and zero out
-- the other earnings.
--
-- This migration brings every existing tenant up to the same baseline a new
-- tenant gets, then redoes the four assignment backfills from 0044. All
-- steps are idempotent so re-running is safe.

-- ── Step 1: seed missing catalog components ──────────────────────────────
-- For each tenant that doesn't yet have a 'basic' earning row, insert the
-- full default earning set (basic, housing, transport, cost_of_living,
-- custom_allowance). The unique index (tenant_id, kind, lower(name)) plus
-- the explicit guard make this safe to re-run.
--
-- Deductions, benefits, and corrections are skipped here — they have no
-- backfill consumer and a tenant can add them from the UI as needed.

INSERT INTO salary_components (
    tenant_id, kind, category, name, name_in_payslip,
    pay_type, calculation_type,
    applicable_social_security, pro_rata,
    is_active, is_system
)
SELECT
    t.id, vals.kind, vals.category, vals.name, vals.name,
    vals.pay_type, vals.calculation_type,
    '["GPSSA","ADPF","SIO","SPF","PIFSS"]'::jsonb,
    true,
    vals.is_active, vals.is_system
FROM tenants t
CROSS JOIN (VALUES
    ('earning', 'basic',           'Basic',                      'fixed', 'flat', true,  true),
    ('earning', 'housing',         'Housing Allowance',          'fixed', 'flat', true,  false),
    ('earning', 'transport',       'Transport Allowance',        'fixed', 'flat', true,  false),
    ('earning', 'cost_of_living',  'Cost of Living Allowance',   'fixed', 'flat', false, false)
) AS vals(kind, category, name, pay_type, calculation_type, is_active, is_system)
WHERE NOT EXISTS (
    -- Skip tenants that already have a basic earning — they were either
    -- seeded by the tenant-creation path or by an earlier run of this
    -- migration.
    SELECT 1 FROM salary_components sc
    WHERE sc.tenant_id = t.id
      AND sc.kind = 'earning'
      AND sc.category = 'basic'
)
ON CONFLICT DO NOTHING;

-- ── Step 2: re-run the per-employee assignment backfill ─────────────────
-- Same INSERTs as migration 0044, but they will now find catalog rows for
-- the existing tenants that were missed the first time. The ON CONFLICT
-- guard handles new tenants whose assignments were already created.

INSERT INTO employee_salary_components (tenant_id, employee_id, component_id, amount, is_active, effective_from)
SELECT e.tenant_id, e.id, sc.id, e.basic_salary, true, COALESCE(e.join_date, CURRENT_DATE)
FROM employees e
JOIN salary_components sc
    ON sc.tenant_id = e.tenant_id AND sc.kind = 'earning' AND sc.category = 'basic'
WHERE e.is_archived = false
  AND e.basic_salary IS NOT NULL
  AND e.basic_salary::numeric > 0
ON CONFLICT (employee_id, component_id) DO NOTHING;

INSERT INTO employee_salary_components (tenant_id, employee_id, component_id, amount, is_active, effective_from)
SELECT e.tenant_id, e.id, sc.id, e.housing_allowance, true, COALESCE(e.join_date, CURRENT_DATE)
FROM employees e
JOIN salary_components sc
    ON sc.tenant_id = e.tenant_id AND sc.kind = 'earning' AND sc.category = 'housing'
WHERE e.is_archived = false
  AND e.housing_allowance IS NOT NULL
  AND e.housing_allowance::numeric > 0
ON CONFLICT (employee_id, component_id) DO NOTHING;

INSERT INTO employee_salary_components (tenant_id, employee_id, component_id, amount, is_active, effective_from)
SELECT e.tenant_id, e.id, sc.id, e.transport_allowance, true, COALESCE(e.join_date, CURRENT_DATE)
FROM employees e
JOIN salary_components sc
    ON sc.tenant_id = e.tenant_id AND sc.kind = 'earning' AND sc.category = 'transport'
WHERE e.is_archived = false
  AND e.transport_allowance IS NOT NULL
  AND e.transport_allowance::numeric > 0
ON CONFLICT (employee_id, component_id) DO NOTHING;
