-- Migration: document_versions and document_templates tables

CREATE TABLE IF NOT EXISTS "document_versions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "version_number" integer NOT NULL DEFAULT 1,
    "s3_key" text NOT NULL,
    "file_name" text NOT NULL,
    "file_size" integer,
    "uploaded_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "notes" text,
    "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_doc_versions_document" ON "document_versions" ("document_id");
CREATE INDEX IF NOT EXISTS "idx_doc_versions_tenant" ON "document_versions" ("tenant_id");

CREATE TABLE IF NOT EXISTS "document_templates" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    "template_type" text NOT NULL,
    "body" text NOT NULL,
    "variables" jsonb,
    "is_active" boolean NOT NULL DEFAULT true,
    "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_doc_templates_tenant" ON "document_templates" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_doc_templates_type" ON "document_templates" ("template_type");
