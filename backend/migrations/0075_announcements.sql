-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0075 — Company Announcements (Phase 1)
--
-- Centralized internal communication:
--   announcements           — the post (lifecycle, priority, category, schedule)
--   announcement_audiences  — targeting rules (all / branch / division / dept /
--                             team / designation / grade / employment_type /
--                             location / employee)
--   announcement_receipts   — per-employee viewed / read / acknowledged state
--
-- Idempotent (IF NOT EXISTS).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "announcements" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL,
    "title" text NOT NULL,
    "body" text NOT NULL DEFAULT '',
    "category" text NOT NULL DEFAULT 'general',
    "priority" text NOT NULL DEFAULT 'normal',
    "status" text NOT NULL DEFAULT 'draft',
    "audience_type" text NOT NULL DEFAULT 'all',
    "pinned" boolean NOT NULL DEFAULT false,
    "require_ack" boolean NOT NULL DEFAULT false,
    "attachments" jsonb DEFAULT '[]'::jsonb,
    "publish_at" timestamp with time zone,
    "expire_at" timestamp with time zone,
    "published_at" timestamp with time zone,
    "created_by" uuid,
    "author_name" text,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
    ALTER TABLE "announcements" ADD CONSTRAINT "announcements_tenant_id_tenants_id_fk"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_users_id_fk"
        FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "idx_announcements_tenant" ON "announcements" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_announcements_tenant_status" ON "announcements" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "idx_announcements_pinned" ON "announcements" ("tenant_id", "pinned");
CREATE INDEX IF NOT EXISTS "idx_announcements_publish_at" ON "announcements" ("publish_at");
CREATE INDEX IF NOT EXISTS "idx_announcements_expire_at" ON "announcements" ("expire_at");

CREATE TABLE IF NOT EXISTS "announcement_audiences" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL,
    "announcement_id" uuid NOT NULL,
    "audience_kind" text NOT NULL,
    "audience_value" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
    ALTER TABLE "announcement_audiences" ADD CONSTRAINT "ann_audiences_tenant_fk"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "announcement_audiences" ADD CONSTRAINT "ann_audiences_announcement_fk"
        FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "idx_ann_audiences_announcement" ON "announcement_audiences" ("announcement_id");
CREATE INDEX IF NOT EXISTS "idx_ann_audiences_lookup" ON "announcement_audiences" ("tenant_id", "audience_kind", "audience_value");

CREATE TABLE IF NOT EXISTS "announcement_receipts" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL,
    "announcement_id" uuid NOT NULL,
    "employee_id" uuid NOT NULL,
    "viewed_at" timestamp with time zone,
    "read_at" timestamp with time zone,
    "acknowledged_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
    ALTER TABLE "announcement_receipts" ADD CONSTRAINT "ann_receipts_tenant_fk"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "announcement_receipts" ADD CONSTRAINT "ann_receipts_announcement_fk"
        FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "announcement_receipts" ADD CONSTRAINT "ann_receipts_employee_fk"
        FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_ann_receipt" ON "announcement_receipts" ("announcement_id", "employee_id");
CREATE INDEX IF NOT EXISTS "idx_ann_receipts_announcement" ON "announcement_receipts" ("announcement_id");
CREATE INDEX IF NOT EXISTS "idx_ann_receipts_employee" ON "announcement_receipts" ("tenant_id", "employee_id");
