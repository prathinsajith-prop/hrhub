-- Migration: 0009_performance_indexes
--
-- Adds composite/partial indexes that speed up the most common query patterns
-- in the application: tenant-scoped date-range scans, FK lookups for foreign-key
-- joins, and partial indexes for hot filters (unread notifications, pending
-- exits, expiring documents). Every index is additive and reversible, so this
-- migration is safe to apply on a live database. CONCURRENTLY is intentionally
-- omitted because Drizzle's migrator runs each file in a single transaction;
-- run these statements manually with CONCURRENTLY in production if needed.

-- ── Attendance ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_attendance_tenant
    ON attendance_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_attendance_employee
    ON attendance_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_tenant_date
    ON attendance_records(tenant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_tenant_employee_date
    ON attendance_records(tenant_id, employee_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_tenant_status
    ON attendance_records(tenant_id, status);
-- Enforce one record per employee per day at the DB level.
CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_employee_date
    ON attendance_records(employee_id, date);

-- ── Leave Requests ──────────────────────────────────────────────────────────
-- Date-range scans (payroll, dashboards, reports) over active rows only.
CREATE INDEX IF NOT EXISTS idx_leave_requests_tenant_date_employee
    ON leave_requests(tenant_id, start_date, employee_id)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leave_requests_tenant_status
    ON leave_requests(tenant_id, status)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leave_requests_approved_by
    ON leave_requests(approved_by)
    WHERE approved_by IS NOT NULL;

-- ── Notifications ───────────────────────────────────────────────────────────
-- Unread counts per user are the hot query — partial index keeps it small.
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON notifications(user_id, created_at DESC)
    WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_created
    ON notifications(tenant_id, created_at DESC);

-- ── Audit / Activity Logs ───────────────────────────────────────────────────
-- Time-series queries by tenant + action.
CREATE INDEX IF NOT EXISTS idx_activity_logs_tenant_action_created
    ON activity_logs(tenant_id, action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_history_tenant_created
    ON login_history(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created
    ON audit_logs(tenant_id, created_at DESC);

-- ── Documents ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_documents_verified_by
    ON documents(verified_by)
    WHERE verified_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by
    ON documents(uploaded_by)
    WHERE uploaded_by IS NOT NULL;
-- Compliance dashboard: expiring/expired in a tenant.
CREATE INDEX IF NOT EXISTS idx_documents_tenant_expiry
    ON documents(tenant_id, expiry_date)
    WHERE deleted_at IS NULL AND expiry_date IS NOT NULL;

-- ── Document Versions ───────────────────────────────────────────────────────
-- Latest version lookup uses (document_id, version_number DESC).
CREATE INDEX IF NOT EXISTS idx_doc_versions_document_version
    ON document_versions(document_id, version_number DESC);

-- ── Exit Requests ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_exit_requests_tenant
    ON exit_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_exit_requests_employee
    ON exit_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_exit_requests_tenant_status
    ON exit_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_exit_requests_approved_by
    ON exit_requests(approved_by)
    WHERE approved_by IS NOT NULL;

-- ── Asset Assignments ───────────────────────────────────────────────────────
-- Open assignments (not yet returned) — the hot list.
CREATE INDEX IF NOT EXISTS idx_asset_assignments_tenant_open
    ON asset_assignments(tenant_id, employee_id)
    WHERE actual_return_date IS NULL;
CREATE INDEX IF NOT EXISTS idx_asset_assignments_assigned_by
    ON asset_assignments(assigned_by)
    WHERE assigned_by IS NOT NULL;

-- ── Recruitment ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_job_applications_tenant_stage_applied
    ON job_applications(tenant_id, stage, applied_date DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_recruitment_jobs_tenant_status
    ON recruitment_jobs(tenant_id, status)
    WHERE deleted_at IS NULL;

-- ── Payslips ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_payslips_tenant_employee
    ON payslips(tenant_id, employee_id);

-- ── Refresh / Password Reset Tokens ─────────────────────────────────────────
-- Used by the cron sweeper that purges expired tokens.
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires
    ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires
    ON password_reset_tokens(expires_at);

-- ── Connected Apps ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_connected_apps_last_used
    ON connected_apps(tenant_id, last_used_at DESC)
    WHERE status = 'active';

-- Refresh planner statistics so new indexes are picked up immediately.
ANALYZE attendance_records;
ANALYZE leave_requests;
ANALYZE notifications;
ANALYZE activity_logs;
ANALYZE login_history;
ANALYZE audit_logs;
ANALYZE documents;
ANALYZE document_versions;
ANALYZE exit_requests;
ANALYZE asset_assignments;
ANALYZE job_applications;
ANALYZE recruitment_jobs;
ANALYZE payslips;
ANALYZE refresh_tokens;
ANALYZE password_reset_tokens;
ANALYZE connected_apps;
