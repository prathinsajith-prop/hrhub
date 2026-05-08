-- Add roles array; backfill from existing role column
ALTER TABLE users ADD COLUMN IF NOT EXISTS roles text[] NOT NULL DEFAULT '{employee}'::text[];
UPDATE users SET roles = ARRAY[role]::text[] WHERE roles = '{employee}'::text[];
