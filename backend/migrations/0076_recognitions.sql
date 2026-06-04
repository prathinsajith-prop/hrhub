-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0076 — Employee Recognition & Appreciation
--
-- Social recognition platform:
--   recognition_categories    — tenant-configurable categories (icon, color)
--   recognition_badges        — tenant-configurable badges with levels
--   recognitions              — the appreciation post
--   recognition_recipients    — N employees per recognition
--   recognition_team_targets  — N teams per recognition
--   recognition_dept_targets  — N departments (org_units) per recognition
--   recognition_reactions     — like/celebrate/love/support/congrats
--   recognition_comments      — threaded comments
--   recognition_points        — points ledger (earned/granted/redeemed)
--   recognition_approvals     — workflow approval trail
--
-- Idempotent (IF NOT EXISTS).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Categories ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "recognition_categories" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL,
    "key" text NOT NULL,
    "label" text NOT NULL,
    "description" text,
    "icon" text NOT NULL DEFAULT 'award',
    "color" text NOT NULL DEFAULT '#6366f1',
    "is_default" boolean NOT NULL DEFAULT false,
    "is_archived" boolean NOT NULL DEFAULT false,
    "sort_order" integer NOT NULL DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
    ALTER TABLE "recognition_categories" ADD CONSTRAINT "recognition_categories_tenant_id_fk"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_recognition_categories_tenant_key" ON "recognition_categories" ("tenant_id", "key");
CREATE INDEX IF NOT EXISTS "idx_recognition_categories_active" ON "recognition_categories" ("tenant_id", "is_archived");

-- ── Badges ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "recognition_badges" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL,
    "key" text NOT NULL,
    "label" text NOT NULL,
    "description" text,
    "icon" text NOT NULL DEFAULT 'medal',
    "color" text NOT NULL DEFAULT '#f59e0b',
    "level" text NOT NULL DEFAULT 'bronze',
    "category_key" text,
    "default_points" integer NOT NULL DEFAULT 0,
    "is_archived" boolean NOT NULL DEFAULT false,
    "sort_order" integer NOT NULL DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
    ALTER TABLE "recognition_badges" ADD CONSTRAINT "recognition_badges_tenant_id_fk"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_recognition_badges_tenant_key" ON "recognition_badges" ("tenant_id", "key");
CREATE INDEX IF NOT EXISTS "idx_recognition_badges_active" ON "recognition_badges" ("tenant_id", "is_archived");

-- ── Recognitions ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "recognitions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL,
    "giver_user_id" uuid,
    "giver_employee_id" uuid,
    "giver_name" text,
    "category_key" text NOT NULL DEFAULT 'great_work',
    "badge_key" text,
    "title" text NOT NULL,
    "message" text NOT NULL,
    "achievement_date" date,
    "visibility" text NOT NULL DEFAULT 'public',
    "visibility_scope_id" text,
    "nomination_type" text NOT NULL DEFAULT 'peer',
    "points" integer NOT NULL DEFAULT 0,
    "attachments" jsonb DEFAULT '[]'::jsonb,
    "status" text NOT NULL DEFAULT 'published',
    "workflow_state" text,
    "comments_disabled" boolean NOT NULL DEFAULT false,
    "is_pinned" boolean NOT NULL DEFAULT false,
    "submitted_at" timestamp with time zone,
    "published_at" timestamp with time zone,
    "approved_at" timestamp with time zone,
    "rejected_at" timestamp with time zone,
    "rejection_reason" text,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
    ALTER TABLE "recognitions" ADD CONSTRAINT "recognitions_tenant_id_fk"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "recognitions" ADD CONSTRAINT "recognitions_giver_user_fk"
        FOREIGN KEY ("giver_user_id") REFERENCES "users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "recognitions" ADD CONSTRAINT "recognitions_giver_employee_fk"
        FOREIGN KEY ("giver_employee_id") REFERENCES "employees"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "idx_recognitions_tenant" ON "recognitions" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_recognitions_tenant_status" ON "recognitions" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "idx_recognitions_giver" ON "recognitions" ("tenant_id", "giver_employee_id");
CREATE INDEX IF NOT EXISTS "idx_recognitions_category" ON "recognitions" ("tenant_id", "category_key");
CREATE INDEX IF NOT EXISTS "idx_recognitions_created" ON "recognitions" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_recognitions_published" ON "recognitions" ("tenant_id", "published_at" DESC) WHERE "published_at" IS NOT NULL;

-- ── Recipients (employees) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "recognition_recipients" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL,
    "recognition_id" uuid NOT NULL,
    "employee_id" uuid NOT NULL,
    "is_primary" boolean NOT NULL DEFAULT false,
    "points_awarded" integer NOT NULL DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
    ALTER TABLE "recognition_recipients" ADD CONSTRAINT "recognition_recipients_tenant_fk"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "recognition_recipients" ADD CONSTRAINT "recognition_recipients_recognition_fk"
        FOREIGN KEY ("recognition_id") REFERENCES "recognitions"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "recognition_recipients" ADD CONSTRAINT "recognition_recipients_employee_fk"
        FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_recognition_recipient" ON "recognition_recipients" ("recognition_id", "employee_id");
