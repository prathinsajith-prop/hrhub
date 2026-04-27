-- Org structure: divisions, departments, branches
-- Self-referential so a department can live under a division, branch under division, etc.

CREATE TABLE IF NOT EXISTS org_units (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            TEXT        NOT NULL,
    code            TEXT,
    type            TEXT        NOT NULL CHECK (type IN ('division', 'department', 'branch')),
    parent_id       UUID        REFERENCES org_units(id) ON DELETE SET NULL,
    head_employee_id UUID       REFERENCES employees(id) ON DELETE SET NULL,
    description     TEXT,
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    sort_order      INTEGER     NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_units_tenant ON org_units(tenant_id);
CREATE INDEX IF NOT EXISTS idx_org_units_parent ON org_units(parent_id);
CREATE INDEX IF NOT EXISTS idx_org_units_type   ON org_units(tenant_id, type);

-- Add org unit FK columns to employees
ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS division_id   UUID REFERENCES org_units(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES org_units(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS branch_id     UUID REFERENCES org_units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employees_division   ON employees(tenant_id, division_id)   WHERE division_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(tenant_id, department_id) WHERE department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employees_branch     ON employees(tenant_id, branch_id)     WHERE branch_id IS NOT NULL;
