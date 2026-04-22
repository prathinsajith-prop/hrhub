-- =============================================================
-- HRHub.ae — Initial Schema Migration
-- PostgreSQL 17 | Multi-Tenant SaaS HR & PRO Platform
-- =============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =============================================================
-- TENANTS
-- =============================================================
CREATE TABLE tenants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  trade_license_no TEXT UNIQUE NOT NULL,
  jurisdiction    TEXT NOT NULL CHECK (jurisdiction IN ('mainland', 'freezone')),
  industry_type   TEXT NOT NULL,
  subscription_plan TEXT NOT NULL DEFAULT 'starter'
    CHECK (subscription_plan IN ('starter', 'growth', 'enterprise')),
  logo_url        TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- ENTITIES (subsidiary companies under a tenant)
-- =============================================================
CREATE TABLE entities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_name   TEXT NOT NULL,
  license_type  TEXT,
  free_zone_id  TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_entities_tenant ON entities(tenant_id);

-- =============================================================
-- USERS
-- =============================================================
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id     UUID REFERENCES entities(id),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'employee'
    CHECK (role IN ('super_admin', 'hr_manager', 'pro_officer', 'dept_head', 'employee')),
  department    TEXT,
  avatar_url    TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);

-- =============================================================
-- REFRESH TOKENS
-- =============================================================
CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT UNIQUE NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

-- =============================================================
-- EMPLOYEES
-- =============================================================
CREATE TABLE employees (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id             UUID NOT NULL REFERENCES entities(id),
  employee_no           TEXT NOT NULL,
  first_name            TEXT NOT NULL,
  last_name             TEXT NOT NULL,
  email                 TEXT,
  phone                 TEXT,
  nationality           TEXT,
  passport_no           TEXT,
  emirates_id           TEXT,
  date_of_birth         DATE,
  gender                TEXT CHECK (gender IN ('male', 'female')),
  department            TEXT,
  designation           TEXT,
  reporting_to          UUID REFERENCES employees(id),
  join_date             DATE NOT NULL,
  status                TEXT NOT NULL DEFAULT 'onboarding'
    CHECK (status IN ('active', 'onboarding', 'probation', 'suspended', 'terminated', 'visa_expired')),
  basic_salary          NUMERIC(12, 2),
  total_salary          NUMERIC(12, 2),
  visa_status           TEXT
    CHECK (visa_status IN ('not_started','entry_permit','medical_pending','eid_pending','stamping','active','expiring_soon','expired','cancelled')),
  visa_expiry           DATE,
  passport_expiry       DATE,
  emiratisation_category TEXT CHECK (emiratisation_category IN ('emirati', 'expat')),
  avatar_url            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, employee_no)
);

CREATE INDEX idx_employees_tenant ON employees(tenant_id);
CREATE INDEX idx_employees_entity ON employees(entity_id);
CREATE INDEX idx_employees_status ON employees(status);
CREATE INDEX idx_employees_visa_expiry ON employees(visa_expiry);
CREATE INDEX idx_employees_name ON employees USING gin((first_name || ' ' || last_name) gin_trgm_ops);

-- =============================================================
-- RECRUITMENT JOBS
-- =============================================================
CREATE TABLE recruitment_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  department    TEXT,
  location      TEXT,
  type          TEXT NOT NULL DEFAULT 'full_time'
    CHECK (type IN ('full_time', 'part_time', 'contract')),
  status        TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'open', 'closed', 'on_hold')),
  openings      INT NOT NULL DEFAULT 1,
  min_salary    NUMERIC(12, 2),
  max_salary    NUMERIC(12, 2),
  industry      TEXT,
  description   TEXT,
  requirements  JSONB DEFAULT '[]',
  closing_date  DATE,
  posted_by     UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_jobs_tenant ON recruitment_jobs(tenant_id);
CREATE INDEX idx_jobs_status ON recruitment_jobs(status);

