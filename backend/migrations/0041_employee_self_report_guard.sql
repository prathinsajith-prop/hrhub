-- Stop employees from reporting to themselves.
--
-- A self-referential `reporting_to` row (employee_id = reporting_to)
-- broke the recursive CTE used for team-list scoping in both the portal
-- (lib/scoping.ts) and the main backend (employees.service.ts). With
-- `UNION ALL` and no cycle guard the walk never terminated, Neon's
-- statement_timeout fired, and every protected endpoint started
-- returning 500/401 for the affected manager.
--
-- The application CTEs have been hardened with a path-array cycle
-- guard and a depth cap of 50, but data should also enforce the
-- invariant — a self-loop is meaningless and almost certainly a UI bug
-- or seed-data mistake. CHECK is enforced at INSERT and UPDATE time.

-- 1. Clean up existing corruption (1 known row in the current dataset)
UPDATE employees SET reporting_to = NULL WHERE reporting_to = id;

-- 2. Prevent future occurrences
ALTER TABLE employees
    DROP CONSTRAINT IF EXISTS employees_no_self_report,
    ADD  CONSTRAINT employees_no_self_report CHECK (reporting_to IS NULL OR reporting_to <> id);
