-- ─────────────────────────────────────────────────────────────────────────────
-- 0017_notifications_composite_index
-- Adds composite index (tenant_id, user_id, is_read) on notifications for
-- faster unread-count queries and per-user notification list fetches.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "idx_notifications_tenant_user_read"
    ON "notifications" ("tenant_id", "user_id", "is_read");
