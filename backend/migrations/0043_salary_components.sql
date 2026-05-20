-- Salary Components — tenant-wide catalog of earning / deduction / benefit /
-- correction definitions. The catalog is the DEFINITION layer; runtime
-- payroll uses payroll_adjustments (migration 0038) as the EXECUTION layer.
--
-- A component is just a reusable template: "Housing Allowance is a fixed
-- earning, 25% of basic, pro-rata, counts toward GPSSA and ADPF". HR creates
-- the template once; per-employee amounts can still be overridden via the
-- existing payroll_adjustments path or via the employee's salary fields.
--
-- Why one table for all four kinds (earning/deduction/benefit/correction):
-- they share most fields (name, payslip label, status, audit). Splitting
-- into four tables would duplicate the CRUD plumbing four times for no real
-- gain — `kind` discriminates and we add per-kind validation in the service.

CREATE TABLE IF NOT EXISTS salary_components (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Kind: which of the four tabs this component appears under in the UI.
    -- Drives form fields shown + downstream behaviour.
    kind text NOT NULL CHECK (kind IN ('earning', 'deduction', 'benefit', 'correction')),

    -- Sub-category. Earning: basic / housing / transport / cost_of_living /
    --   children_social / social / custom_allowance.
    -- Deduction: withheld_salary / salary_advance / fines_damages / notice_pay / custom.
    -- Benefit:   medical_insurance / custom.
    -- Correction: bonus / commission / leave_encashment / notice_pay /
    --   annual_leave_salary / custom.
    category text NOT NULL,

    -- Display
    name text NOT NULL,                          -- "Housing Allowance"
    name_in_payslip text NOT NULL,               -- printed on the payslip
    name_in_payslip_ar text,                     -- Arabic variant (optional)

    -- ── Earning-only attributes ──────────────────────────────────────────
    -- payType: 'fixed' (paid every month) | 'variable' (per-payroll)
    pay_type text CHECK (pay_type IS NULL OR pay_type IN ('fixed', 'variable')),
    -- calculationType: 'flat' (absolute AED amount) | 'percentage_of_basic'
    calculation_type text CHECK (calculation_type IS NULL OR calculation_type IN ('flat', 'percentage_of_basic')),
    -- Default amount or percentage. Stored as numeric — interpretation depends
    -- on calculation_type (AED for flat, percentage value 0-100 for percentage).
    amount numeric(12, 2),
    pro_rata boolean NOT NULL DEFAULT true,

    -- Applicable social-security schemes (GCC contribution schemes that this
    -- earning is included in). Stored as a JSONB array of code strings so we
    -- can add schemes without a schema change. Empty for non-earnings.
    applicable_social_security jsonb NOT NULL DEFAULT '[]'::jsonb,

    -- ── Deduction / Benefit attributes ──────────────────────────────────
    -- 'one_time' (single payroll run) | 'recurring' (every payroll until inactive)
    frequency text CHECK (frequency IS NULL OR frequency IN ('one_time', 'recurring')),

    -- ── Status + audit ──────────────────────────────────────────────────
    is_active boolean NOT NULL DEFAULT true,
    -- Seeded "Basic", "Housing Allowance" etc. are system rows — UI hides the
    -- Delete button for these so HR can't break payroll inadvertently.
    is_system boolean NOT NULL DEFAULT false,

    created_by uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- One component name per (tenant, kind). "Housing Allowance" as an earning
-- and "Housing Allowance" as a deduction is allowed (different kinds), but
-- two earnings both called "Housing Allowance" is not.
CREATE UNIQUE INDEX IF NOT EXISTS uq_salary_components_tenant_kind_name
    ON salary_components (tenant_id, kind, lower(name));

CREATE INDEX IF NOT EXISTS idx_salary_components_tenant_kind
    ON salary_components (tenant_id, kind)
    WHERE is_active = true;
