-- Enforce tenant isolation on team_members at the database layer.
--
-- Background: an audit surfaced team_members rows whose `tenant_id` did not
-- match the linked employee's `tenant_id`. The application path that added
-- members had a validation gap (department check only ran when the team had
-- a departmentId — see modules/teams/teams.service.ts addTeamMembers), so
-- direct DB writes and a few seed runs produced cross-tenant rows.
--
-- This migration:
--   1. Deletes any existing rows where team_members.tenant_id, employees.tenant_id
--      and teams.tenant_id don't all agree. There's exactly 1 such row in the
--      current dataset; in a fresh install the DELETE is a no-op.
--   2. Adds a CHECK trigger that rejects future inserts/updates with mismatched
--      tenant_id between team_members, employees, and teams. Triggers (not
--      CHECK constraints) are needed here because Postgres CHECK constraints
--      can't reference other tables.

-- 1. Clean up existing corruption
DELETE FROM team_members
WHERE id IN (
    SELECT tm.id
    FROM team_members tm
    JOIN employees e ON e.id = tm.employee_id
    JOIN teams t ON t.id = tm.team_id
    WHERE tm.tenant_id <> e.tenant_id
       OR tm.tenant_id <> t.tenant_id
       OR e.tenant_id <> t.tenant_id
);

-- 2. Guard against future corruption
CREATE OR REPLACE FUNCTION enforce_team_member_tenant_alignment()
RETURNS TRIGGER AS $$
DECLARE
    emp_tenant uuid;
    team_tenant uuid;
BEGIN
    SELECT tenant_id INTO emp_tenant FROM employees WHERE id = NEW.employee_id;
    SELECT tenant_id INTO team_tenant FROM teams WHERE id = NEW.team_id;

    IF emp_tenant IS NULL THEN
        RAISE EXCEPTION 'team_members.employee_id % does not exist', NEW.employee_id;
    END IF;
    IF team_tenant IS NULL THEN
        RAISE EXCEPTION 'team_members.team_id % does not exist', NEW.team_id;
    END IF;
    IF NEW.tenant_id <> emp_tenant THEN
        RAISE EXCEPTION 'team_members.tenant_id % does not match employee tenant %', NEW.tenant_id, emp_tenant;
    END IF;
    IF NEW.tenant_id <> team_tenant THEN
        RAISE EXCEPTION 'team_members.tenant_id % does not match team tenant %', NEW.tenant_id, team_tenant;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_team_members_tenant_alignment ON team_members;
CREATE TRIGGER trg_team_members_tenant_alignment
    BEFORE INSERT OR UPDATE OF tenant_id, employee_id, team_id ON team_members
    FOR EACH ROW
    EXECUTE FUNCTION enforce_team_member_tenant_alignment();
