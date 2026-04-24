-- 0008_leave_policies.sql
-- Per-tenant leave policies + per-employee yearly balances with carry-forward.

CREATE TABLE IF NOT EXISTS leave_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    leave_type TEXT NOT NULL,
    days_per_year INTEGER NOT NULL DEFAULT 0,
    accrual_rule TEXT NOT NULL DEFAULT 'flat', -- 'flat' | 'monthly_2_then_30' | 'unlimited' | 'none'
    max_carry_forward INTEGER NOT NULL DEFAULT 0,
    carry_expires_after_months INTEGER NOT NULL DEFAULT 0, -- 0 = never
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, leave_type)
);
CREATE INDEX IF NOT EXISTS idx_leave_policies_tenant ON leave_policies(tenant_id);

CREATE TABLE IF NOT EXISTS leave_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type TEXT NOT NULL,
    year INTEGER NOT NULL,
    opening_balance NUMERIC(6,2) NOT NULL DEFAULT 0,
    accrued NUMERIC(6,2) NOT NULL DEFAULT 0,
    carried_forward NUMERIC(6,2) NOT NULL DEFAULT 0,
    carry_expires_on DATE,
    taken NUMERIC(6,2) NOT NULL DEFAULT 0,
    adjustment NUMERIC(6,2) NOT NULL DEFAULT 0, -- manual HR adjustments (+/-)
    closing_balance NUMERIC(6,2) NOT NULL DEFAULT 0,
    rolled_over_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, employee_id, leave_type, year)
);
CREATE INDEX IF NOT EXISTS idx_leave_balances_tenant ON leave_balances(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leave_balances_emp_year ON leave_balances(employee_id, year);

-- Seed default policies for every existing tenant (UAE Labour Law defaults)
INSERT INTO leave_policies (tenant_id, leave_type, days_per_year, accrual_rule, max_carry_forward, carry_expires_after_months)
SELECT t.id, x.leave_type, x.days_per_year, x.accrual_rule, x.max_carry_forward, x.carry_expires_after_months
FROM tenants t
CROSS JOIN (VALUES
    ('annual',        30,  'monthly_2_then_30', 15, 12),
    ('sick',          45,  'flat',               0,  0),
    ('maternity',     60,  'flat',               0,  0),
    ('paternity',      5,  'flat',               0,  0),
    ('compassionate',  5,  'flat',               0,  0),
    ('hajj',          30,  'flat',               0,  0),
    ('unpaid',         0,  'unlimited',          0,  0),
    ('public_holiday', 0,  'none',               0,  0)
) AS x(leave_type, days_per_year, accrual_rule, max_carry_forward, carry_expires_after_months)
ON CONFLICT (tenant_id, leave_type) DO NOTHING;
