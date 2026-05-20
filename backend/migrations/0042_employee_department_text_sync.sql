-- Backfill: realign `employees.department` text with `employees.department_id`
-- whenever the two have drifted.
--
-- Many views in the portal COALESCE(org_units.name, employees.department) for
-- display, so a stale text column doesn't normally surface — until the FK is
-- absent for a particular row, at which point the screen shows the stale
-- "aws"-style text instead of the canonical org-unit name. Transfers used to
-- update only the FK, never the text, so this drift accumulated. The matching
-- application-layer fix in employees.service.ts:updateEmployee and
-- transfers.service.ts:createTransfer now keeps the two in sync on every write.
--
-- Idempotent: only touches rows where the text value differs from the FK's
-- org_units.name. Safe to re-run.
UPDATE employees AS e
SET    department = ou.name,
       updated_at = now()
FROM   org_units AS ou
WHERE  e.department_id = ou.id
  AND  e.tenant_id     = ou.tenant_id
  AND  COALESCE(e.department, '') IS DISTINCT FROM ou.name;
