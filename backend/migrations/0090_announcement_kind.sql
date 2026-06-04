-- Differentiate official HR announcements from employee social posts.
-- New rows default to 'announcement'; the portal post endpoint writes 'post'.
ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'announcement';
--> statement-breakpoint
-- Backfill existing employee posts: created via the portal with an empty title
-- (HR announcements always carry a title). Idempotent.
UPDATE "announcements" SET "kind" = 'post' WHERE "title" = '' OR "title" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_announcements_tenant_kind" ON "announcements" ("tenant_id", "kind");
