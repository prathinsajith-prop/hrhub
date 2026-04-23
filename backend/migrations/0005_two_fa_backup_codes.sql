-- 0005_two_fa_backup_codes.sql
-- Adds single-use MFA recovery codes (bcrypt-hashed) for users who enable TOTP.
-- Allows account recovery when authenticator app/device is lost.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS two_fa_backup_codes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
