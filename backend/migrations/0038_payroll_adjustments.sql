-- Unified payroll adjustments ledger.
--
-- Prior to this migration, the runPayroll engine read from three scattered
-- sources (employees table, approved leave_requests, hard-coded zeros for
-- overtime/commission) and the employee_loans module was a complete orphan
-- — its monthlyDeduction never reached a payslip.
--
-- This table is the single per-month, per-employee, per-line ledger that
-- runPayroll consumes. HR enters manual rows (overtime, commission, bonus,
-- manual deductions). syncAdjustmentsForPeriod() upserts rows from the
-- leave engine (LOP / sick-half-pay) and loan engine (per-month installment).
-- The UNIQUE constraint on (tenant, employee, year, month, category, source_ref)
-- guarantees idempotency for the automated sources — re-running sync is safe.
--
-- Postgres treats multiple NULLs as not-equal in a unique index, so HR can
-- still add multiple manual rows of the same category (e.g. two separate
-- bonuses) since their source_ref is NULL.

CREATE TABLE IF NOT EXISTS payroll_adjustments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    period_year integer NOT NULL,
    period_month integer NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    kind text NOT NULL CHECK (kind IN ('addition', 'deduction')),
    category text NOT NULL CHECK (category IN (
        'overtime', 'commission', 'bonus',
        'loan_repayment', 'salary_advance',
        'unpaid_leave', 'sick_half_pay',
        'manual'
    )),
    amount numeric(12, 2) NOT NULL,
    notes text,
    source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'leave_engine', 'loan_engine', 'expense_engine')),
    source_ref uuid,
    created_by uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_adj_tenant_period
    ON payroll_adjustments (tenant_id, period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_payroll_adj_tenant_employee_period
    ON payroll_adjustments (tenant_id, employee_id, period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_payroll_adj_source
    ON payroll_adjustments (source, source_ref)
    WHERE source_ref IS NOT NULL;

-- Idempotency for automated sources (leave + loan imports). Manual rows
-- always have NULL source_ref and Postgres allows arbitrarily many NULLs.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_adj_auto
    ON payroll_adjustments (tenant_id, employee_id, period_year, period_month, category, source_ref)
    WHERE source_ref IS NOT NULL;

-- Two more payslip columns so the breakdown UI can itemise loan repayments
-- and "other" manual deductions separately, instead of all of them collapsing
-- into the residual line. Total `deductions` column remains the canonical sum.
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS loan_deduction numeric(12, 2) NOT NULL DEFAULT '0';
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS other_deduction numeric(12, 2) NOT NULL DEFAULT '0';
