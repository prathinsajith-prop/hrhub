-- Add foreign key constraints for employee org-unit linkage fields.
-- Uses SET NULL so deleting a division/department/branch doesn't cascade-delete employees.

ALTER TABLE employees
  ADD CONSTRAINT fk_employees_division
    FOREIGN KEY (division_id)
    REFERENCES org_units(id)
    ON DELETE SET NULL;

ALTER TABLE employees
  ADD CONSTRAINT fk_employees_department
    FOREIGN KEY (department_id)
    REFERENCES org_units(id)
    ON DELETE SET NULL;

ALTER TABLE employees
  ADD CONSTRAINT fk_employees_branch
    FOREIGN KEY (branch_id)
    REFERENCES org_units(id)
    ON DELETE SET NULL;
