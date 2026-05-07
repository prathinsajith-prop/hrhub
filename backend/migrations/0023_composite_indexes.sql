-- 0023: Add missing composite (tenant_id, employee_id) indexes to employee sub-tables
-- and remaining tenant-scoped composites for multi-tenant query performance.

-- Employee sub-tables: listing by tenant+employee was doing a cross-tenant employee scan
CREATE INDEX IF NOT EXISTS "idx_emp_dependents_tenant_employee"  ON "employee_dependents" ("tenant_id", "employee_id");
CREATE INDEX IF NOT EXISTS "idx_emp_warnings_tenant_employee"    ON "employee_warnings"   ("tenant_id", "employee_id");
CREATE INDEX IF NOT EXISTS "idx_emp_notes_tenant_employee"       ON "employee_notes"      ("tenant_id", "employee_id");

-- Transfer history: tenant+employee composite for employee detail lookups
CREATE INDEX IF NOT EXISTS "idx_emp_transfers_tenant_employee"   ON "employee_transfers"  ("tenant_id", "employee_id");

-- Salary revisions: tenant+employee for history and filtering queries
CREATE INDEX IF NOT EXISTS "idx_salary_revisions_tenant_employee" ON "salary_revisions"  ("tenant_id", "employee_id");

-- Onboarding: listing all checklists within a tenant
CREATE INDEX IF NOT EXISTS "idx_onboarding_checklist_tenant"     ON "onboarding_checklists" ("tenant_id");

-- Asset maintenance: tenant+asset composite for maintenance history per asset
CREATE INDEX IF NOT EXISTS "idx_asset_maintenance_tenant_asset"  ON "asset_maintenance"  ("tenant_id", "asset_id");

-- Complaints: tenant+submittedBy for "My Complaints" employee view
CREATE INDEX IF NOT EXISTS "idx_complaints_submitted_tenant"     ON "complaints" ("tenant_id", "submitted_by_employee_id");

-- subscription_events: previously had zero indexes; tenant+createdAt covers history queries
CREATE INDEX IF NOT EXISTS "idx_subscription_events_tenant"      ON "subscription_events" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_subscription_events_tenant_time" ON "subscription_events" ("tenant_id", "created_at" DESC);

-- entities: previously had zero indexes
CREATE INDEX IF NOT EXISTS "idx_entities_tenant"                 ON "entities" ("tenant_id");
