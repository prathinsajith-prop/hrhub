-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0069 — Exit-list progress indexes
--
-- The Exit Management list query (getExitRequests in modules/exit/exit.service.ts)
-- runs three correlated subqueries per row to surface the offboarding-flow
-- progress in the table:
--
--   clearanceTotal     — COUNT(*) FROM exit_clearance_items WHERE exit_request_id = …
--   clearanceCompleted — same WITH status IN ('completed','waived')
--   interviewSubmitted — EXISTS … FROM exit_interview_responses WHERE exit_request_id = …
--
-- Migration 0065 created composite indexes prefixed by (tenant_id, exit_request_id),
-- but the correlated subquery's WHERE clause only filters on exit_request_id,
-- so Postgres has to skip-scan or fall back to a less efficient path. A
-- dedicated single-column index on exit_request_id is cheap and keeps the
-- list query O(log n) per row.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_exit_clearance_items_exit_only
    ON exit_clearance_items(exit_request_id);

CREATE INDEX IF NOT EXISTS idx_exit_interview_responses_exit_only
    ON exit_interview_responses(exit_request_id);
