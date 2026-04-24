-- ─────────────────────────────────────────────────────────────────────────────
-- 0000_init.sql — fresh consolidated schema for HRHub
--
-- Replaces the entire 0000–0014 migration history. Generated 2026-04-24.
--
-- Layout:
--   1. Extensions
--   2. Tenancy (tenants, entities, tenant_memberships)
--   3. Identity (users, refresh_tokens, password_reset_tokens, two_fa_backup_codes)
--   4. HR (employees) — circular FK with users.employee_id added at the end
--   5. Time (attendance_records, leave_*)
--   6. Payroll (payroll_runs, payslips)
--   7. Documents (documents, document_versions, document_templates)
--   8. Onboarding / Exit / Performance
--   9. Recruitment / Interviews
--   10. Assets (categories, assets, assignments, maintenance)
--   11. Audit (login_history, activity_logs, audit_logs, notifications)
--   12. Connected apps (API keys)
--   13. Indexes (composite, partial, functional)
--   14. CHECK constraints
--   15. Row-Level Security policies
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Extensions ──────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─── 2. Tenancy ─────────────────────────────────────────────────────────────
CREATE TABLE tenants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    trade_license_no text NOT NULL UNIQUE,
    jurisdiction text NOT NULL,
    industry_type text NOT NULL,
    subscription_plan text NOT NULL DEFAULT 'starter',
    logo_url text,
    ip_allowlist text[] DEFAULT '{}',
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE entities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    entity_name text NOT NULL,
    license_type text,
    free_zone_id text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 3. Identity (users) ────────────────────────────────────────────────────
-- Note: employee_id FK added later (after employees table is created).
CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    entity_id uuid,
    employee_id uuid,
    email text NOT NULL,
    password_hash text NOT NULL,
    name text NOT NULL,
    role text NOT NULL DEFAULT 'employee',
    department text,
    avatar_url text,
    is_active boolean NOT NULL DEFAULT true,
    last_login_at timestamptz,
    failed_login_count integer NOT NULL DEFAULT 0,
    locked_until timestamptz,
    totp_secret text,
    two_fa_enabled boolean NOT NULL DEFAULT false,
    two_fa_backup_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE password_reset_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 4. HR (employees) ──────────────────────────────────────────────────────
