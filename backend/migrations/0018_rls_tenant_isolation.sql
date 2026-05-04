-- ─────────────────────────────────────────────────────────────────────────────
-- 0018_rls_tenant_isolation
-- Enables PostgreSQL Row-Level Security on all tenant-scoped tables as a
-- database-level defense-in-depth layer. The policy is intentionally
-- PERMISSIVE when app.current_tenant is not set (preserving existing behavior
-- for migrations and direct queries) and RESTRICTIVE when the session variable
-- IS set (enforced via withTenantContext in application code).
--
-- Policy semantics:
--   • app.current_tenant NOT set → no restriction (existing behavior, safe for migrations)
--   • app.current_tenant IS set  → only rows whose tenant_id matches are visible
--
-- Once all service calls are wrapped in withTenantContext() the NULL-passthrough
-- can be removed to enforce strict isolation at the DB layer.
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper: Returns TRUE when no tenant context is active (migration/admin path)
-- or when the row's tenant_id matches the active context.
-- Cast is safe: the app always writes valid UUIDs.
CREATE OR REPLACE FUNCTION app_tenant_id() RETURNS uuid AS $$
    SELECT NULLIF(current_setting('app.current_tenant', true), '')::uuid;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ─── Macro to add RLS in one shot ────────────────────────────────────────────
-- We inline it per table because PostgreSQL requires explicit table references
-- in each CREATE POLICY statement.

-- ── employees ────────────────────────────────────────────────────────────────
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON employees;
CREATE POLICY tenant_isolation ON employees
    USING (app_tenant_id() IS NULL OR tenant_id = app_tenant_id())
    WITH CHECK (app_tenant_id() IS NULL OR tenant_id = app_tenant_id());

-- ── users ─────────────────────────────────────────────────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON users;
CREATE POLICY tenant_isolation ON users
    USING (app_tenant_id() IS NULL OR tenant_id = app_tenant_id())
    WITH CHECK (app_tenant_id() IS NULL OR tenant_id = app_tenant_id());

-- ── payroll_runs ──────────────────────────────────────────────────────────────
ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON payroll_runs;
CREATE POLICY tenant_isolation ON payroll_runs
    USING (app_tenant_id() IS NULL OR tenant_id = app_tenant_id())
    WITH CHECK (app_tenant_id() IS NULL OR tenant_id = app_tenant_id());

-- ── payslips ──────────────────────────────────────────────────────────────────
ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON payslips;
CREATE POLICY tenant_isolation ON payslips
    USING (app_tenant_id() IS NULL OR tenant_id = app_tenant_id())
    WITH CHECK (app_tenant_id() IS NULL OR tenant_id = app_tenant_id());

-- ── documents ─────────────────────────────────────────────────────────────────
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON documents;
CREATE POLICY tenant_isolation ON documents
    USING (app_tenant_id() IS NULL OR tenant_id = app_tenant_id())
    WITH CHECK (app_tenant_id() IS NULL OR tenant_id = app_tenant_id());

-- ── leave_requests ────────────────────────────────────────────────────────────
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON leave_requests;
CREATE POLICY tenant_isolation ON leave_requests
    USING (app_tenant_id() IS NULL OR tenant_id = app_tenant_id())
    WITH CHECK (app_tenant_id() IS NULL OR tenant_id = app_tenant_id());

-- ── visa_applications ─────────────────────────────────────────────────────────
ALTER TABLE visa_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON visa_applications;
CREATE POLICY tenant_isolation ON visa_applications
    USING (app_tenant_id() IS NULL OR tenant_id = app_tenant_id())
    WITH CHECK (app_tenant_id() IS NULL OR tenant_id = app_tenant_id());

-- ── exit_requests ─────────────────────────────────────────────────────────────
ALTER TABLE exit_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON exit_requests;
CREATE POLICY tenant_isolation ON exit_requests
    USING (app_tenant_id() IS NULL OR tenant_id = app_tenant_id())
    WITH CHECK (app_tenant_id() IS NULL OR tenant_id = app_tenant_id());

-- ── activity_logs ─────────────────────────────────────────────────────────────
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON activity_logs;
CREATE POLICY tenant_isolation ON activity_logs
    USING (app_tenant_id() IS NULL OR tenant_id = app_tenant_id())
    WITH CHECK (app_tenant_id() IS NULL OR tenant_id = app_tenant_id());

-- ── notifications ─────────────────────────────────────────────────────────────
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON notifications;
CREATE POLICY tenant_isolation ON notifications
    USING (app_tenant_id() IS NULL OR tenant_id = app_tenant_id())
    WITH CHECK (app_tenant_id() IS NULL OR tenant_id = app_tenant_id());

-- ── salary_revisions ──────────────────────────────────────────────────────────
ALTER TABLE salary_revisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON salary_revisions;
CREATE POLICY tenant_isolation ON salary_revisions
    USING (app_tenant_id() IS NULL OR tenant_id = app_tenant_id())
    WITH CHECK (app_tenant_id() IS NULL OR tenant_id = app_tenant_id());

-- ── performance_reviews ───────────────────────────────────────────────────────
ALTER TABLE performance_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON performance_reviews;
CREATE POLICY tenant_isolation ON performance_reviews
    USING (app_tenant_id() IS NULL OR tenant_id = app_tenant_id())
    WITH CHECK (app_tenant_id() IS NULL OR tenant_id = app_tenant_id());

-- ── complaints ────────────────────────────────────────────────────────────────
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON complaints;
CREATE POLICY tenant_isolation ON complaints
    USING (app_tenant_id() IS NULL OR tenant_id = app_tenant_id())
    WITH CHECK (app_tenant_id() IS NULL OR tenant_id = app_tenant_id());

-- ── attendance_records ────────────────────────────────────────────────────────
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON attendance_records;
CREATE POLICY tenant_isolation ON attendance_records
    USING (app_tenant_id() IS NULL OR tenant_id = app_tenant_id())
    WITH CHECK (app_tenant_id() IS NULL OR tenant_id = app_tenant_id());

-- ── employee_loans ────────────────────────────────────────────────────────────
ALTER TABLE employee_loans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON employee_loans;
CREATE POLICY tenant_isolation ON employee_loans
    USING (app_tenant_id() IS NULL OR tenant_id = app_tenant_id())
    WITH CHECK (app_tenant_id() IS NULL OR tenant_id = app_tenant_id());

-- ── training_records ──────────────────────────────────────────────────────────
ALTER TABLE training_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON training_records;
CREATE POLICY tenant_isolation ON training_records
    USING (app_tenant_id() IS NULL OR tenant_id = app_tenant_id())
    WITH CHECK (app_tenant_id() IS NULL OR tenant_id = app_tenant_id());
