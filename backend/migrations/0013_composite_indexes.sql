-- ─── Composite indexes for high-frequency filter patterns ─────────────────────
-- Every multi-tenant list query filters by tenant_id + a second column.
-- Single-column tenant indexes exist; these composites cut query cost to O(log n).

-- payroll_runs: list by status, list by year+month
CREATE INDEX IF NOT EXISTS "idx_payroll_tenant_status"
    ON "payroll_runs" ("tenant_id", "status");

CREATE INDEX IF NOT EXISTS "idx_payroll_tenant_year_month"
    ON "payroll_runs" ("tenant_id", "year", "month");

-- payslips: per-employee history, per-run lookup
CREATE INDEX IF NOT EXISTS "idx_payslips_tenant_employee"
    ON "payslips" ("tenant_id", "employee_id");

CREATE INDEX IF NOT EXISTS "idx_payslips_tenant_run"
    ON "payslips" ("tenant_id", "payroll_run_id");

-- visa_applications: dashboard KPI by status, urgency board, expiry sweeper
CREATE INDEX IF NOT EXISTS "idx_visa_tenant_status"
    ON "visa_applications" ("tenant_id", "status");

CREATE INDEX IF NOT EXISTS "idx_visa_tenant_urgency"
    ON "visa_applications" ("tenant_id", "urgency_level");

CREATE INDEX IF NOT EXISTS "idx_visa_expiry"
    ON "visa_applications" ("expiry_date");

-- documents: category filter, status filter, per-employee documents
CREATE INDEX IF NOT EXISTS "idx_documents_tenant_category"
    ON "documents" ("tenant_id", "category");

CREATE INDEX IF NOT EXISTS "idx_documents_tenant_status"
    ON "documents" ("tenant_id", "status");

CREATE INDEX IF NOT EXISTS "idx_documents_tenant_employee"
    ON "documents" ("tenant_id", "employee_id");

-- recruitment_jobs: open jobs by tenant
CREATE INDEX IF NOT EXISTS "idx_jobs_tenant_status"
    ON "recruitment_jobs" ("tenant_id", "status");

-- job_applications: pipeline board by stage, per-job pipeline
CREATE INDEX IF NOT EXISTS "idx_applications_tenant_stage"
    ON "job_applications" ("tenant_id", "stage");

CREATE INDEX IF NOT EXISTS "idx_applications_job_stage"
    ON "job_applications" ("job_id", "stage");

-- activity_logs: audit log range queries (tenant + date)
CREATE INDEX IF NOT EXISTS "idx_activity_logs_tenant_created"
    ON "activity_logs" ("tenant_id", "created_at" DESC);

-- login_history: per-user login timeline
CREATE INDEX IF NOT EXISTS "idx_login_history_user_created"
    ON "login_history" ("user_id", "created_at" DESC);
