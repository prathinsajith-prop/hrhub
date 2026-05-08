-- Add role column to team_members for viewer/member/manager/administrator
ALTER TABLE "team_members"
  ADD COLUMN IF NOT EXISTS "role" text NOT NULL DEFAULT 'member';

ALTER TABLE "team_members"
  ADD CONSTRAINT "team_members_role_check"
  CHECK ("role" IN ('viewer', 'member', 'manager', 'administrator'));
