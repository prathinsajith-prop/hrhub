-- ─────────────────────────────────────────────────────────────────────────────
-- 0002_tenant_user_settings.sql
--
-- Adds settings columns:
--   tenants.regional_settings  — timezone, currency, date format per tenant
--   tenants.security_settings  — session timeout, audit logging per tenant
--   users.notif_prefs          — per-user notification channel preferences
-- ─────────────────────────────────────────────────────────────────────────────

--> statement-breakpoint
ALTER TABLE "tenants"
    ADD COLUMN IF NOT EXISTS "regional_settings" jsonb NOT NULL DEFAULT '{"timezone":"Asia/Dubai","currency":"AED","dateFormat":"DD/MM/YYYY"}';

--> statement-breakpoint
ALTER TABLE "tenants"
    ADD COLUMN IF NOT EXISTS "security_settings" jsonb NOT NULL DEFAULT '{"sessionTimeoutMinutes":480,"auditLoggingEnabled":true}';

--> statement-breakpoint
ALTER TABLE "users"
    ADD COLUMN IF NOT EXISTS "notif_prefs" jsonb NOT NULL DEFAULT '{}';
