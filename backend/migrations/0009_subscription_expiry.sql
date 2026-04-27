-- Track when the current Professional subscription period ends
ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;
