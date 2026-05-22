-- Soft-delete column for payroll_adjustments.
--
-- Manual HR-entered adjustments (overtime, commission, bonus, salary advance,
-- manual, custom categories) feed payslips and represent real cash mutations
-- — once entered they should be auditable indefinitely. Hard-delete loses the
-- audit trail of who entered what and when it was removed.
--
-- Auto-imported rows (source = 'leave_engine' / 'loan_engine') are still
-- hard-deleted by syncAdjustmentsForPeriod because they are derived state
-- that can be regenerated from leave_requests + employee_loans.

ALTER TABLE "payroll_adjustments"
    ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;

-- All existing list / summing queries filter by tenant + period; add a
-- partial index so the `WHERE deleted_at IS NULL` predicate stays cheap
-- on large tenants.
CREATE INDEX IF NOT EXISTS "idx_payroll_adj_active"
    ON "payroll_adjustments"("tenant_id", "period_year", "period_month")
    WHERE "deleted_at" IS NULL;
