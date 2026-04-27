-- Track which tenant context a refresh token belongs to.
-- Nullable so existing tokens remain valid; all new tokens will carry tenant_id.
ALTER TABLE refresh_tokens
    ADD COLUMN IF NOT EXISTS tenant_id UUID;
