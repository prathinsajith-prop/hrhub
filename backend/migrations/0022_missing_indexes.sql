-- ─────────────────────────────────────────────────────────────────────────────
-- 0022_missing_indexes
-- Adds composite tenant-scoped indexes to tables that were missing them.
-- Tables affected: performance_reviews, exit_requests, interviews,
-- leave_adjustments, air_tickets, leave_offsets, asset_assignments,
-- training_records, employee_loans.
--
-- All indexes are (tenant_id, …) — tenant_id leads every composite so the
-- planner can prune to a single tenant before filtering on any other column.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── performance_reviews ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "idx_perf_reviews_tenant"
    ON "performance_reviews" ("tenant_id");

CREATE INDEX IF NOT EXISTS "idx_perf_reviews_tenant_status"
    ON "performance_reviews" ("tenant_id", "status");

CREATE INDEX IF NOT EXISTS "idx_perf_reviews_tenant_employee"
    ON "performance_reviews" ("tenant_id", "employee_id");

-- Partial index: most queries exclude soft-deleted rows
CREATE INDEX IF NOT EXISTS "idx_perf_reviews_tenant_active"
    ON "performance_reviews" ("tenant_id", "employee_id")
    WHERE "deleted_at" IS NULL;

-- ── exit_requests ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "idx_exit_requests_tenant"
    ON "exit_requests" ("tenant_id");

CREATE INDEX IF NOT EXISTS "idx_exit_requests_tenant_status"
    ON "exit_requests" ("tenant_id", "status");

CREATE INDEX IF NOT EXISTS "idx_exit_requests_tenant_employee"
    ON "exit_requests" ("tenant_id", "employee_id");

-- ── interviews ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "idx_interviews_tenant"
    ON "interviews" ("tenant_id");

CREATE INDEX IF NOT EXISTS "idx_interviews_tenant_status"
    ON "interviews" ("tenant_id", "status");

CREATE INDEX IF NOT EXISTS "idx_interviews_tenant_application"
    ON "interviews" ("tenant_id", "application_id");

-- ── leave_adjustments — add (tenant_id, employee_id) composite ──────────────
CREATE INDEX IF NOT EXISTS "idx_leave_adj_tenant_employee"
    ON "leave_adjustments" ("tenant_id", "employee_id");

-- ── air_tickets — add composite indexes ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS "idx_air_tickets_tenant_employee"
    ON "air_tickets" ("tenant_id", "employee_id");

CREATE INDEX IF NOT EXISTS "idx_air_tickets_tenant_status"
    ON "air_tickets" ("tenant_id", "status");

-- ── leave_offsets — add composite indexes ────────────────────────────────────
CREATE INDEX IF NOT EXISTS "idx_leave_offsets_tenant_employee"
    ON "leave_offsets" ("tenant_id", "employee_id");

CREATE INDEX IF NOT EXISTS "idx_leave_offsets_tenant_status"
    ON "leave_offsets" ("tenant_id", "status");

-- ── asset_assignments — add (tenant_id, employee_id) and (tenant_id, status) ─
CREATE INDEX IF NOT EXISTS "idx_asset_assign_tenant_employee"
    ON "asset_assignments" ("tenant_id", "employee_id");

CREATE INDEX IF NOT EXISTS "idx_asset_assign_tenant_status"
    ON "asset_assignments" ("tenant_id", "status");

-- ── training_records — add (tenant_id, employee_id) composite ────────────────
CREATE INDEX IF NOT EXISTS "idx_training_tenant_employee"
    ON "training_records" ("tenant_id", "employee_id");

-- ── employee_loans — add (tenant_id, employee_id) composite ──────────────────
CREATE INDEX IF NOT EXISTS "idx_employee_loans_tenant_employee"
    ON "employee_loans" ("tenant_id", "employee_id");
