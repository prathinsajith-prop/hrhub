-- Per-tenant onboarding template steps.
-- These steps are copied into every new employee's onboarding checklist when
-- "Use template" is selected. Each tenant gets its own editable copy at creation
-- time (see DEFAULT_ONBOARDING_TEMPLATE), so HR admins can tailor the checklist
-- to their org without forking code. Step order is a plain integer so the UI
-- can do drag-and-drop reordering without a unique constraint to fight.
CREATE TABLE IF NOT EXISTS "onboarding_template_steps" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"   uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "step_order"  integer NOT NULL,
  "title"       text NOT NULL,
  "owner"       text,
  "sla_days"    integer,
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  "updated_at"  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_onboarding_template_tenant"       ON "onboarding_template_steps" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_onboarding_template_tenant_order" ON "onboarding_template_steps" ("tenant_id", "step_order");

-- Backfill: seed the default template for every existing tenant that has no
-- template rows yet. Idempotent — only fires for tenants without a template,
-- so re-running the migration won't duplicate. Mirrors DEFAULT_ONBOARDING_TEMPLATE
-- in backend/src/modules/onboarding/onboarding.defaults.ts.
INSERT INTO "onboarding_template_steps" ("tenant_id", "step_order", "title", "owner", "sla_days")
SELECT t.id, v.step_order, v.title, v.owner, v.sla_days
FROM "tenants" t
CROSS JOIN (VALUES
  (1, 'HR documentation & contracts',           'HR',      1),
  (2, 'IT equipment setup & laptop handover',   'IT',      1),
  (3, 'System access & account creation',       'IT',      2),
  (4, 'Access card & office orientation',       'Admin',   2),
  (5, 'Introduction to team & manager',         'Manager', 3),
  (6, 'Employee handbook & policy review',      'HR',      5),
  (7, 'Benefits enrollment & payroll setup',    'HR',      7),
  (8, 'Compliance & safety training',           'HR',      10),
  (9, '30-day check-in with manager',           'Manager', 30)
) AS v(step_order, title, owner, sla_days)
WHERE NOT EXISTS (
  SELECT 1 FROM "onboarding_template_steps" ts WHERE ts.tenant_id = t.id
);
