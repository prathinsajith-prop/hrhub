-- Seed an "Other Allowance" component for every tenant that doesn't have
-- one yet, then backfill assignments from employees.other_allowances.
--
-- Migration 0044's backfill tried to map `other_allowances` to a
-- `custom_allowance` component but the seed defaults (migration 0043
-- conceptually) didn't include one, so for every employee with a non-zero
-- other_allowances value the assignment never got created and payroll
-- shorted the per-employee gross by that amount.
--
-- Idempotent: ON CONFLICT DO NOTHING on the seed step, and the backfill
-- is gated by NOT EXISTS so re-running is safe.

-- 1. Add an "Other Allowance" component to every tenant
INSERT INTO salary_components (
    tenant_id, kind, category, name, name_in_payslip,
    pay_type, calculation_type,
    applicable_social_security, pro_rata,
    is_active, is_system
)
SELECT
    t.id,
    'earning', 'custom_allowance',
    'Other Allowance', 'Other Allowance',
    'fixed', 'flat',
    '["GPSSA","ADPF","SIO","SPF","PIFSS"]'::jsonb,
    true,
    true, false
FROM tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM salary_components sc
    WHERE sc.tenant_id = t.id
      AND sc.kind = 'earning'
      AND sc.category = 'custom_allowance'
);

-- 2. Backfill assignments for employees with a non-zero other_allowances.
-- Picks the tenant's first custom_allowance component (there's exactly one
-- after step 1).
INSERT INTO employee_salary_components (
    tenant_id, employee_id, component_id, amount, is_active, effective_from
)
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
