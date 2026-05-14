-- Template-level required documents per onboarding step.
--
-- Mirrors onboarding_step_required_docs (the per-checklist instance table)
-- but references onboarding_template_steps so admins curate the defaults
-- once in Organization Settings → Onboarding Steps. When a new employee's
-- checklist is created from the template, these rows are copied verbatim
-- into onboarding_step_required_docs.
CREATE TABLE IF NOT EXISTS "onboarding_template_step_required_docs" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"        uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "template_step_id" uuid NOT NULL REFERENCES "onboarding_template_steps" ("id") ON DELETE CASCADE,
  "category"         text NOT NULL,
  "doc_type"         text NOT NULL,
  "expiry_required"  boolean NOT NULL DEFAULT false,
  "is_mandatory"     boolean NOT NULL DEFAULT true,
  "hint"             text,
  "sort_order"       integer NOT NULL DEFAULT 0,
  "created_at"       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "onboarding_template_required_docs_unique"
    UNIQUE ("template_step_id", "category", "doc_type")
);

CREATE INDEX IF NOT EXISTS "idx_template_required_docs_step"
  ON "onboarding_template_step_required_docs" ("template_step_id");
CREATE INDEX IF NOT EXISTS "idx_template_required_docs_tenant"
  ON "onboarding_template_step_required_docs" ("tenant_id");
