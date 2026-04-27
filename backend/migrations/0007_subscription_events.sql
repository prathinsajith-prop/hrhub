-- ─── Subscription events log ──────────────────────────────────────────────────
-- Stores every subscription lifecycle event for audit and billing reconciliation:
-- upgrade requests, enterprise contacts, Stripe checkout sessions, plan activations,
-- and quota updates. Email delivery is best-effort; this table is the authoritative record.

CREATE TABLE IF NOT EXISTS "subscription_events" (
    "id"               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"        UUID         NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "user_id"          UUID         REFERENCES "users"("id") ON DELETE SET NULL,
    "event_type"       TEXT         NOT NULL,
    "plan_from"        TEXT,
    "plan_to"          TEXT,
    "employee_quota"   INTEGER,
    "monthly_cost"     INTEGER,
    "stripe_session_id" TEXT,
    "contact_name"     TEXT,
    "contact_email"    TEXT,
    "metadata"         JSONB        NOT NULL DEFAULT '{}',
    "created_at"       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_sub_events_tenant_created"
    ON "subscription_events" ("tenant_id", "created_at" DESC);
