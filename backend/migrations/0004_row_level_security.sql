-- Migration: 0004_row_level_security
-- Enables PostgreSQL Row-Level Security (RLS) on all tenant-scoped tables.
-- Each policy restricts rows to the current tenant, identified by:
--   current_setting('app.current_tenant', true)
-- This setting is applied per-transaction by the application layer before any query.

-- ─── Enable RLS on all tenant-scoped tables ──────────────────────────────────

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE visa_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE recruitment_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE exit_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;

-- ─── RLS Policies ────────────────────────────────────────────────────────────
-- Each policy uses the session-local setting app.current_tenant (set per-request
-- by the application) to isolate rows per tenant.
-- BYPASSRLS is granted to the DB superuser only — the app user is restricted.

CREATE POLICY tenant_isolation ON employees
    USING (tenant_id::text = current_setting('app.current_tenant', true));

CREATE POLICY tenant_isolation ON users
    USING (tenant_id::text = current_setting('app.current_tenant', true));

CREATE POLICY tenant_isolation ON leave_requests
    USING (tenant_id::text = current_setting('app.current_tenant', true));

CREATE POLICY tenant_isolation ON payroll_runs
    USING (tenant_id::text = current_setting('app.current_tenant', true));

CREATE POLICY tenant_isolation ON payslips
    USING (tenant_id::text = current_setting('app.current_tenant', true));

CREATE POLICY tenant_isolation ON visa_applications
    USING (tenant_id::text = current_setting('app.current_tenant', true));

CREATE POLICY tenant_isolation ON documents
    USING (tenant_id::text = current_setting('app.current_tenant', true));

CREATE POLICY tenant_isolation ON onboarding_records
    USING (tenant_id::text = current_setting('app.current_tenant', true));

CREATE POLICY tenant_isolation ON performance_reviews
    USING (tenant_id::text = current_setting('app.current_tenant', true));

CREATE POLICY tenant_isolation ON attendance_records
    USING (tenant_id::text = current_setting('app.current_tenant', true));

CREATE POLICY tenant_isolation ON recruitment_jobs
    USING (tenant_id::text = current_setting('app.current_tenant', true));

CREATE POLICY tenant_isolation ON interviews
    USING (tenant_id::text = current_setting('app.current_tenant', true));

CREATE POLICY tenant_isolation ON exit_requests
    USING (tenant_id::text = current_setting('app.current_tenant', true));

CREATE POLICY tenant_isolation ON notifications
    USING (tenant_id::text = current_setting('app.current_tenant', true));

CREATE POLICY tenant_isolation ON audit_logs
    USING (tenant_id::text = current_setting('app.current_tenant', true));

CREATE POLICY tenant_isolation ON document_templates
    USING (tenant_id::text = current_setting('app.current_tenant', true));

CREATE POLICY tenant_isolation ON entities
    USING (tenant_id::text = current_setting('app.current_tenant', true));
