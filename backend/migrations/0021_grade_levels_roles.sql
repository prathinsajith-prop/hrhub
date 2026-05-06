-- ─────────────────────────────────────────────────────────────────────────────
-- 0021_grade_levels_roles
-- Adds roles[] to grade_levels so each level can be tagged with the
-- applicable system roles (employee, dept_head, pro_officer, hr_manager,
-- super_admin) instead of the generic hierarchy band.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "grade_levels"
    ADD COLUMN IF NOT EXISTS "roles" text[] NOT NULL DEFAULT '{}';