-- =============================================================
-- JOB APPLICATIONS
-- =============================================================
CREATE TABLE job_applications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID NOT NULL REFERENCES recruitment_jobs(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  phone           TEXT,
  nationality     TEXT,
  stage           TEXT NOT NULL DEFAULT 'received'
    CHECK (stage IN ('received','screening','interview','assessment','offer','pre_boarding','rejected')),
  score           INT DEFAULT 0,
  experience      INT,
  expected_salary NUMERIC(12, 2),
  current_salary  NUMERIC(12, 2),
  resume_url      TEXT,
  notes           TEXT,
  applied_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_applications_job ON job_applications(job_id);
CREATE INDEX idx_applications_tenant ON job_applications(tenant_id);
CREATE INDEX idx_applications_stage ON job_applications(stage);

-- =============================================================
-- VISA APPLICATIONS
-- =============================================================
CREATE TABLE visa_applications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  visa_type       TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'not_started',
  current_step    INT NOT NULL DEFAULT 1,
  total_steps     INT NOT NULL DEFAULT 8,
  mohre_ref       TEXT,
  gdrfa_ref       TEXT,
  icp_ref         TEXT,
  start_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  expiry_date     DATE,
  urgency_level   TEXT NOT NULL DEFAULT 'normal'
    CHECK (urgency_level IN ('normal', 'urgent', 'critical')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_visa_tenant ON visa_applications(tenant_id);
CREATE INDEX idx_visa_employee ON visa_applications(employee_id);
CREATE INDEX idx_visa_status ON visa_applications(status);

-- =============================================================
-- DOCUMENTS
-- =============================================================
CREATE TABLE documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id     UUID REFERENCES employees(id) ON DELETE SET NULL,
  category        TEXT NOT NULL
    CHECK (category IN ('identity','visa','company','employment','insurance','qualification','financial','compliance')),
  doc_type        TEXT NOT NULL,
  file_name       TEXT NOT NULL,
  s3_key          TEXT,
  file_size       BIGINT,
  expiry_date     DATE,
  status          TEXT NOT NULL DEFAULT 'pending_upload'
    CHECK (status IN ('valid','expiring_soon','expired','pending_upload','under_review')),
  verified        BOOLEAN NOT NULL DEFAULT false,
  verified_by     UUID REFERENCES users(id),
  verified_at     TIMESTAMPTZ,
  uploaded_by     UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_documents_tenant ON documents(tenant_id);
CREATE INDEX idx_documents_employee ON documents(employee_id);
CREATE INDEX idx_documents_expiry ON documents(expiry_date);
CREATE INDEX idx_documents_status ON documents(status);

-- =============================================================
-- ONBOARDING CHECKLISTS
-- =============================================================
CREATE TABLE onboarding_checklists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  progress    INT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  start_date  DATE,
  due_date    DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id)
);

CREATE TABLE onboarding_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id    UUID NOT NULL REFERENCES onboarding_checklists(id) ON DELETE CASCADE,
  step_order      INT NOT NULL,
  title           TEXT NOT NULL,
  owner           TEXT,
  sla_days        INT,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'overdue')),
  due_date        DATE,
  completed_date  DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_checklist_employee ON onboarding_checklists(employee_id);
CREATE INDEX idx_steps_checklist ON onboarding_steps(checklist_id);

-- =============================================================
-- PAYROLL RUNS
-- =============================================================
CREATE TABLE payroll_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  month             INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  year              INT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','processing','approved','wps_submitted','paid','failed')),
  total_employees   INT NOT NULL DEFAULT 0,
  total_gross       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_deductions  NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_net         NUMERIC(14, 2) NOT NULL DEFAULT 0,
  wps_file_ref      TEXT,
  processed_date    DATE,
  approved_by       UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, month, year)
);

CREATE INDEX idx_payroll_tenant ON payroll_runs(tenant_id);

-- =============================================================
-- PAYSLIPS
-- =============================================================
CREATE TABLE payslips (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id  UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES employees(id),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  basic_salary    NUMERIC(12, 2) NOT NULL DEFAULT 0,
  housing_allowance NUMERIC(12, 2) NOT NULL DEFAULT 0,
  transport_allowance NUMERIC(12, 2) NOT NULL DEFAULT 0,
  other_allowances NUMERIC(12, 2) NOT NULL DEFAULT 0,
  overtime        NUMERIC(12, 2) NOT NULL DEFAULT 0,
  commission      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  gross_salary    NUMERIC(12, 2) NOT NULL DEFAULT 0,
  deductions      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  net_salary      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  days_worked     INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payslips_run ON payslips(payroll_run_id);
CREATE INDEX idx_payslips_employee ON payslips(employee_id);

-- =============================================================
-- LEAVE REQUESTS
-- =============================================================
CREATE TABLE leave_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id   UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type    TEXT NOT NULL
    CHECK (leave_type IN ('annual','sick','maternity','paternity','hajj','compassionate','unpaid','public_holiday')),
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  days          INT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','cancelled')),
  reason        TEXT,
  approved_by   UUID REFERENCES users(id),
  approved_at   TIMESTAMPTZ,
  applied_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_leave_tenant ON leave_requests(tenant_id);
CREATE INDEX idx_leave_employee ON leave_requests(employee_id);
CREATE INDEX idx_leave_status ON leave_requests(status);

-- =============================================================
-- NOTIFICATIONS
-- =============================================================
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('info', 'warning', 'error', 'success')),
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  action_url  TEXT,
  is_read     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_tenant ON notifications(tenant_id);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(is_read);

-- =============================================================
-- AUDIT LOGS
-- =============================================================
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  user_id     UUID REFERENCES users(id),
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   UUID,
  ip_address  INET,
  user_agent  TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_tenant ON audit_logs(tenant_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at);

-- =============================================================
-- AUTO-UPDATE updated_at TRIGGER
-- =============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenants_updated_at BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_employees_updated_at BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_jobs_updated_at BEFORE UPDATE ON recruitment_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_applications_updated_at BEFORE UPDATE ON job_applications FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_visa_updated_at BEFORE UPDATE ON visa_applications FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_documents_updated_at BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_payroll_updated_at BEFORE UPDATE ON payroll_runs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_leave_updated_at BEFORE UPDATE ON leave_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_onboarding_updated_at BEFORE UPDATE ON onboarding_checklists FOR EACH ROW EXECUTE FUNCTION update_updated_at();
