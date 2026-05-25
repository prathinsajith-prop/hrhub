-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0065 — Offboarding Flow
--
-- Models the Zoho-style 5-step offboarding configuration:
--   1. Preferences            → offboarding_flow_settings (singleton per tenant)
--   2. Clearances             → offboarding_clearance_templates (catalog)
--                              + exit_clearance_items (per-exit instances)
--   3. Exit Interview         → offboarding_interview_questions (catalog)
--                              + exit_interview_responses (per-exit answers)
--   4. Documents              → offboarding_exit_documents (catalog)
--   5. Workflows              → offboarding_workflows (trigger → action config)
--
-- Templates live at tenant level; per-exit instances are auto-created when an
-- exit request is initiated.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Preferences (singleton per tenant)
CREATE TABLE IF NOT EXISTS offboarding_flow_settings (
    id                              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                       uuid          NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
    -- Notice period
    notice_period_enabled           boolean       NOT NULL DEFAULT true,
    notice_period_value             integer       NOT NULL DEFAULT 30,
    notice_period_unit              text          NOT NULL DEFAULT 'days', -- 'days' | 'months'
    -- HR partners receive offboarding notifications + can act on clearances
    hr_partner_user_ids             jsonb         NOT NULL DEFAULT '[]'::jsonb,
    -- Approval chain (mirrors Zoho "N level(s) of Reporting To → HR partner")
    approval_reporting_levels       integer       NOT NULL DEFAULT 1,
    approval_require_hr_partner     boolean       NOT NULL DEFAULT true,
    -- Exit interview messages (rich text / markdown)
    interview_intro_message         text,
    interview_thank_you_message     text,
    -- Workflows: initiate trigger preset
    workflow_trigger                text          NOT NULL DEFAULT 'on_request_added', -- 'on_request_added' | 'on_approved' | 'on_relieving_date'
    created_at                      timestamptz   NOT NULL DEFAULT now(),
    updated_at                      timestamptz   NOT NULL DEFAULT now()
);

-- 2. Clearance templates (catalog — multiple per tenant)
CREATE TABLE IF NOT EXISTS offboarding_clearance_templates (
    id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            text          NOT NULL,
    description     text,
    -- Ownership: who is responsible for completing this clearance
    owner_type      text          NOT NULL DEFAULT 'hr_partner', -- 'hr_partner' | 'reporting_manager' | 'specific_user'
    owner_user_id   uuid          REFERENCES users(id) ON DELETE SET NULL,
    -- Timing relative to the employee's relieving date (last working day)
    -- Positive values = N days BEFORE relieving date. 0 = on the date.
    start_offset_days   integer   NOT NULL DEFAULT 30,
    end_offset_days     integer   NOT NULL DEFAULT 0,
    position        integer       NOT NULL DEFAULT 0,
    is_active       boolean       NOT NULL DEFAULT true,
    created_at      timestamptz   NOT NULL DEFAULT now(),
    updated_at      timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_offboarding_clearance_templates_tenant
    ON offboarding_clearance_templates(tenant_id, position);

-- 3. Per-exit clearance instances (created when an exit request is initiated)
CREATE TABLE IF NOT EXISTS exit_clearance_items (
    id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    exit_request_id     uuid          NOT NULL REFERENCES exit_requests(id) ON DELETE CASCADE,
    template_id         uuid          REFERENCES offboarding_clearance_templates(id) ON DELETE SET NULL,
    name                text          NOT NULL,
    description         text,
    owner_user_id       uuid          REFERENCES users(id) ON DELETE SET NULL,
    start_date          date,
    due_date            date,
    status              text          NOT NULL DEFAULT 'pending', -- 'pending' | 'in_progress' | 'completed' | 'waived'
    completed_at        timestamptz,
    completed_by        uuid          REFERENCES users(id) ON DELETE SET NULL,
    notes               text,
    position            integer       NOT NULL DEFAULT 0,
    created_at          timestamptz   NOT NULL DEFAULT now(),
    updated_at          timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_exit_clearance_items_tenant_exit
    ON exit_clearance_items(tenant_id, exit_request_id, position);

-- 4. Exit-interview question catalog (per tenant)
CREATE TABLE IF NOT EXISTS offboarding_interview_questions (
    id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    question_text   text          NOT NULL,
    question_type   text          NOT NULL DEFAULT 'long_text', -- 'short_text' | 'long_text' | 'rating' | 'single_choice' | 'multi_choice' | 'yes_no'
    options         jsonb,                                       -- array of strings for choice types
    required        boolean       NOT NULL DEFAULT false,
    position        integer       NOT NULL DEFAULT 0,
    is_active       boolean       NOT NULL DEFAULT true,
    created_at      timestamptz   NOT NULL DEFAULT now(),
    updated_at      timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_offboarding_interview_questions_tenant
    ON offboarding_interview_questions(tenant_id, position);

-- 5. Per-exit interview response (one row per question per exit)
CREATE TABLE IF NOT EXISTS exit_interview_responses (
    id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    exit_request_id     uuid          NOT NULL REFERENCES exit_requests(id) ON DELETE CASCADE,
    question_id         uuid          REFERENCES offboarding_interview_questions(id) ON DELETE SET NULL,
    question_snapshot   text          NOT NULL, -- question text at submission time
    answer_text         text,
    answer_value        jsonb,                  -- rating / choice values
    submitted_at        timestamptz   NOT NULL DEFAULT now(),
    UNIQUE (exit_request_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_exit_interview_responses_exit
    ON exit_interview_responses(tenant_id, exit_request_id);

-- 6. Exit-document catalog (which letters to issue per tenant)
CREATE TABLE IF NOT EXISTS offboarding_exit_documents (
    id                      uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               uuid          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name                    text          NOT NULL, -- 'Experience Letter', 'Relieving Letter', etc.
    document_template_id    uuid          REFERENCES document_templates(id) ON DELETE SET NULL,
    auto_generate           boolean       NOT NULL DEFAULT false,
    required                boolean       NOT NULL DEFAULT false,
    position                integer       NOT NULL DEFAULT 0,
    is_active               boolean       NOT NULL DEFAULT true,
    created_at              timestamptz   NOT NULL DEFAULT now(),
    updated_at              timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_offboarding_exit_documents_tenant
    ON offboarding_exit_documents(tenant_id, position);

-- 7. Workflow triggers (Email Alerts / Custom Functions / Notifications)
CREATE TABLE IF NOT EXISTS offboarding_workflows (
    id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            text          NOT NULL,
    trigger         text          NOT NULL, -- 'on_request_added' | 'on_approved' | 'on_rejected' | 'on_clearance_complete' | 'on_settlement_paid' | 'on_relieving_date'
    action_type     text          NOT NULL, -- 'email_alert' | 'notification' | 'custom_function'
    -- config schema depends on action_type:
    --   email_alert: { recipients: ('employee'|'reporting_manager'|'hr_partner'|'custom')[], customEmails?: string[], subject, body }
    --   notification: { recipients: ('employee'|'reporting_manager'|'hr_partner')[], message, actionUrl? }
    --   custom_function: { code: string }  -- stored but NOT executed in this revision
    config          jsonb         NOT NULL DEFAULT '{}'::jsonb,
    enabled         boolean       NOT NULL DEFAULT true,
    position        integer       NOT NULL DEFAULT 0,
    created_at      timestamptz   NOT NULL DEFAULT now(),
    updated_at      timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_offboarding_workflows_tenant_trigger
    ON offboarding_workflows(tenant_id, trigger) WHERE enabled = true;
