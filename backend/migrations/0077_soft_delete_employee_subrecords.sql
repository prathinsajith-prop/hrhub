-- Migration 0077 — Soft-delete for employee sub-records
--
-- Enterprise lifecycle policy: critical business data must never be hard-deleted.
-- These three tables previously used DELETE; they now soft-delete via deleted_at
-- so dependents, HR notes, and disciplinary warnings remain recoverable and
-- auditable. List/get queries filter `deleted_at IS NULL`.

ALTER TABLE "employee_dependents" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;
ALTER TABLE "employee_notes"      ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;
ALTER TABLE "employee_warnings"   ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;

-- Partial indexes keep the common "active rows for an employee" lookup fast.
CREATE INDEX IF NOT EXISTS "idx_emp_dependents_active"
    ON "employee_dependents" ("tenant_id", "employee_id") WHERE "deleted_at" IS NULL;
CREATE INDEX IF NOT EXISTS "idx_emp_notes_active"
    ON "employee_notes" ("tenant_id", "employee_id") WHERE "deleted_at" IS NULL;
CREATE INDEX IF NOT EXISTS "idx_emp_warnings_active"
    ON "employee_warnings" ("tenant_id", "employee_id") WHERE "deleted_at" IS NULL;
