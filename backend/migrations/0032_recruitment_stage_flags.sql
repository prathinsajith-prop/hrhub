-- Per-stage flags for kanban visibility and pipeline anchors.
--
-- - is_first / is_final: each tenant picks exactly one "entry" stage and one
--   "exit" stage. The service enforces the unique-per-tenant invariant when
--   the admin flips a different stage. Defaults seed `received` as first and
--   `rejected` as final.
-- - show_in_kanban: admins can hide any stage from the kanban while keeping
--   it valid in the data model. Defaults to `NOT is_terminal` so the
--   existing "rejected hidden from kanban" behaviour is preserved.
ALTER TABLE "recruitment_stages"
    ADD COLUMN IF NOT EXISTS "is_first"        boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "is_final"        boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "show_in_kanban"  boolean NOT NULL DEFAULT true;

-- Backfill: derive flags from existing rows.
UPDATE "recruitment_stages"
   SET "is_first" = true
 WHERE "stage_key" = 'received';

UPDATE "recruitment_stages"
   SET "is_final" = true
 WHERE "stage_key" = 'rejected';

UPDATE "recruitment_stages"
   SET "show_in_kanban" = NOT "is_terminal";
