-- Migration: 0011_users_tenant_email
--
-- Goal: prepare users.email for tenant-scoped uniqueness so the same human
-- can belong to multiple tenants. The full breaking change (drop global
-- UNIQUE(email)) is deferred until the auth login flow supports a tenant
-- selector or workspace-scoped login URL — see docs/DATABASE_AUDIT.md
-- "Phase 2 follow-ups".
--
-- This migration delivers the non-breaking improvements:
--   1) Case-insensitive global uniqueness (replaces UNIQUE(email)) so that
--      'User@Example.com' and 'user@example.com' can never coexist.
--   2) Functional index on LOWER(email) so the auth lookup
--        WHERE LOWER(email) = LOWER($1)
--      is index-only without sequential scans.
--   3) The (tenant_id, LOWER(email)) tenant-scoped unique index, which is
--      strictly stronger than the global one — keeping both is harmless
--      because the global constraint already implies tenant-scoped
--      uniqueness today.
--
-- Phase 2 (manual, gated on auth flow update):
--   DROP INDEX uq_users_email_global_ci;

-- Replace the broad email index with a case-insensitive functional index.
DROP INDEX IF EXISTS idx_users_email;
CREATE INDEX IF NOT EXISTS idx_users_email_ci
    ON users(LOWER(email));

-- Tenant-scoped uniqueness (case-insensitive). Coexists with the global
-- unique index below for now; will become the only uniqueness rule in
-- phase 2.
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_tenant_email_ci
    ON users(tenant_id, LOWER(email));

-- Global case-insensitive uniqueness. Drop the original case-sensitive
-- UNIQUE(email) and replace it so 'User@Example.com' and 'user@example.com'
-- can never coexist. This matches how the auth service already normalises
-- emails to lowercase before storage.
ALTER TABLE users
    DROP CONSTRAINT IF EXISTS users_email_unique;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_global_ci
    ON users(LOWER(email));

ANALYZE users;
