CREATE TABLE employee_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  transfer_date DATE NOT NULL,
  from_designation TEXT,
  from_department TEXT,
  from_branch_id UUID REFERENCES org_units(id) ON DELETE SET NULL,
  from_division_id UUID REFERENCES org_units(id) ON DELETE SET NULL,
  from_department_id UUID REFERENCES org_units(id) ON DELETE SET NULL,
  to_designation TEXT,
  to_department TEXT,
  to_branch_id UUID REFERENCES org_units(id) ON DELETE SET NULL,
  to_division_id UUID REFERENCES org_units(id) ON DELETE SET NULL,
  to_department_id UUID REFERENCES org_units(id) ON DELETE SET NULL,
  new_salary NUMERIC(12,2),
  reason TEXT,
  notes TEXT,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_emp_transfers_tenant ON employee_transfers(tenant_id);
CREATE INDEX idx_emp_transfers_employee ON employee_transfers(employee_id);
