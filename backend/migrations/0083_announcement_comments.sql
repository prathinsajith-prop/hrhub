-- Announcement comments — employees reply to a published announcement.
--
-- Shape is intentionally identical to `recognition_comments` so the
-- portal can reuse the same submit-and-list pattern: tenant scoped,
-- soft-delete via `deleted_at`, optional `parent_id` for one level of
-- threading, optional `edited_at` for "(edited)" hints in the UI.
--
-- The home-page announcements feed and the dedicated AnnouncementsPage
-- both render the same comment thread, so this single table backs both.
-- Visibility is enforced at the route layer (caller must pass the same
-- audience gate that lets them read the announcement in the first place).
--
-- Indexes:
--   • (announcement_id, created_at) — list comments for a feed item
--   • (parent_id)                    — pull all replies under one comment

CREATE TABLE IF NOT EXISTS "announcement_comments" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "announcement_id" uuid NOT NULL REFERENCES "announcements"("id") ON DELETE CASCADE,
    "parent_id" uuid,
    "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "author_name" text,
    "body" text NOT NULL,
    "edited_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "deleted_by_user_id" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_announcement_comments_announcement"
    ON "announcement_comments" ("announcement_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_announcement_comments_parent"
    ON "announcement_comments" ("parent_id");
