-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0087 — Per-user "Create posts" switch
--
-- One boolean on `users`:
--   - portal_post_enabled — gates whether the user can publish posts to the
--                           employee portal feed.
--
-- Defaults to false so the capability is opt-in. HR grants it on a per-user
-- basis from Users → Manage Access.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "users" ADD COLUMN "portal_post_enabled" boolean DEFAULT false NOT NULL;
