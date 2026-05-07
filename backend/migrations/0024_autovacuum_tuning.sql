-- 0024: Autovacuum tuning for high-churn tables
--
-- PostgreSQL's default autovacuum threshold is 20% dead tuples.
-- On large tables (100k+ rows) that is far too conservative — the table
-- must accumulate 20,000 dead tuples before vacuum fires.
-- Lowering autovacuum_vacuum_scale_factor to 1% means vacuum fires when
-- just 1% of the table is dead, keeping bloat small and query plans fresh.
--
-- Tables targeted:
--   notifications     — written every action, read every 60 s per user session
--   activity_logs     — insert-heavy audit trail, rarely deleted
--   leave_requests    — frequent status transitions (pending→approved→cancelled)
--   attendance_records — daily inserts + status updates
--   payslips          — batch-inserted on payroll run, then read-only
--
-- These ALTER TABLE statements are safe to run on a live database.

ALTER TABLE notifications      SET (autovacuum_vacuum_scale_factor = 0.01, autovacuum_analyze_scale_factor = 0.005);
ALTER TABLE activity_logs      SET (autovacuum_vacuum_scale_factor = 0.01, autovacuum_analyze_scale_factor = 0.005);
ALTER TABLE leave_requests     SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01);
ALTER TABLE attendance_records SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01);
ALTER TABLE payslips            SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01);