CREATE TABLE employees (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    entity_id uuid NOT NULL REFERENCES entities(id),
    employee_no text NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    email text,
    phone text,
    nationality text,
    passport_no text,
    emirates_id text,
    date_of_birth date,
    gender text,
    department text,
    designation text,
    reporting_to uuid REFERENCES employees(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    join_date date NOT NULL,
    status text NOT NULL DEFAULT 'onboarding',
    basic_salary numeric(12,2),
    total_salary numeric(12,2),
    visa_status text,
    visa_expiry date,
    passport_expiry date,
    emiratisation_category text,
    avatar_url text,
    work_email text,
    personal_email text,
    mobile_no text,
    marital_status text,
    grade_level text,
    manager_name text,
    labour_card_number text,
    bank_name text,
    iban text,
    housing_allowance numeric(12,2),
    transport_allowance numeric(12,2),
    other_allowances numeric(12,2),
    payment_method text,
    emergency_contact text,
    home_country_address text,
    visa_number text,
    visa_issue_date date,
    visa_type text,
    emirates_id_expiry date,
    sponsoring_entity text,
    contract_type text,
    work_location text,
    probation_end_date date,
    contract_end_date date,
    is_archived boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Now that employees exists, complete the users → employees FK.
ALTER TABLE users
    ADD CONSTRAINT fk_users_employee
        FOREIGN KEY (employee_id)
        REFERENCES employees(id)
        ON DELETE SET NULL
        DEFERRABLE INITIALLY DEFERRED;

-- Memberships (multi-tenant pivot).
CREATE TABLE tenant_memberships (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'employee',
    invite_status text NOT NULL DEFAULT 'accepted',
    invited_email text,
    invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
    invite_token_hash text UNIQUE,
    invited_at timestamptz,
    accepted_at timestamptz,
    expires_at timestamptz,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 5. Time ────────────────────────────────────────────────────────────────
CREATE TABLE attendance_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id uuid NOT NULL REFERENCES employees(id),
    date date NOT NULL,
    check_in timestamptz,
    check_out timestamptz,
    hours_worked numeric(5,2),
    overtime_hours numeric(5,2) DEFAULT '0',
    status text NOT NULL DEFAULT 'present',
    notes text,
    approved_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE leave_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    days integer NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    reason text,
    approved_by uuid REFERENCES users(id),
    approved_at timestamptz,
    applied_date date NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE leave_policies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    leave_type text NOT NULL,
    days_per_year integer NOT NULL DEFAULT 0,
    accrual_rule text NOT NULL DEFAULT 'flat',
    max_carry_forward integer NOT NULL DEFAULT 0,
    carry_expires_after_months integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE leave_balances (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type text NOT NULL,
    year integer NOT NULL,
    opening_balance numeric(6,2) NOT NULL DEFAULT '0',
    accrued numeric(6,2) NOT NULL DEFAULT '0',
    carried_forward numeric(6,2) NOT NULL DEFAULT '0',
    carry_expires_on date,
    taken numeric(6,2) NOT NULL DEFAULT '0',
    adjustment numeric(6,2) NOT NULL DEFAULT '0',
    closing_balance numeric(6,2) NOT NULL DEFAULT '0',
    rolled_over_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 6. Payroll ─────────────────────────────────────────────────────────────
CREATE TABLE payroll_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    month integer NOT NULL,
    year integer NOT NULL,
    status text NOT NULL DEFAULT 'draft',
    total_employees integer NOT NULL DEFAULT 0,
    total_gross numeric(14,2) NOT NULL DEFAULT '0',
    total_deductions numeric(14,2) NOT NULL DEFAULT '0',
    total_net numeric(14,2) NOT NULL DEFAULT '0',
    wps_file_ref text,
    processed_date date,
    approved_by uuid REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT payroll_month_year_unique UNIQUE (tenant_id, month, year)
);

CREATE TABLE payslips (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payroll_run_id uuid NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
    employee_id uuid NOT NULL REFERENCES employees(id),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    basic_salary numeric(12,2) NOT NULL DEFAULT '0',
    housing_allowance numeric(12,2) NOT NULL DEFAULT '0',
    transport_allowance numeric(12,2) NOT NULL DEFAULT '0',
    other_allowances numeric(12,2) NOT NULL DEFAULT '0',
    overtime numeric(12,2) NOT NULL DEFAULT '0',
    commission numeric(12,2) NOT NULL DEFAULT '0',
    gross_salary numeric(12,2) NOT NULL DEFAULT '0',
    deductions numeric(12,2) NOT NULL DEFAULT '0',
    net_salary numeric(12,2) NOT NULL DEFAULT '0',
    days_worked integer,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 7. Documents ───────────────────────────────────────────────────────────
CREATE TABLE documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
    category text NOT NULL,
    doc_type text NOT NULL,
    file_name text NOT NULL,
    s3_key text,
    file_size bigint,
    expiry_date date,
    status text NOT NULL DEFAULT 'pending_upload',
    verified boolean NOT NULL DEFAULT false,
    verified_by uuid REFERENCES users(id),
    verified_at timestamptz,
    uploaded_by uuid REFERENCES users(id),
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE document_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    version_number integer NOT NULL DEFAULT 1,
    s3_key text NOT NULL,
    file_name text NOT NULL,
    file_size integer,
    uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE document_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name text NOT NULL,
    template_type text NOT NULL,
    body text NOT NULL,
    variables jsonb,
    is_active boolean NOT NULL DEFAULT true,
    created_by uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 8. Visa, Onboarding, Exit, Performance ─────────────────────────────────
CREATE TABLE visa_applications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    visa_type text NOT NULL,
    status text NOT NULL DEFAULT 'not_started',
    current_step integer NOT NULL DEFAULT 1,
    total_steps integer NOT NULL DEFAULT 8,
    mohre_ref text,
    gdfr_ref text,
    icp_ref text,
    start_date date NOT NULL DEFAULT now(),
    expiry_date date,
    urgency_level text NOT NULL DEFAULT 'normal',
    notes text,
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE onboarding_checklists (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    progress integer NOT NULL DEFAULT 0,
    start_date date,
    due_date date,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT onboarding_employee_unique UNIQUE (employee_id)
);

CREATE TABLE onboarding_steps (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    checklist_id uuid NOT NULL REFERENCES onboarding_checklists(id) ON DELETE CASCADE,
    step_order integer NOT NULL,
    title text NOT NULL,
    owner text,
    sla_days integer,
    status text NOT NULL DEFAULT 'pending',
    due_date date,
    completed_date date,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE exit_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id uuid NOT NULL REFERENCES employees(id),
    exit_type text NOT NULL,
    exit_date date NOT NULL,
    last_working_day date NOT NULL,
    reason text,
    notice_period_days numeric(5,0) NOT NULL DEFAULT '30',
    status text NOT NULL DEFAULT 'pending',
    gratuity_amount numeric(12,2),
    leave_encashment_amount numeric(12,2),
    unpaid_salary_amount numeric(12,2),
    deductions numeric(12,2) DEFAULT '0',
    total_settlement numeric(12,2),
    settlement_paid boolean DEFAULT false,
    settlement_paid_date date,
    approved_by uuid,
    notes text,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE performance_reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id uuid NOT NULL REFERENCES employees(id),
    reviewer_id uuid REFERENCES users(id),
    period text NOT NULL,
    review_date date,
    status text NOT NULL DEFAULT 'draft',
    overall_rating integer,
    quality_score integer,
    productivity_score integer,
    teamwork_score integer,
    attendance_score integer,
    initiative_score integer,
    strengths text,
    improvements text,
    goals text,
    manager_comments text,
    employee_comments text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 9. Recruitment / Interviews ────────────────────────────────────────────
CREATE TABLE recruitment_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    title text NOT NULL,
    department text,
    location text,
    type text NOT NULL DEFAULT 'full_time',
    status text NOT NULL DEFAULT 'draft',
    openings integer NOT NULL DEFAULT 1,
    min_salary numeric(12,2),
    max_salary numeric(12,2),
    industry text,
    description text,
    requirements jsonb DEFAULT '[]',
    closing_date date,
    posted_by uuid REFERENCES users(id),
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE job_applications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id uuid NOT NULL REFERENCES recruitment_jobs(id) ON DELETE CASCADE,
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name text NOT NULL,
    email text NOT NULL,
    phone text,
    nationality text,
    stage text NOT NULL DEFAULT 'received',
    score integer DEFAULT 0,
    experience integer,
    expected_salary numeric(12,2),
    current_salary numeric(12,2),
    resume_url text,
    notes text,
    applied_date date NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE interviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    application_id uuid NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
    interviewer_user_id uuid REFERENCES users(id),
    scheduled_at timestamptz NOT NULL,
    duration_minutes text NOT NULL DEFAULT '60',
    type text NOT NULL DEFAULT 'video',
    link text,
    location text,
    status text NOT NULL DEFAULT 'scheduled',
    feedback text,
    rating text,
    passed boolean,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 10. Assets ─────────────────────────────────────────────────────────────
CREATE TABLE asset_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE assets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    asset_code text NOT NULL,
    name text NOT NULL,
    category_id uuid REFERENCES asset_categories(id) ON DELETE SET NULL,
    brand text,
    model text,
    serial_number text,
    purchase_date date,
    purchase_cost numeric(12,2),
    status text NOT NULL DEFAULT 'available',
    condition text NOT NULL DEFAULT 'good',
    notes text,
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT assets_tenant_id_asset_code_unique UNIQUE (tenant_id, asset_code)
);

CREATE TABLE asset_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
    assigned_date date NOT NULL,
    expected_return_date date,
    actual_return_date date,
    status text NOT NULL DEFAULT 'assigned',
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE asset_maintenance (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    reported_by uuid REFERENCES users(id) ON DELETE SET NULL,
    issue_description text NOT NULL,
    status text NOT NULL DEFAULT 'open',
    cost numeric(12,2),
    resolved_at timestamptz,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 11. Audit / Notifications ──────────────────────────────────────────────
CREATE TABLE notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    action_url text,
    is_read boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE login_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
    user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    email text,
    event_type text NOT NULL,
    success boolean NOT NULL DEFAULT true,
    ip_address text,
    user_agent text,
    browser text,
    browser_version text,
    os text,
    os_version text,
    device_type text,
    country text,
    city text,
    failure_reason text,
    session_ref text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE activity_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    actor_name text,
    actor_role text,
    entity_type text NOT NULL,
    entity_id text,
    entity_name text,
    action text NOT NULL,
    changes jsonb,
    metadata jsonb,
    ip_address text,
    user_agent text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Legacy "audit_logs" table kept alongside activity_logs (Phase-2: consolidate).
CREATE TABLE audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    user_id uuid REFERENCES users(id),
    action text NOT NULL,
    entity_type text,
    entity_id uuid,
    ip_address text,
    user_agent text,
    metadata jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 12. Connected apps (API keys) ──────────────────────────────────────────
CREATE TABLE connected_apps (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    app_key text NOT NULL UNIQUE,
    secret_hash text NOT NULL,
    scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
    ip_allowlist text[] NOT NULL DEFAULT ARRAY[]::text[],
    status text NOT NULL DEFAULT 'active',
    last_used_at timestamptz,
    request_count bigint NOT NULL DEFAULT 0,
    revoked_at timestamptz,
    created_by uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 13. Indexes ────────────────────────────────────────────────────────────

-- users
CREATE INDEX idx_users_tenant ON users (tenant_id);
CREATE INDEX idx_users_email_ci ON users (LOWER(email));
CREATE UNIQUE INDEX uq_users_tenant_email_ci ON users (tenant_id, LOWER(email));
CREATE UNIQUE INDEX uq_users_employee_id ON users (employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX idx_users_tenant_employee ON users (tenant_id, employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens (expires_at);
CREATE INDEX idx_password_reset_tokens_user ON password_reset_tokens (user_id);
CREATE INDEX idx_password_reset_tokens_expires ON password_reset_tokens (expires_at) WHERE used_at IS NULL;

-- tenant_memberships
CREATE INDEX idx_tenant_memberships_tenant ON tenant_memberships (tenant_id);
CREATE INDEX idx_tenant_memberships_user ON tenant_memberships (user_id);
CREATE INDEX idx_tenant_memberships_token ON tenant_memberships (invite_token_hash);
CREATE INDEX idx_tenant_memberships_tenant_active ON tenant_memberships (tenant_id, is_active);
CREATE INDEX idx_tenant_memberships_tenant_status ON tenant_memberships (tenant_id, invite_status);
CREATE UNIQUE INDEX uq_tenant_memberships_user_tenant ON tenant_memberships (user_id, tenant_id) WHERE user_id IS NOT NULL;

-- employees
CREATE INDEX idx_employees_tenant ON employees (tenant_id);
CREATE INDEX idx_employees_entity ON employees (entity_id);
CREATE INDEX idx_employees_status ON employees (status);
CREATE INDEX idx_employees_visa_expiry ON employees (visa_expiry);
CREATE INDEX idx_employees_tenant_status ON employees (tenant_id, status);
CREATE INDEX idx_employees_tenant_dept ON employees (tenant_id, department);
CREATE INDEX idx_employees_passport_expiry ON employees (tenant_id, passport_expiry);
CREATE INDEX idx_employees_eid_expiry ON employees (tenant_id, emirates_id_expiry);
CREATE INDEX idx_employees_active ON employees (tenant_id) WHERE is_archived = false;
CREATE INDEX idx_employees_reporting_to ON employees (reporting_to) WHERE reporting_to IS NOT NULL;
CREATE INDEX idx_employees_tenant_reporting_to ON employees (tenant_id, reporting_to) WHERE reporting_to IS NOT NULL;
CREATE UNIQUE INDEX idx_employees_no_tenant ON employees (tenant_id, employee_no);
CREATE UNIQUE INDEX idx_employees_email_tenant ON employees (tenant_id, email) WHERE email IS NOT NULL;
-- Full-text search for global employee search.
CREATE INDEX idx_employees_fts ON employees
    USING gin (to_tsvector('simple',
        coalesce(first_name, '') || ' ' ||
        coalesce(last_name, '')  || ' ' ||
        coalesce(email, '')      || ' ' ||
        coalesce(employee_no, '')|| ' ' ||
        coalesce(designation, '')|| ' ' ||
        coalesce(department, '')
    ));

-- attendance
CREATE INDEX idx_attendance_tenant_date ON attendance_records (tenant_id, date);
CREATE INDEX idx_attendance_tenant_employee_date ON attendance_records (tenant_id, employee_id, date);
CREATE UNIQUE INDEX uq_attendance_employee_date ON attendance_records (employee_id, date);

-- leave
CREATE INDEX idx_leave_tenant ON leave_requests (tenant_id);
CREATE INDEX idx_leave_employee ON leave_requests (employee_id);
CREATE INDEX idx_leave_status ON leave_requests (status);
CREATE INDEX idx_leave_requests_tenant_date_employee ON leave_requests (tenant_id, start_date, employee_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_leave_policies_tenant ON leave_policies (tenant_id);
CREATE UNIQUE INDEX uniq_leave_policies_tenant_type ON leave_policies (tenant_id, leave_type);
CREATE INDEX idx_leave_balances_tenant ON leave_balances (tenant_id);
CREATE INDEX idx_leave_balances_emp_year ON leave_balances (employee_id, year);
CREATE UNIQUE INDEX uniq_leave_balances_emp_type_year ON leave_balances (tenant_id, employee_id, leave_type, year);

-- payroll
CREATE INDEX idx_payroll_tenant ON payroll_runs (tenant_id);
CREATE INDEX idx_payslips_run ON payslips (payroll_run_id);
CREATE INDEX idx_payslips_employee ON payslips (employee_id);

-- documents
CREATE INDEX idx_documents_tenant ON documents (tenant_id);
CREATE INDEX idx_documents_employee ON documents (employee_id);
CREATE INDEX idx_documents_expiry ON documents (expiry_date);
CREATE INDEX idx_documents_status ON documents (status);
CREATE INDEX idx_documents_tenant_expiry ON documents (tenant_id, expiry_date) WHERE expiry_date IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_documents_uploaded_by ON documents (uploaded_by) WHERE uploaded_by IS NOT NULL;
CREATE INDEX idx_documents_verified_by ON documents (verified_by) WHERE verified_by IS NOT NULL;
CREATE INDEX idx_doc_versions_document ON document_versions (document_id);
CREATE INDEX idx_doc_versions_tenant ON document_versions (tenant_id);
CREATE INDEX idx_doc_templates_tenant ON document_templates (tenant_id);
CREATE INDEX idx_doc_templates_type ON document_templates (template_type);

-- visa
CREATE INDEX idx_visa_tenant ON visa_applications (tenant_id);
CREATE INDEX idx_visa_employee ON visa_applications (employee_id);
CREATE INDEX idx_visa_status ON visa_applications (status);

-- onboarding / exit
CREATE INDEX idx_checklist_employee ON onboarding_checklists (employee_id);
CREATE INDEX idx_steps_checklist ON onboarding_steps (checklist_id);
CREATE INDEX idx_exit_requests_tenant_status ON exit_requests (tenant_id, status);

-- recruitment
CREATE INDEX idx_jobs_tenant ON recruitment_jobs (tenant_id);
CREATE INDEX idx_jobs_status ON recruitment_jobs (status);
CREATE INDEX idx_applications_job ON job_applications (job_id);
CREATE INDEX idx_applications_tenant ON job_applications (tenant_id);
CREATE INDEX idx_applications_stage ON job_applications (stage);
CREATE INDEX idx_interviews_tenant_scheduled ON interviews (tenant_id, scheduled_at);
CREATE INDEX idx_interviews_application ON interviews (application_id);

-- assets
CREATE INDEX idx_asset_categories_tenant ON asset_categories (tenant_id);
CREATE INDEX idx_assets_tenant ON assets (tenant_id);
CREATE INDEX idx_assets_status ON assets (tenant_id, status);
CREATE INDEX idx_assets_category ON assets (category_id);
CREATE INDEX idx_asset_assignments_tenant ON asset_assignments (tenant_id);
CREATE INDEX idx_asset_assignments_asset ON asset_assignments (asset_id);
CREATE INDEX idx_asset_assignments_employee ON asset_assignments (employee_id);
CREATE INDEX idx_asset_assignments_status ON asset_assignments (status);
CREATE INDEX idx_asset_assignments_open ON asset_assignments (tenant_id, employee_id) WHERE actual_return_date IS NULL;
CREATE INDEX idx_asset_maintenance_tenant ON asset_maintenance (tenant_id);
CREATE INDEX idx_asset_maintenance_asset ON asset_maintenance (asset_id);

-- notifications
CREATE INDEX idx_notifications_tenant ON notifications (tenant_id);
CREATE INDEX idx_notifications_user ON notifications (user_id);
CREATE INDEX idx_notifications_read ON notifications (is_read);
CREATE INDEX idx_notifications_user_unread ON notifications (user_id, created_at DESC) WHERE is_read = false;

-- audit
CREATE INDEX idx_login_history_user ON login_history (user_id);
CREATE INDEX idx_login_history_tenant ON login_history (tenant_id);
CREATE INDEX idx_login_history_created ON login_history (created_at);
CREATE INDEX idx_login_history_event ON login_history (event_type);
CREATE INDEX idx_login_history_tenant_created ON login_history (tenant_id, created_at DESC);
CREATE INDEX idx_activity_logs_tenant ON activity_logs (tenant_id);
CREATE INDEX idx_activity_logs_user ON activity_logs (user_id);
CREATE INDEX idx_activity_logs_entity ON activity_logs (entity_type, entity_id);
CREATE INDEX idx_activity_logs_created ON activity_logs (created_at);
CREATE INDEX idx_activity_logs_tenant_created ON activity_logs (tenant_id, created_at DESC);
CREATE INDEX idx_audit_tenant ON audit_logs (tenant_id);
CREATE INDEX idx_audit_created ON audit_logs (created_at);

-- connected_apps
CREATE INDEX idx_connected_apps_tenant ON connected_apps (tenant_id);
CREATE INDEX idx_connected_apps_status ON connected_apps (tenant_id, status);

-- ─── 14. CHECK constraints ──────────────────────────────────────────────────

ALTER TABLE employees
    ADD CONSTRAINT chk_employees_status CHECK (status IN ('active','onboarding','probation','suspended','terminated','visa_expired')),
    ADD CONSTRAINT chk_employees_gender CHECK (gender IS NULL OR gender IN ('male','female')),
    ADD CONSTRAINT chk_employees_visa_status CHECK (visa_status IS NULL OR visa_status IN ('not_started','entry_permit','medical_pending','eid_pending','stamping','active','expiring_soon','expired','cancelled')),
    ADD CONSTRAINT chk_employees_marital_status CHECK (marital_status IS NULL OR marital_status IN ('single','married','divorced','widowed')),
    ADD CONSTRAINT chk_employees_payment_method CHECK (payment_method IS NULL OR payment_method IN ('bank_transfer','cash','cheque')),
    ADD CONSTRAINT chk_employees_contract_type CHECK (contract_type IS NULL OR contract_type IN ('permanent','contract','part_time')),
    ADD CONSTRAINT chk_employees_emiratisation CHECK (emiratisation_category IS NULL OR emiratisation_category IN ('emirati','expat')),
    ADD CONSTRAINT chk_employees_salary_positive CHECK (basic_salary IS NULL OR basic_salary >= 0),
    ADD CONSTRAINT chk_employees_total_gte_basic CHECK (total_salary IS NULL OR basic_salary IS NULL OR total_salary >= basic_salary),
    ADD CONSTRAINT chk_employees_contract_after_join CHECK (contract_end_date IS NULL OR contract_end_date >= join_date),
    ADD CONSTRAINT chk_employees_probation_after_join CHECK (probation_end_date IS NULL OR probation_end_date >= join_date);

ALTER TABLE users
    ADD CONSTRAINT chk_users_role CHECK (role IN ('super_admin','hr_manager','pro_officer','dept_head','employee'));

ALTER TABLE leave_requests
    ADD CONSTRAINT chk_leave_requests_type CHECK (leave_type IN ('annual','sick','maternity','paternity','hajj','compassionate','unpaid','public_holiday')),
    ADD CONSTRAINT chk_leave_requests_status CHECK (status IN ('pending','approved','rejected','cancelled')),
    ADD CONSTRAINT chk_leave_requests_dates CHECK (end_date >= start_date),
    ADD CONSTRAINT chk_leave_requests_days_positive CHECK (days >= 0);

ALTER TABLE leave_policies
    ADD CONSTRAINT chk_leave_policies_accrual CHECK (accrual_rule IN ('flat','monthly_2_then_30','unlimited','none'));

ALTER TABLE payroll_runs
    ADD CONSTRAINT chk_payroll_runs_status CHECK (status IN ('draft','processing','approved','wps_submitted','paid','failed')),
    ADD CONSTRAINT chk_payroll_runs_month CHECK (month BETWEEN 1 AND 12),
    ADD CONSTRAINT chk_payroll_runs_year CHECK (year BETWEEN 2000 AND 2100);

ALTER TABLE payslips
    ADD CONSTRAINT chk_payslips_basic_nonneg CHECK (basic_salary >= 0),
    ADD CONSTRAINT chk_payslips_gross_nonneg CHECK (gross_salary >= 0),
    ADD CONSTRAINT chk_payslips_deductions_nonneg CHECK (deductions >= 0),
    ADD CONSTRAINT chk_payslips_net_nonneg CHECK (net_salary >= 0);

ALTER TABLE attendance_records
    ADD CONSTRAINT chk_attendance_status CHECK (status IN ('present','absent','half_day','late','wfh','on_leave'));

ALTER TABLE assets
    ADD CONSTRAINT chk_assets_status CHECK (status IN ('available','assigned','maintenance','lost','retired')),
    ADD CONSTRAINT chk_assets_condition CHECK (condition IN ('new','good','damaged'));

ALTER TABLE asset_assignments
    ADD CONSTRAINT chk_asset_assignments_status CHECK (status IN ('assigned','returned','lost'));

ALTER TABLE asset_maintenance
    ADD CONSTRAINT chk_asset_maintenance_status CHECK (status IN ('open','in_progress','resolved'));

ALTER TABLE connected_apps
    ADD CONSTRAINT chk_connected_apps_status CHECK (status IN ('active','revoked'));

ALTER TABLE tenant_memberships
    ADD CONSTRAINT chk_tenant_memberships_role CHECK (role IN ('super_admin','hr_manager','pro_officer','dept_head','employee')),
    ADD CONSTRAINT chk_tenant_memberships_invite CHECK (invite_status IN ('pending','accepted','revoked'));

ALTER TABLE notifications
    ADD CONSTRAINT chk_notifications_type CHECK (type IN ('info','warning','error','success'));

ALTER TABLE exit_requests
    ADD CONSTRAINT chk_exit_requests_type CHECK (exit_type IN ('resignation','termination','contract_end','retirement')),
    ADD CONSTRAINT chk_exit_requests_status CHECK (status IN ('pending','approved','rejected','completed'));

-- ─── 15. Row-Level Security ─────────────────────────────────────────────────
-- Tenant context is set per-transaction by withTenantContext(): SET LOCAL app.current_tenant.

-- helper macro: same policy on every tenant-scoped table.
DO $$
DECLARE
    t text;
    tenant_tables text[] := ARRAY[
        'users','employees','attendance_records','leave_requests','leave_policies',
        'leave_balances','payroll_runs','payslips','documents','document_versions',
        'document_templates','visa_applications','notifications','connected_apps',
        'asset_categories','assets','asset_assignments','asset_maintenance',
        'tenant_memberships','activity_logs','audit_logs','recruitment_jobs',
        'job_applications','interviews','onboarding_checklists','exit_requests',
        'performance_reviews'
    ];
BEGIN
    FOREACH t IN ARRAY tenant_tables LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format($f$
            CREATE POLICY tenant_isolation ON %I
            FOR ALL
            USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
            WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid)
        $f$, t);
    END LOOP;
END $$;

-- login_history allows NULL tenant (failed logins arrive before tenant is known).
ALTER TABLE login_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON login_history
    FOR ALL
    USING (tenant_id IS NULL OR tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id IS NULL OR tenant_id = current_setting('app.current_tenant', true)::uuid);

-- onboarding_steps: scoped via parent checklist.
ALTER TABLE onboarding_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON onboarding_steps
    FOR ALL
    USING (EXISTS (
        SELECT 1 FROM onboarding_checklists c
        WHERE c.id = onboarding_steps.checklist_id
          AND c.tenant_id = current_setting('app.current_tenant', true)::uuid
    ));

-- tenants table: a tenant can only see itself.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_self_access ON tenants
    FOR ALL
    USING (id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (id = current_setting('app.current_tenant', true)::uuid);

-- entities: scoped by tenant_id.
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON entities
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- refresh_tokens / password_reset_tokens: scoped by user.
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_isolation ON refresh_tokens
    FOR ALL
    USING (EXISTS (SELECT 1 FROM users u WHERE u.id = refresh_tokens.user_id
                   AND u.tenant_id = current_setting('app.current_tenant', true)::uuid));

ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_isolation ON password_reset_tokens
    FOR ALL
    USING (EXISTS (SELECT 1 FROM users u WHERE u.id = password_reset_tokens.user_id
                   AND u.tenant_id = current_setting('app.current_tenant', true)::uuid));

ANALYZE;
