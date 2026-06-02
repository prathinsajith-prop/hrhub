-- Composite (tenant_id, created_at[, id]) indexes for the hot paginated lists.
-- Each list filters by tenant and orders by created_at DESC (with an id tie-break
-- on the audit lists). Postgres scans these ascending indexes backwards, so the
-- filter + sort is served from one index with no separate sort step — a real win
-- on deep pagination over large tenants.
CREATE INDEX IF NOT EXISTS "idx_activity_logs_tenant_created" ON "activity_logs" ("tenant_id", "created_at", "id");
CREATE INDEX IF NOT EXISTS "idx_login_history_tenant_created" ON "login_history" ("tenant_id", "created_at", "id");
CREATE INDEX IF NOT EXISTS "idx_applications_tenant_created" ON "job_applications" ("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_jobs_tenant_created" ON "recruitment_jobs" ("tenant_id", "created_at");
