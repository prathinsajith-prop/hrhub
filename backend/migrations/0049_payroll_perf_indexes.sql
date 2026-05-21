-- Performance indexes for the catalog-driven payroll path.
--
-- Three hot queries were doing seq scans on the new tables:
--   1. getPayrollReadiness — the NOT EXISTS subquery that excludes employees
--      with a real basic catalog assignment from the "missing salary" list.
--   2. loans.listLoans — the per-row correlated subqueries that aggregate
--      catalog basic + total earnings as a hint column.
--   3. getPayslipsByEmployee — the employee portal's payslip-history query
--      orders by year DESC, month DESC on a JOIN of payslips × payroll_runs.
--
-- All three filter by tenant + is_active + an earning-kind component. Adding
-- partial indexes (`WHERE is_active`) keeps the index small and skips the
-- inactive rows entirely.

-- 1) employee_salary_components — used by both readiness and loan list.
--    Composite covers the (employee_id, tenant_id, is_active) lookup pattern
--    and includes component_id so the join to salary_components can be an
--    index-only scan in the common case.
CREATE INDEX IF NOT EXISTS idx_emp_salary_components_active_lookup
    ON employee_salary_components (employee_id, tenant_id, component_id)
    WHERE is_active = true;

-- 2) salary_components — the inner side of every catalog join. The kind +
--    category + is_active filter is highly selective; this index lets the
--    planner skip non-earning rows entirely.
CREATE INDEX IF NOT EXISTS idx_salary_components_active_earnings
    ON salary_components (tenant_id, kind, category, id)
    WHERE is_active = true;

-- 3) payslips — getPayslipsByEmployee orders by payroll_runs.year DESC,
--    .month DESC. Already have a (tenant, employee) index from 0000_init,
--    but adding payroll_run_id to the projection lets the planner fetch the
--    join key without a heap visit.
CREATE INDEX IF NOT EXISTS idx_payslips_employee_run
    ON payslips (employee_id, tenant_id, payroll_run_id);