CREATE INDEX IF NOT EXISTS "idx_recognition_recipients_employee" ON "recognition_recipients" ("tenant_id", "employee_id");

-- ── Team targets ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "recognition_team_targets" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL,
    "recognition_id" uuid NOT NULL,
    "team_id" uuid NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
    ALTER TABLE "recognition_team_targets" ADD CONSTRAINT "rec_team_targets_tenant_fk"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "recognition_team_targets" ADD CONSTRAINT "rec_team_targets_recognition_fk"
        FOREIGN KEY ("recognition_id") REFERENCES "recognitions"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "recognition_team_targets" ADD CONSTRAINT "rec_team_targets_team_fk"
        FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_rec_team_target" ON "recognition_team_targets" ("recognition_id", "team_id");
CREATE INDEX IF NOT EXISTS "idx_rec_team_targets_team" ON "recognition_team_targets" ("tenant_id", "team_id");

-- ── Department targets (org_units) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "recognition_dept_targets" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL,
    "recognition_id" uuid NOT NULL,
    "org_unit_id" uuid NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
    ALTER TABLE "recognition_dept_targets" ADD CONSTRAINT "rec_dept_targets_tenant_fk"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "recognition_dept_targets" ADD CONSTRAINT "rec_dept_targets_recognition_fk"
        FOREIGN KEY ("recognition_id") REFERENCES "recognitions"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "recognition_dept_targets" ADD CONSTRAINT "rec_dept_targets_org_unit_fk"
        FOREIGN KEY ("org_unit_id") REFERENCES "org_units"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_rec_dept_target" ON "recognition_dept_targets" ("recognition_id", "org_unit_id");
CREATE INDEX IF NOT EXISTS "idx_rec_dept_targets_unit" ON "recognition_dept_targets" ("tenant_id", "org_unit_id");

-- ── Reactions ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "recognition_reactions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL,
    "recognition_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "reaction_type" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
    ALTER TABLE "recognition_reactions" ADD CONSTRAINT "recognition_reactions_tenant_fk"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "recognition_reactions" ADD CONSTRAINT "recognition_reactions_recognition_fk"
        FOREIGN KEY ("recognition_id") REFERENCES "recognitions"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "recognition_reactions" ADD CONSTRAINT "recognition_reactions_user_fk"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_recognition_reaction" ON "recognition_reactions" ("recognition_id", "user_id");
CREATE INDEX IF NOT EXISTS "idx_recognition_reactions_recognition" ON "recognition_reactions" ("recognition_id");

-- ── Comments ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "recognition_comments" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL,
    "recognition_id" uuid NOT NULL,
    "parent_id" uuid,
    "user_id" uuid,
    "author_name" text,
    "body" text NOT NULL,
    "edited_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "deleted_by_user_id" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
    ALTER TABLE "recognition_comments" ADD CONSTRAINT "recognition_comments_tenant_fk"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "recognition_comments" ADD CONSTRAINT "recognition_comments_recognition_fk"
        FOREIGN KEY ("recognition_id") REFERENCES "recognitions"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "recognition_comments" ADD CONSTRAINT "recognition_comments_parent_fk"
        FOREIGN KEY ("parent_id") REFERENCES "recognition_comments"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "recognition_comments" ADD CONSTRAINT "recognition_comments_user_fk"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "idx_recognition_comments_recognition" ON "recognition_comments" ("recognition_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_recognition_comments_parent" ON "recognition_comments" ("parent_id");

-- ── Points ledger ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "recognition_points" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "employee_id" uuid,
    "recognition_id" uuid,
    "points" integer NOT NULL,
    "type" text NOT NULL,
    "description" text,
    "balance_after" integer,
    "created_by_user_id" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
    ALTER TABLE "recognition_points" ADD CONSTRAINT "recognition_points_tenant_fk"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "recognition_points" ADD CONSTRAINT "recognition_points_user_fk"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "recognition_points" ADD CONSTRAINT "recognition_points_employee_fk"
        FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "recognition_points" ADD CONSTRAINT "recognition_points_recognition_fk"
        FOREIGN KEY ("recognition_id") REFERENCES "recognitions"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "idx_recognition_points_user" ON "recognition_points" ("tenant_id", "user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_recognition_points_employee" ON "recognition_points" ("tenant_id", "employee_id");
CREATE INDEX IF NOT EXISTS "idx_recognition_points_type" ON "recognition_points" ("tenant_id", "type");

-- ── Approvals ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "recognition_approvals" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL,
    "recognition_id" uuid NOT NULL,
    "approver_user_id" uuid,
    "approver_name" text,
    "step" text NOT NULL DEFAULT 'manager',
    "action" text NOT NULL,
    "comment" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
    ALTER TABLE "recognition_approvals" ADD CONSTRAINT "recognition_approvals_tenant_fk"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "recognition_approvals" ADD CONSTRAINT "recognition_approvals_recognition_fk"
        FOREIGN KEY ("recognition_id") REFERENCES "recognitions"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "recognition_approvals" ADD CONSTRAINT "recognition_approvals_approver_fk"
        FOREIGN KEY ("approver_user_id") REFERENCES "users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "idx_recognition_approvals_recognition" ON "recognition_approvals" ("recognition_id", "created_at");
