-- Add phone and company_size to tenants (nullable — existing rows unaffected)
ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS phone TEXT,
    ADD COLUMN IF NOT EXISTS company_size TEXT;
