-- Migration: 0010_rls_policy_gaps
--
-- Closes RLS coverage gaps. Migration 0004 enabled RLS + tenant_isolation on
-- 17 tables; this migration covers the remaining tenant-scoped tables added in
-- migrations 0006 (assets), 0007 (apps + memberships), and 0008 (leave
-- policies/balances), plus the activity_logs / login_history tables added in
-- 0002 that were missed in 0004.
--
-- All policies use the same pattern: rows are visible only when their
-- tenant_id matches the per-transaction setting `app.current_tenant`, which
-- the application sets via withTenantContext() before any tenant-scoped query.

-- ── Enable RLS ──────────────────────────────────────────────────────────────
ALTER TABLE leave_policies          ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_balances          ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_categories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_assignments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_maintenance       ENABLE ROW LEVEL SECURITY;
ALTER TABLE connected_apps          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_memberships      ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_history           ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_versions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_applications        ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_steps        ENABLE ROW LEVEL SECURITY;

-- ── Policies ────────────────────────────────────────────────────────────────
-- Use DROP IF EXISTS so the migration is re-runnable if a policy was added
-- manually first.
DROP POLICY IF EXISTS tenant_isolation ON leave_policies;
CREATE POLICY tenant_isolation ON leave_policies
    USING (tenant_id::text = current_setting('app.current_tenant', true));

DROP POLICY IF EXISTS tenant_isolation ON leave_balances;
CREATE POLICY tenant_isolation ON leave_balances
    USING (tenant_id::text = current_setting('app.current_tenant', true));

DROP POLICY IF EXISTS tenant_isolation ON asset_categories;
CREATE POLICY tenant_isolation ON asset_categories
    USING (tenant_id::text = current_setting('app.current_tenant', true));

DROP POLICY IF EXISTS tenant_isolation ON assets;
CREATE POLICY tenant_isolation ON assets
    USING (tenant_id::text = current_setting('app.current_tenant', true));

DROP POLICY IF EXISTS tenant_isolation ON asset_assignments;
CREATE POLICY tenant_isolation ON asset_assignments
    USING (tenant_id::text = current_setting('app.current_tenant', true));

DROP POLICY IF EXISTS tenant_isolation ON asset_maintenance;
CREATE POLICY tenant_isolation ON asset_maintenance
    USING (tenant_id::text = current_setting('app.current_tenant', true));

DROP POLICY IF EXISTS tenant_isolation ON connected_apps;
CREATE POLICY tenant_isolation ON connected_apps
    USING (tenant_id::text = current_setting('app.current_tenant', true));

DROP POLICY IF EXISTS tenant_isolation ON tenant_memberships;
CREATE POLICY tenant_isolation ON tenant_memberships
    USING (tenant_id::text = current_setting('app.current_tenant', true));

DROP POLICY IF EXISTS tenant_isolation ON activity_logs;
CREATE POLICY tenant_isolation ON activity_logs
    USING (tenant_id::text = current_setting('app.current_tenant', true));

-- login_history may have NULL tenant_id for failed logins (unknown email).
-- Allow such rows through so the app-layer filter can still surface them to
-- super-admins; tenant-scoped rows are still gated normally.
DROP POLICY IF EXISTS tenant_isolation ON login_history;
CREATE POLICY tenant_isolation ON login_history
    USING (
        tenant_id IS NULL
        OR tenant_id::text = current_setting('app.current_tenant', true)
    );

DROP POLICY IF EXISTS tenant_isolation ON document_versions;
CREATE POLICY tenant_isolation ON document_versions
    USING (tenant_id::text = current_setting('app.current_tenant', true));

DROP POLICY IF EXISTS tenant_isolation ON job_applications;
CREATE POLICY tenant_isolation ON job_applications
    USING (tenant_id::text = current_setting('app.current_tenant', true));

-- onboarding_steps does not carry tenant_id directly; isolate via parent
-- onboarding_checklists.
DROP POLICY IF EXISTS tenant_isolation ON onboarding_steps;
CREATE POLICY tenant_isolation ON onboarding_steps
    USING (
        EXISTS (
            SELECT 1 FROM onboarding_checklists oc
            WHERE oc.id = onboarding_steps.checklist_id
              AND oc.tenant_id::text = current_setting('app.current_tenant', true)
        )
    );

-- ── tenants table — explicit "deny by default" for non-super-admin paths ────
-- Migration 0004 enabled RLS on tenants but never created a policy, which
-- effectively blocks everything. Add a permissive read policy so the app can
-- look up its own tenant rows when needed; super-admin code paths bypass RLS
-- via the migration role.
DROP POLICY IF EXISTS tenant_self_access ON tenants;
CREATE POLICY tenant_self_access ON tenants
    USING (id::text = current_setting('app.current_tenant', true));
