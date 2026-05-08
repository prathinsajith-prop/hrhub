-- Per-month payment ledger for employee loans.
-- One row per (loan, periodMonth) — unique constraint blocks duplicate
-- monthly payments and lets us derive an ordered installment schedule
-- without a separate "installments" template table.
CREATE TABLE IF NOT EXISTS "loan_payments" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"     uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "loan_id"       uuid NOT NULL REFERENCES "employee_loans" ("id") ON DELETE CASCADE,
  "period_month"  date NOT NULL,
  "amount"        numeric(12, 2) NOT NULL,
  "paid_date"     timestamptz NOT NULL DEFAULT now(),
  "notes"         text,
  "recorded_by"   uuid REFERENCES "users" ("id") ON DELETE SET NULL,
  "created_at"    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_loan_payments_loan"   ON "loan_payments" ("loan_id");
CREATE INDEX IF NOT EXISTS "idx_loan_payments_tenant" ON "loan_payments" ("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_loan_payments_loan_period" ON "loan_payments" ("loan_id", "period_month");
