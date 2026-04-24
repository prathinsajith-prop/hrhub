-- 0007_app_management.sql
-- App Management Module: tenant memberships (multi-org per user) + connected apps (API keys)

-- ─── Tenant memberships ─────────────────────────────────────────────────────
-- Pivot table allowing one user to belong to many tenants with a per-tenant role.
-- Pending invitations live as memberships in 'pending' state until accepted.
CREATE TABLE IF NOT EXISTS tenant_memberships (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    -- user_id is nullable while invite is pending for an unknown email
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    -- Role inside this tenant. Mirrors users.role enum.
    role            TEXT NOT NULL DEFAULT 'employee',
    -- pending | accepted | revoked
    invite_status   TEXT NOT NULL DEFAULT 'accepted',
    invited_email   TEXT,
    invited_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    -- SHA-256 hex hash of the invite token (raw token returned to caller once)
    invite_token_hash TEXT UNIQUE,
    invited_at      TIMESTAMPTZ,
    accepted_at     TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A user can only have one membership per tenant.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_memberships_user_tenant
    ON tenant_memberships(user_id, tenant_id)
    WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_memberships_tenant ON tenant_memberships(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_memberships_user ON tenant_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_memberships_token ON tenant_memberships(invite_token_hash);
CREATE INDEX IF NOT EXISTS idx_tenant_memberships_tenant_active
    ON tenant_memberships(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_tenant_memberships_tenant_status
    ON tenant_memberships(tenant_id, invite_status);

-- Bootstrap memberships for every existing (user, tenant) pair so existing
-- accounts keep working without migration.
INSERT INTO tenant_memberships (tenant_id, user_id, role, invite_status, accepted_at, is_active)
SELECT u.tenant_id, u.id, u.role, 'accepted', u.created_at, u.is_active
FROM users u
ON CONFLICT DO NOTHING;

-- ─── Connected apps ─────────────────────────────────────────────────────────
-- Tenant-scoped API keys for programmatic access from external apps.
CREATE TABLE IF NOT EXISTS connected_apps (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT,
    -- Public key prefix (e.g. 'app_live_xxxxxxx') shown in UI; safe to expose.
    app_key         TEXT NOT NULL UNIQUE,
    -- bcrypt hash of the secret. Plain secret returned ONCE on create/regen.
    secret_hash     TEXT NOT NULL,
    scopes          TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ip_allowlist    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    -- active | revoked
    status          TEXT NOT NULL DEFAULT 'active',
    last_used_at    TIMESTAMPTZ,
    request_count   BIGINT NOT NULL DEFAULT 0,
    revoked_at      TIMESTAMPTZ,
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_connected_apps_tenant ON connected_apps(tenant_id);
CREATE INDEX IF NOT EXISTS idx_connected_apps_status ON connected_apps(tenant_id, status);
