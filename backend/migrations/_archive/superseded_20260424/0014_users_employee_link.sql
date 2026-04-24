-- 0014_users_employee_link.sql
-- Connect the auth identity (users) to the HR record (employees) with a
-- proper foreign key, replacing the brittle "match by email" lookup that
-- leave/approval flows have been doing.
--
-- DESIGN
-- ──────
-- 1. users.employee_id is NULLABLE because not every user is an employee
--    (super_admin, support staff, integration accounts, parent-company
--    auditors). RLS isolation still applies tenant-wise.
-- 2. UNIQUE WHERE NOT NULL guarantees one user per employee — an employee
--    cannot have two login accounts in the same tenant.
-- 3. ON DELETE SET NULL: deleting an employee record (rare, GDPR-only)
--    keeps the user row for audit history and revokes their portal access
--    by detaching the link. The application also flips users.is_active.
-- 4. Backfill matches users to employees within the same tenant on
--    LOWER(email). Existing email-based heuristic stays correct after
--    backfill but no longer needs to run on every leave action.

-- Add the column.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS employee_id uuid;

-- Backfill: each tenant's user.email matches its employee.email (or
-- employee.work_email) case-insensitively. Use a CTE so we update each
-- user at most once even if both columns matched.
WITH ranked AS (
    SELECT
        u.id  AS user_id,
        e.id  AS employee_id,
        ROW_NUMBER() OVER (PARTITION BY u.id ORDER BY e.created_at) AS rn
    FROM users u
    JOIN employees e
      ON e.tenant_id = u.tenant_id
     AND (
            LOWER(e.email)      = LOWER(u.email)
         OR LOWER(e.work_email) = LOWER(u.email)
     )
    WHERE u.employee_id IS NULL
      AND e.is_archived = false
)
UPDATE users u
SET    employee_id = r.employee_id,
       updated_at = now()
FROM   ranked r
WHERE  u.id = r.user_id
  AND  r.rn = 1;

-- FK constraint. NOT VALID first so the migration is non-blocking on big
-- tables, then VALIDATE in the same migration so we still fail loudly if
-- backfill missed something.
ALTER TABLE users
    DROP CONSTRAINT IF EXISTS fk_users_employee;

ALTER TABLE users
    ADD CONSTRAINT fk_users_employee
        FOREIGN KEY (employee_id)
        REFERENCES employees(id)
        ON DELETE SET NULL
        DEFERRABLE INITIALLY DEFERRED
        NOT VALID;

ALTER TABLE users VALIDATE CONSTRAINT fk_users_employee;

-- Each employee can be linked to at most one user account.
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_employee_id
    ON users (employee_id)
    WHERE employee_id IS NOT NULL;

-- Common lookup: "find the user that owns this employee record".
CREATE INDEX IF NOT EXISTS idx_users_tenant_employee
    ON users (tenant_id, employee_id)
    WHERE employee_id IS NOT NULL;

ANALYZE users;
