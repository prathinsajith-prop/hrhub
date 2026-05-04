-- ─────────────────────────────────────────────────────────────────────────────
-- 0015_employment_type_probation
-- Moves probation from employee status to contract_type (employment type).
-- Employees with status='probation' become status='active' + contract_type='probation'.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE "employees"
SET
    "status"        = 'active',
    "contract_type" = 'probation'
WHERE "status" = 'probation';
