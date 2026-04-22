-- Migration: login_history and activity_logs tables
-- Run: 2026-04-22

CREATE TABLE IF NOT EXISTS "login_history" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE CASCADE,
    "user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE,
    "email" text,
    "event_type" text NOT NULL,
    "success" boolean NOT NULL DEFAULT true,
    "ip_address" text,
    "user_agent" text,
    "browser" text,
    "browser_version" text,
    "os" text,
    "os_version" text,
    "device_type" text,
    "country" text,
    "city" text,
    "failure_reason" text,
    "session_ref" text,
    "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_login_history_user" ON "login_history" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_login_history_tenant" ON "login_history" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_login_history_created" ON "login_history" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_login_history_event" ON "login_history" ("event_type");

CREATE TABLE IF NOT EXISTS "activity_logs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "actor_name" text,
    "actor_role" text,
    "entity_type" text NOT NULL,
    "entity_id" text,
    "entity_name" text,
    "action" text NOT NULL,
    "changes" jsonb,
    "metadata" jsonb,
    "ip_address" text,
    "user_agent" text,
    "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_activity_logs_tenant" ON "activity_logs" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_activity_logs_user" ON "activity_logs" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_activity_logs_entity" ON "activity_logs" ("entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "idx_activity_logs_created" ON "activity_logs" ("created_at");
