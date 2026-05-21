-- Organisation Policy: tenant-level privacy + notification controls.
--
-- Three new columns:
--   * tenants.notifications_enabled — master kill-switch for outbound email.
--     When false the sendEmail() helper short-circuits before any provider
--     call. Useful for paused tenants, sandboxes, and staging tenants.
--   * tenants.privacy_policy — jsonb of org-wide default visibility flags
--     for sensitive fields surfaced on dashboards / directories. Defaults
--     to all true (visible) to match current behaviour — opting out is
--     explicit.
--   * employees.privacy_overrides — jsonb of per-employee opt-outs. When a
--     key is present and false here, the employee's own choice wins over
--     the org default (employees can hide their birthday even if the org
--     default says show). When a key is missing the org default applies.
--
-- The shape mirrors the four toggles HR sees in Org Settings →
-- Organization Policy: showBirthday, showWorkAnniversary, showMobile,
-- searchableInDirectory.

ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS notifications_enabled boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS privacy_policy jsonb NOT NULL DEFAULT jsonb_build_object(
        'showBirthday', true,
        'showWorkAnniversary', true,
        'showMobile', true,
        'searchableInDirectory', true
    );

ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS privacy_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;
