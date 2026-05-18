-- Backfill: ensure users.roles always contains the user's primary role.
--
-- 0025_multi_roles.sql ran a one-time UPDATE that copied `role` into `roles`,
-- but signups created afterwards did not set `roles` explicitly. Those rows
-- ended up with `roles = ['employee']` (the schema default) regardless of
-- their actual `role`. The frontend route guard prefers the `roles` array,
-- so affected super_admin / hr_manager / pro_officer / dept_head accounts
-- saw the wrong views.
--
-- Idempotent: only touches rows where `role` is missing from `roles`.
UPDATE users
SET roles = ARRAY(SELECT DISTINCT unnest(roles || ARRAY[role]))
WHERE role IS NOT NULL
  AND NOT (role = ANY(roles));
