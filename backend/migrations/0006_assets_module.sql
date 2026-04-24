-- 0006_assets_module.sql
-- Asset Management Module: categories, assets, assignments, maintenance

-- ─── Asset Categories ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_categories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_asset_categories_tenant ON asset_categories(tenant_id);

-- ─── Assets ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assets (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    asset_code    TEXT NOT NULL,
    name          TEXT NOT NULL,
    category_id   UUID REFERENCES asset_categories(id) ON DELETE SET NULL,
    brand         TEXT,
    model         TEXT,
    serial_number TEXT,
    purchase_date DATE,
    purchase_cost NUMERIC(12,2),
    -- available | assigned | maintenance | lost | retired
    status        TEXT NOT NULL DEFAULT 'available',
    -- new | good | damaged
    condition     TEXT NOT NULL DEFAULT 'good',
    notes         TEXT,
    deleted_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, asset_code),
    UNIQUE (tenant_id, serial_number)
);
CREATE INDEX IF NOT EXISTS idx_assets_tenant        ON assets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_assets_status        ON assets(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_assets_category      ON assets(category_id);

-- ─── Asset Assignments ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_assignments (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    asset_id             UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    employee_id          UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    assigned_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_date        DATE NOT NULL,
    expected_return_date DATE,
    actual_return_date   DATE,
    -- assigned | returned | lost
    status               TEXT NOT NULL DEFAULT 'assigned',
    notes                TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_asset_assignments_tenant   ON asset_assignments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_asset_assignments_asset    ON asset_assignments(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_assignments_employee ON asset_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_asset_assignments_status   ON asset_assignments(status);

-- ─── Asset Maintenance ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_maintenance (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    asset_id          UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    reported_by       UUID REFERENCES users(id) ON DELETE SET NULL,
    issue_description TEXT NOT NULL,
    -- open | in_progress | resolved
    status            TEXT NOT NULL DEFAULT 'open',
    cost              NUMERIC(12,2),
    resolved_at       TIMESTAMPTZ,
    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_asset_maintenance_tenant ON asset_maintenance(tenant_id);
CREATE INDEX IF NOT EXISTS idx_asset_maintenance_asset  ON asset_maintenance(asset_id);
