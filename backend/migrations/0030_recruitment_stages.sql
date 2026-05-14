-- Per-tenant customisation of the recruitment pipeline stages.
--
-- Stage keys are fixed (they must match the candidate.stage enum union) — what
-- tenants customise is the user-facing label, colour and display order. New
-- tenants are seeded via the recruitment.defaults DEFAULT_RECRUITMENT_STAGES
-- list at signup; this migration creates the table and backfills the same
-- defaults for every existing tenant so old organisations get stages too.
CREATE TABLE IF NOT EXISTS "recruitment_stages" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"   uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "stage_key"   text NOT NULL,
  "label"       text NOT NULL,
  "color_key"   text NOT NULL DEFAULT 'slate',
  "stage_order" integer NOT NULL,
  "is_terminal" boolean NOT NULL DEFAULT false,
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  "updated_at"  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "recruitment_stages_tenant_key_unique" UNIQUE ("tenant_id", "stage_key")
);

CREATE INDEX IF NOT EXISTS "idx_recruitment_stages_tenant"       ON "recruitment_stages" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_recruitment_stages_tenant_order" ON "recruitment_stages" ("tenant_id", "stage_order");

-- Backfill: seed the default stages for every existing tenant that has no
-- recruitment_stages rows yet. Idempotent — only fires for tenants without
-- stages, so re-running the migration won't duplicate. Mirrors
-- DEFAULT_RECRUITMENT_STAGES in backend/src/modules/recruitment/recruitment.defaults.ts.
INSERT INTO "recruitment_stages" ("tenant_id", "stage_order", "stage_key", "label", "color_key", "is_terminal")
SELECT t.id, v.stage_order, v.stage_key, v.label, v.color_key, v.is_terminal
FROM "tenants" t
CROSS JOIN (VALUES
  (1, 'received',     'Received',     'slate',   false),
  (2, 'screening',    'Screening',    'blue',    false),
  (3, 'interview',    'Interview',    'amber',   false),
  (4, 'assessment',   'Assessment',   'primary', false),
  (5, 'offer',        'Offer',        'green',   false),
  (6, 'pre_boarding', 'Pre-boarding', 'emerald', false),
  (7, 'rejected',     'Rejected',     'red',     true )
) AS v(stage_order, stage_key, label, color_key, is_terminal)
WHERE NOT EXISTS (
  SELECT 1 FROM "recruitment_stages" rs WHERE rs.tenant_id = t.id
);
