-- ─────────────────────────────────────────────────────────────────────────────
-- 0004_doc_lifecycle.sql
--
-- Document lifecycle hardening:
--   1. onboarding_step_required_docs — declares which doc types each step needs
--   2. onboarding_upload_tokens      — DB-backed tokens (revocable, single-use opt)
--   3. documents.rejected_*          — adds rejection workflow (status='rejected')
--   4. document_audit_log            — full audit trail of doc state changes
-- ─────────────────────────────────────────────────────────────────────────────

--> statement-breakpoint

-- ─── 1. onboarding_step_required_docs ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "onboarding_step_required_docs" (
    "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id"        uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "step_id"          uuid NOT NULL REFERENCES "onboarding_steps"("id") ON DELETE CASCADE,
    "category"         text NOT NULL,
    "doc_type"         text NOT NULL,
    "expiry_required"  boolean NOT NULL DEFAULT false,
    "is_mandatory"     boolean NOT NULL DEFAULT true,
    "hint"             text,
    "sort_order"       integer NOT NULL DEFAULT 0,
    "created_at"       timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "onboarding_required_docs_category_check"
        CHECK (category IN ('identity','visa','company','employment','insurance','qualification','financial','compliance')),
    CONSTRAINT "onboarding_required_docs_unique"
        UNIQUE (step_id, category, doc_type)
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_required_docs_step"   ON "onboarding_step_required_docs" ("step_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_required_docs_tenant" ON "onboarding_step_required_docs" ("tenant_id");

--> statement-breakpoint
ALTER TABLE "onboarding_step_required_docs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'onboarding_step_required_docs' AND policyname = 'required_docs_tenant_isolation'
  ) THEN
    CREATE POLICY "required_docs_tenant_isolation" ON "onboarding_step_required_docs"
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
  END IF;
END $$;

--> statement-breakpoint

-- ─── 2. onboarding_upload_tokens ─────────────────────────────────────────────
-- DB-backed tokens enable revocation, view-counts, and IP audit on the
-- public upload portal. JWT remains the on-the-wire format; the token's
-- jti maps to a row here.
CREATE TABLE IF NOT EXISTS "onboarding_upload_tokens" (
    "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id"      uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "checklist_id"   uuid NOT NULL REFERENCES "onboarding_checklists"("id") ON DELETE CASCADE,
    "employee_id"    uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
    "issued_by"      uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "issued_to_email" text NOT NULL,
    "expires_at"     timestamp with time zone NOT NULL,
    "revoked_at"     timestamp with time zone,
    "revoked_by"     uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "view_count"     integer NOT NULL DEFAULT 0,
    "upload_count"   integer NOT NULL DEFAULT 0,
    "last_used_at"   timestamp with time zone,
    "last_used_ip"   text,
    "created_at"     timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_upload_tokens_checklist" ON "onboarding_upload_tokens" ("checklist_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_upload_tokens_tenant"    ON "onboarding_upload_tokens" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_upload_tokens_active"    ON "onboarding_upload_tokens" ("checklist_id", "revoked_at", "expires_at");

--> statement-breakpoint
ALTER TABLE "onboarding_upload_tokens" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'onboarding_upload_tokens' AND policyname = 'upload_tokens_tenant_isolation'
  ) THEN
    CREATE POLICY "upload_tokens_tenant_isolation" ON "onboarding_upload_tokens"
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
  END IF;
END $$;

--> statement-breakpoint

-- ─── 3. documents: rejection workflow ────────────────────────────────────────
ALTER TABLE "documents"
    ADD COLUMN IF NOT EXISTS "rejection_reason" text,
    ADD COLUMN IF NOT EXISTS "rejected_at"      timestamp with time zone,
    ADD COLUMN IF NOT EXISTS "rejected_by"      uuid REFERENCES "users"("id") ON DELETE SET NULL;

--> statement-breakpoint
-- Drop and recreate status check to include 'rejected'
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'documents_status_check'
  ) THEN
    ALTER TABLE "documents" DROP CONSTRAINT "documents_status_check";
  END IF;
END $$;

--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_status_check"
    CHECK (status IN ('valid','expiring_soon','expired','pending_upload','under_review','rejected'));

--> statement-breakpoint

-- ─── 4. document_audit_log ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "document_audit_log" (
    "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id"    uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "document_id"  uuid NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
    "action"       text NOT NULL,
    "actor_id"     uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "actor_label"  text,
    "details"      jsonb,
    "ip_address"   text,
    "user_agent"   text,
    "created_at"   timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "document_audit_action_check"
        CHECK (action IN ('uploaded','viewed','downloaded','verified','rejected','deleted','status_changed','metadata_updated'))
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_doc_audit_document" ON "document_audit_log" ("document_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_doc_audit_tenant"   ON "document_audit_log" ("tenant_id", "created_at" DESC);

--> statement-breakpoint
ALTER TABLE "document_audit_log" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'document_audit_log' AND policyname = 'doc_audit_tenant_isolation'
  ) THEN
    CREATE POLICY "doc_audit_tenant_isolation" ON "document_audit_log"
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
  END IF;
END $$;
