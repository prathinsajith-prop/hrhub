-- Atomic employee number sequence counter per tenant per calendar month.
-- Uses INSERT ON CONFLICT DO UPDATE (upsert) for lock-free atomic increments.
CREATE TABLE IF NOT EXISTS "employee_no_sequences" (
    "tenant_id"  uuid    NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "year_month" text    NOT NULL,
    "last_seq"   integer NOT NULL DEFAULT 0,
    PRIMARY KEY ("tenant_id", "year_month")
);
