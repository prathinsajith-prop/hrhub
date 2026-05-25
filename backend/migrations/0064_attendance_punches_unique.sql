-- Hard-guarantee no duplicate punches at the DB level.
--
-- The service layer (`recordPunch` in attendance.service.ts) already
-- pre-checks for an identical (employeeId, recordedAt, punchType) row and
-- returns the existing one instead of inserting. But two HR users running
-- the same bulk-import in parallel can still slip past that check (both
-- read "nothing exists" between SELECT and INSERT). This unique index
-- closes the race: the loser gets a 23505, which the service layer can
-- treat the same as the pre-check duplicate path.
--
-- Why these three columns:
--   - tenant_id      → multi-tenant isolation (same triple in different
--                       tenants is independent)
--   - employee_id    → one employee's day is independent of another's
--   - recorded_at    → exact wall-clock timestamp (the operative key)
--   - punch_type     → an 'in' and an 'out' at the same instant are
--                       distinct events (rare but possible — e.g. shift
--                       swap meetings)
--
-- We pre-delete any existing duplicates so the index can be created. The
-- delete keeps the OLDEST row per duplicate group (by created_at) so the
-- audit trail's first record wins.

WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY tenant_id, employee_id, recorded_at, punch_type
               ORDER BY created_at ASC, id ASC
           ) AS rn
    FROM attendance_punches
)
DELETE FROM attendance_punches
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_attendance_punches_triple"
    ON "attendance_punches"("tenant_id", "employee_id", "recorded_at", "punch_type");
