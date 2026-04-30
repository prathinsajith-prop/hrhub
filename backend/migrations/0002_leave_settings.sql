-- 0002_leave_settings: add leaveSettings JSONB to tenants for rollover gate
ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS leave_settings jsonb NOT NULL DEFAULT '{"rolloverEnabledFrom": null}'::jsonb;
