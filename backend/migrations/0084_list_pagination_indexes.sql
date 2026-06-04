-- Scalability: composite (tenant_id, created_at) indexes for the high-volume
-- paginated list endpoints. Each of these lists runs
--   WHERE tenant_id = $1 [AND deleted_at IS NULL] ORDER BY created_at DESC LIMIT/OFFSET
-- and previously had only a single-column tenant index, forcing a sort on every
-- page. Postgres scans these ascending indexes backwards, so filter + sort is
-- served from one index — flat latency as a tenant's data grows.
--
-- Partial (WHERE deleted_at IS NULL) where the table is soft-deletable, so the
-- index stays small and never holds archived rows.

CREATE INDEX IF NOT EXISTS "idx_documents_tenant_created"           ON "documents"            ("tenant_id", "created_at") WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS "idx_leave_requests_tenant_created"      ON "leave_requests"       ("tenant_id", "created_at") WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS "idx_visa_applications_tenant_created"   ON "visa_applications"    ("tenant_id", "created_at") WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS "idx_performance_reviews_tenant_created" ON "performance_reviews"  ("tenant_id", "created_at") WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS "idx_payroll_adjustments_tenant_created" ON "payroll_adjustments"  ("tenant_id", "created_at") WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS "idx_complaints_tenant_created"          ON "complaints"           ("tenant_id", "created_at") WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS "idx_employee_loans_tenant_created"      ON "employee_loans"       ("tenant_id", "created_at") WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS "idx_travel_requests_tenant_created"     ON "travel_requests"      ("tenant_id", "created_at") WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS "idx_training_records_tenant_created"    ON "training_records"     ("tenant_id", "created_at") WHERE deleted_at IS NULL;

-- exit_requests has no deleted_at column — plain composite.
CREATE INDEX IF NOT EXISTS "idx_exit_requests_tenant_created"       ON "exit_requests"        ("tenant_id", "created_at");
