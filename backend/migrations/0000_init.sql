-- ═══════════════════════════════════════════════════════════════════════════
-- 0000_init — Full schema bootstrap (single consolidated migration)
--
-- Dependency order:
--   extensions → tenants/entities → org_units (no head FK yet) →
--   designations → employees → org_units head FK → users/tokens →
--   memberships → leave/attendance/performance → onboarding →
--   documents/doc-lifecycle → payroll → public_holidays → salary_revisions →
--   teams → visa → recruitment → assets → exit → audit/notifications/apps →
--   subscription_events → complaints
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Extensions ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
--> statement-breakpoint

-- ── tenants ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "tenants" (
    "id"                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "name"                    text NOT NULL,
    "trade_license_no"        text NOT NULL UNIQUE,
    "jurisdiction"            text NOT NULL,
    "industry_type"           text NOT NULL,
    "subscription_plan"       text NOT NULL DEFAULT 'starter',
    "employee_quota"          integer DEFAULT 5,
    "phone"                   text,
    "company_size"            text,
    "subscription_expires_at" timestamp with time zone,
    "logo_url"                text,
    "ip_allowlist"            text[] DEFAULT ARRAY[]::text[],
    "regional_settings"       jsonb NOT NULL DEFAULT '{"timezone":"Asia/Dubai","currency":"AED","dateFormat":"DD/MM/YYYY"}',
    "security_settings"       jsonb NOT NULL DEFAULT '{"sessionTimeoutMinutes":480,"auditLoggingEnabled":true}',
    "is_active"               boolean NOT NULL DEFAULT true,
    "created_at"              timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at"              timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- ── entities ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "entities" (
    "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"    uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "entity_name"  text NOT NULL,
    "license_type" text,
    "free_zone_id" text,
    "is_active"    boolean NOT NULL DEFAULT true,
    "created_at"   timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_entities_tenant" ON "entities" ("tenant_id");
--> statement-breakpoint

-- ── org_units ─────────────────────────────────────────────────────────────────
-- head_employee_id FK to employees is added after employees is created (circular dep).
CREATE TABLE IF NOT EXISTS "org_units" (
    "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"        uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "name"             text NOT NULL,
    "code"             text,
    "type"             text NOT NULL,
    "parent_id"        uuid REFERENCES "org_units"("id") ON DELETE SET NULL,
    "head_employee_id" uuid,
    "description"      text,
    "is_active"        boolean NOT NULL DEFAULT true,
    "sort_order"       integer NOT NULL DEFAULT 0,
    "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at"       timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_org_units_tenant" ON "org_units" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_org_units_parent" ON "org_units" ("parent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_org_units_type"   ON "org_units" ("tenant_id", "type");
--> statement-breakpoint

-- ── designations ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "designations" (
    "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"  uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "name"       text NOT NULL,
    "is_active"  boolean NOT NULL DEFAULT true,
    "sort_order" integer NOT NULL DEFAULT 0,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "uq_designations_tenant_name" UNIQUE ("tenant_id", "name")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_designations_tenant" ON "designations" ("tenant_id");
--> statement-breakpoint

-- ── employees ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "employees" (
    "id"                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"              uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "entity_id"              uuid NOT NULL REFERENCES "entities"("id"),
    "employee_no"            text NOT NULL,
    "first_name"             text NOT NULL,
    "last_name"              text NOT NULL,
    "email"                  text,
    "phone"                  text,
    "nationality"            text,
    "passport_no"            text,
    "emirates_id"            text,
    "date_of_birth"          date,
    "gender"                 text,
    "department"             text,
    "designation"            text,
    "reporting_to"           uuid REFERENCES "employees"("id") ON DELETE SET NULL,
    "join_date"              date NOT NULL,
    "status"                 text NOT NULL DEFAULT 'onboarding',
    "basic_salary"           numeric(12,2),
    "total_salary"           numeric(12,2),
    "visa_status"            text,
    "visa_expiry"            date,
    "passport_expiry"        date,
    "emiratisation_category" text,
    "avatar_url"             text,
    "work_email"             text,
    "personal_email"         text,
    "mobile_no"              text,
    "marital_status"         text,
    "grade_level"            text,
    "manager_name"           text,
    "labour_card_number"     text,
    "bank_name"              text,
    "iban"                   text,
    "housing_allowance"      numeric(12,2),
    "transport_allowance"    numeric(12,2),
    "other_allowances"       numeric(12,2),
    "payment_method"         text,
    "emergency_contact"      text,
    "home_country_address"   text,
    "visa_number"            text,
    "visa_issue_date"        date,
    "visa_type"              text,
    "emirates_id_expiry"     date,
    "sponsoring_entity"      text,
    "contract_type"          text,
    "work_location"          text,
    "probation_end_date"     date,
    "contract_end_date"      date,
    "division_id"            uuid REFERENCES "org_units"("id") ON DELETE SET NULL,
    "department_id"          uuid REFERENCES "org_units"("id") ON DELETE SET NULL,
    "branch_id"              uuid REFERENCES "org_units"("id") ON DELETE SET NULL,
    "is_archived"            boolean NOT NULL DEFAULT false,
    "created_at"             timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at"             timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "chk_employees_salary_positive"      CHECK (basic_salary IS NULL OR basic_salary >= 0),
    CONSTRAINT "chk_employees_total_gte_basic"      CHECK (total_salary IS NULL OR basic_salary IS NULL OR total_salary >= basic_salary),
    CONSTRAINT "chk_employees_gender"               CHECK (gender IN ('male', 'female')),
    CONSTRAINT "chk_employees_contract_after_join"  CHECK (contract_end_date IS NULL OR contract_end_date >= join_date),
    CONSTRAINT "chk_employees_probation_after_join" CHECK (probation_end_date IS NULL OR probation_end_date >= join_date)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_employees_tenant"              ON "employees" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_employees_entity"              ON "employees" ("entity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_employees_status"              ON "employees" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_employees_visa_expiry"         ON "employees" ("visa_expiry");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_employees_tenant_status"       ON "employees" ("tenant_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_employees_tenant_dept"         ON "employees" ("tenant_id", "department");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_employees_passport_expiry"     ON "employees" ("tenant_id", "passport_expiry");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_employees_eid_expiry"          ON "employees" ("tenant_id", "emirates_id_expiry");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_employees_active"              ON "employees" ("tenant_id") WHERE is_archived = false;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_employees_reporting_to"        ON "employees" ("reporting_to") WHERE reporting_to IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_employees_tenant_reporting_to" ON "employees" ("tenant_id", "reporting_to") WHERE reporting_to IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_employees_no_tenant"    ON "employees" ("tenant_id", "employee_no");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_employees_email_tenant" ON "employees" ("tenant_id", "email") WHERE email IS NOT NULL;
--> statement-breakpoint

-- ── org_units: add circular FK now that employees exists ─────────────────────
ALTER TABLE "org_units"
    ADD CONSTRAINT "org_units_head_employee_id_fk"
    FOREIGN KEY ("head_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL;
--> statement-breakpoint

-- ── users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "users" (
    "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"           uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "entity_id"           uuid,
    "employee_id"         uuid NOT NULL REFERENCES "employees"("id") ON DELETE RESTRICT,
    "email"               text NOT NULL,
    "password_hash"       text NOT NULL,
    "name"                text NOT NULL,
    "role"                text NOT NULL DEFAULT 'employee',
    "department"          text,
    "avatar_url"          text,
    "is_active"           boolean NOT NULL DEFAULT true,
    "last_login_at"       timestamp with time zone,
    "failed_login_count"  integer NOT NULL DEFAULT 0,
    "locked_until"        timestamp with time zone,
    "totp_secret"         text,
    "two_fa_enabled"      boolean NOT NULL DEFAULT false,
    "two_fa_backup_codes" text[] NOT NULL DEFAULT ARRAY[]::text[],
    "notif_prefs"         jsonb NOT NULL DEFAULT '{}',
    "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at"          timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_users_tenant"              ON "users" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_email_ci"            ON "users" (LOWER("email"));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_users_tenant_email_ci" ON "users" ("tenant_id", LOWER("email"));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_users_employee_id"     ON "users" ("employee_id") WHERE employee_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_tenant_employee"     ON "users" ("tenant_id", "employee_id") WHERE employee_id IS NOT NULL;
--> statement-breakpoint

-- ── refresh_tokens ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "refresh_tokens" (
    "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id"    uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "token_hash" text NOT NULL UNIQUE,
    "tenant_id"  uuid,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_user" ON "refresh_tokens" ("user_id");
--> statement-breakpoint

-- ── password_reset_tokens ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
    "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id"    uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "token_hash" text NOT NULL UNIQUE,
    "expires_at" timestamp with time zone NOT NULL,
    "used_at"    timestamp with time zone,
    "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_password_reset_tokens_user" ON "password_reset_tokens" ("user_id");
--> statement-breakpoint

-- ── tenant_memberships ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "tenant_memberships" (
    "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"         uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "user_id"           uuid REFERENCES "users"("id") ON DELETE CASCADE,
    "role"              text NOT NULL DEFAULT 'employee',
    "invite_status"     text NOT NULL DEFAULT 'accepted',
    "invited_email"     text,
    "invited_by"        uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "invite_token_hash" text UNIQUE,
    "invited_at"        timestamp with time zone,
    "accepted_at"       timestamp with time zone,
    "expires_at"        timestamp with time zone,
    "is_active"         boolean NOT NULL DEFAULT true,
    "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at"        timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_tenant_memberships_tenant"        ON "tenant_memberships" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tenant_memberships_user"          ON "tenant_memberships" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tenant_memberships_token"         ON "tenant_memberships" ("invite_token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tenant_memberships_tenant_active" ON "tenant_memberships" ("tenant_id", "is_active");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tenant_memberships_tenant_status" ON "tenant_memberships" ("tenant_id", "invite_status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_tenant_memberships_user_tenant"
    ON "tenant_memberships" ("user_id", "tenant_id")
    WHERE user_id IS NOT NULL;
--> statement-breakpoint

-- ── leave_policies ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "leave_policies" (
    "id"                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"                  uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "leave_type"                 text NOT NULL,
    "days_per_year"              integer NOT NULL DEFAULT 0,
    "accrual_rule"               text NOT NULL DEFAULT 'flat',
    "max_carry_forward"          integer NOT NULL DEFAULT 0,
    "carry_expires_after_months" integer NOT NULL DEFAULT 0,
    "is_active"                  boolean NOT NULL DEFAULT true,
    "created_at"                 timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at"                 timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_leave_policies_tenant"          ON "leave_policies" ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_leave_policies_tenant_type" ON "leave_policies" ("tenant_id", "leave_type");
--> statement-breakpoint

-- ── leave_requests ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "leave_requests" (
    "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"    uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "employee_id"  uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
    "leave_type"   text NOT NULL,
    "start_date"   date NOT NULL,
    "end_date"     date NOT NULL,
    "days"         integer NOT NULL,
    "status"       text NOT NULL DEFAULT 'pending',
    "reason"       text,
    "approved_by"  uuid REFERENCES "users"("id"),
    "approved_at"  timestamp with time zone,
    "applied_date" date NOT NULL DEFAULT CURRENT_DATE,
    "deleted_at"    timestamp with time zone,
    "handover_to"   uuid REFERENCES "employees"("id") ON DELETE SET NULL,
    "handover_notes" text,
    "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at"   timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_leave_tenant"          ON "leave_requests" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leave_employee"        ON "leave_requests" ("employee_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leave_status"          ON "leave_requests" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leave_tenant_status"   ON "leave_requests" ("tenant_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leave_tenant_employee" ON "leave_requests" ("tenant_id", "employee_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leave_handover_to"     ON "leave_requests" ("handover_to") WHERE "handover_to" IS NOT NULL;
--> statement-breakpoint

-- ── leave_balances ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "leave_balances" (
    "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"        uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "employee_id"      uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
    "leave_type"       text NOT NULL,
    "year"             integer NOT NULL,
    "opening_balance"  numeric(6,2) NOT NULL DEFAULT 0,
    "accrued"          numeric(6,2) NOT NULL DEFAULT 0,
    "carried_forward"  numeric(6,2) NOT NULL DEFAULT 0,
    "carry_expires_on" date,
    "taken"            numeric(6,2) NOT NULL DEFAULT 0,
    "adjustment"       numeric(6,2) NOT NULL DEFAULT 0,
    "closing_balance"  numeric(6,2) NOT NULL DEFAULT 0,
    "rolled_over_at"   timestamp with time zone,
    "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at"       timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_leave_balances_tenant"   ON "leave_balances" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leave_balances_emp_year" ON "leave_balances" ("employee_id", "year");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_leave_balances_emp_type_year"
    ON "leave_balances" ("tenant_id", "employee_id", "leave_type", "year");
--> statement-breakpoint

-- ── attendance_records ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "attendance_records" (
    "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"      uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "employee_id"    uuid NOT NULL REFERENCES "employees"("id"),
    "date"           date NOT NULL,
    "check_in"       timestamp with time zone,
    "check_out"      timestamp with time zone,
    "hours_worked"   numeric(5,2),
    "overtime_hours" numeric(5,2) DEFAULT 0,
    "status"         text NOT NULL DEFAULT 'present',
    "notes"          text,
    "approved_by"    uuid,
    "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at"     timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_attendance_tenant"        ON "attendance_records" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_attendance_employee"      ON "attendance_records" ("employee_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_attendance_tenant_date"   ON "attendance_records" ("tenant_id", "date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_attendance_employee_date" ON "attendance_records" ("employee_id", "date");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_attendance_employee_date" ON "attendance_records" ("employee_id", "date");
--> statement-breakpoint

-- ── performance_reviews ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "performance_reviews" (
    "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"          uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "employee_id"        uuid NOT NULL REFERENCES "employees"("id"),
    "reviewer_id"        uuid REFERENCES "users"("id"),
    "period"             text NOT NULL,
    "review_date"        date,
    "status"             text NOT NULL DEFAULT 'draft',
    "overall_rating"     integer,
    "quality_score"      integer,
    "productivity_score" integer,
    "teamwork_score"     integer,
    "attendance_score"   integer,
    "initiative_score"   integer,
    "strengths"          text,
    "improvements"       text,
    "goals"              text,
    "manager_comments"   text,
    "employee_comments"  text,
    "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at"         timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- ── onboarding_checklists ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "onboarding_checklists" (
    "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"   uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "employee_id" uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
    "progress"    integer NOT NULL DEFAULT 0,
    "start_date"  date,
    "due_date"    date,
    "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at"  timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "onboarding_employee_unique" UNIQUE ("employee_id")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_checklist_employee" ON "onboarding_checklists" ("employee_id");
--> statement-breakpoint

-- ── onboarding_steps ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "onboarding_steps" (
    "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "checklist_id"   uuid NOT NULL REFERENCES "onboarding_checklists"("id") ON DELETE CASCADE,
    "step_order"     integer NOT NULL,
    "title"          text NOT NULL,
    "owner"          text,
    "sla_days"       integer,
    "status"         text NOT NULL DEFAULT 'pending',
    "due_date"       date,
    "completed_date" date,
    "notes"          text,
    "created_at"     timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_steps_checklist" ON "onboarding_steps" ("checklist_id");
--> statement-breakpoint

-- ── documents ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "documents" (
    "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"        uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "employee_id"      uuid REFERENCES "employees"("id") ON DELETE SET NULL,
    "step_id"          uuid REFERENCES "onboarding_steps"("id") ON DELETE SET NULL,
    "category"         text NOT NULL,
    "doc_type"         text NOT NULL,
    "file_name"        text NOT NULL,
    "s3_key"           text,
    "file_size"        bigint,
    "expiry_date"      date,
    "status"           text NOT NULL DEFAULT 'pending_upload',
    "verified"         boolean NOT NULL DEFAULT false,
    "verified_by"      uuid REFERENCES "users"("id"),
    "verified_at"      timestamp with time zone,
    "rejection_reason" text,
    "rejected_at"      timestamp with time zone,
    "rejected_by"      uuid REFERENCES "users"("id"),
    "uploaded_by"      uuid REFERENCES "users"("id"),
    "deleted_at"       timestamp with time zone,
    "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at"       timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_documents_tenant"          ON "documents" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_documents_employee"        ON "documents" ("employee_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_documents_step"            ON "documents" ("step_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_documents_expiry"          ON "documents" ("expiry_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_documents_status"          ON "documents" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_documents_tenant_category" ON "documents" ("tenant_id", "category");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_documents_tenant_status"   ON "documents" ("tenant_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_documents_tenant_employee" ON "documents" ("tenant_id", "employee_id");
--> statement-breakpoint

-- ── document_versions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "document_versions" (
    "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "document_id"    uuid NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
    "tenant_id"      uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "version_number" integer NOT NULL DEFAULT 1,
    "s3_key"         text NOT NULL,
    "file_name"      text NOT NULL,
    "file_size"      integer,
    "uploaded_by"    uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "notes"          text,
    "created_at"     timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_doc_versions_document" ON "document_versions" ("document_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_doc_versions_tenant"   ON "document_versions" ("tenant_id");
--> statement-breakpoint

-- ── document_templates ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "document_templates" (
    "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"     uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "name"          text NOT NULL,
    "template_type" text NOT NULL,
    "body"          text NOT NULL,
    "variables"     jsonb,
    "is_active"     boolean NOT NULL DEFAULT true,
    "created_by"    uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at"    timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_doc_templates_tenant" ON "document_templates" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_doc_templates_type"   ON "document_templates" ("template_type");
--> statement-breakpoint

-- ── onboarding_step_required_docs ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "onboarding_step_required_docs" (
    "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"       uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "step_id"         uuid NOT NULL REFERENCES "onboarding_steps"("id") ON DELETE CASCADE,
    "category"        text NOT NULL,
    "doc_type"        text NOT NULL,
    "expiry_required" boolean NOT NULL DEFAULT false,
    "is_mandatory"    boolean NOT NULL DEFAULT true,
    "hint"            text,
    "sort_order"      integer NOT NULL DEFAULT 0,
    "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "onboarding_required_docs_unique" UNIQUE ("step_id", "category", "doc_type")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_required_docs_step"   ON "onboarding_step_required_docs" ("step_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_required_docs_tenant" ON "onboarding_step_required_docs" ("tenant_id");
--> statement-breakpoint

-- ── onboarding_upload_tokens ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "onboarding_upload_tokens" (
    "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"       uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "checklist_id"    uuid NOT NULL REFERENCES "onboarding_checklists"("id") ON DELETE CASCADE,
    "employee_id"     uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
    "issued_by"       uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "issued_to_email" text NOT NULL,
    "expires_at"      timestamp with time zone NOT NULL,
    "revoked_at"      timestamp with time zone,
    "revoked_by"      uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "view_count"      integer NOT NULL DEFAULT 0,
    "upload_count"    integer NOT NULL DEFAULT 0,
    "last_used_at"    timestamp with time zone,
    "last_used_ip"    text,
    "created_at"      timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_upload_tokens_checklist" ON "onboarding_upload_tokens" ("checklist_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_upload_tokens_tenant"    ON "onboarding_upload_tokens" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_upload_tokens_active"    ON "onboarding_upload_tokens" ("checklist_id", "revoked_at", "expires_at");
--> statement-breakpoint

-- ── document_audit_log ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "document_audit_log" (
    "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"   uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
    "action"      text NOT NULL,
    "actor_id"    uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "actor_label" text,
    "details"     jsonb,
    "ip_address"  text,
    "user_agent"  text,
    "created_at"  timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_doc_audit_document" ON "document_audit_log" ("document_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_doc_audit_tenant"   ON "document_audit_log" ("tenant_id", "created_at");
--> statement-breakpoint

-- ── payroll_runs ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "payroll_runs" (
    "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"        uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "month"            integer NOT NULL,
    "year"             integer NOT NULL,
    "status"           text NOT NULL DEFAULT 'draft',
    "total_employees"  integer NOT NULL DEFAULT 0,
    "total_gross"      numeric(14,2) NOT NULL DEFAULT 0,
    "total_deductions" numeric(14,2) NOT NULL DEFAULT 0,
    "total_net"        numeric(14,2) NOT NULL DEFAULT 0,
    "wps_file_ref"     text,
    "processed_date"   date,
    "approved_by"      uuid REFERENCES "users"("id"),
    "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at"       timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "payroll_month_year_unique" UNIQUE ("tenant_id", "month", "year")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_payroll_tenant"            ON "payroll_runs" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payroll_tenant_status"     ON "payroll_runs" ("tenant_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payroll_tenant_year_month" ON "payroll_runs" ("tenant_id", "year", "month");
--> statement-breakpoint

-- ── payslips ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "payslips" (
    "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "payroll_run_id"      uuid NOT NULL REFERENCES "payroll_runs"("id") ON DELETE CASCADE,
    "employee_id"         uuid NOT NULL REFERENCES "employees"("id"),
    "tenant_id"           uuid NOT NULL REFERENCES "tenants"("id"),
    "basic_salary"        numeric(12,2) NOT NULL DEFAULT 0,
    "housing_allowance"   numeric(12,2) NOT NULL DEFAULT 0,
    "transport_allowance" numeric(12,2) NOT NULL DEFAULT 0,
    "other_allowances"    numeric(12,2) NOT NULL DEFAULT 0,
    "overtime"            numeric(12,2) NOT NULL DEFAULT 0,
    "commission"          numeric(12,2) NOT NULL DEFAULT 0,
    "gross_salary"        numeric(12,2) NOT NULL DEFAULT 0,
    "deductions"          numeric(12,2) NOT NULL DEFAULT 0,
    "net_salary"          numeric(12,2) NOT NULL DEFAULT 0,
    "days_worked"         integer,
    "created_at"          timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_payslips_run"             ON "payslips" ("payroll_run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payslips_employee"        ON "payslips" ("employee_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payslips_tenant_employee" ON "payslips" ("tenant_id", "employee_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payslips_tenant_run"      ON "payslips" ("tenant_id", "payroll_run_id");
--> statement-breakpoint

-- ── public_holidays ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "public_holidays" (
    "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"    uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "name"         text NOT NULL,
    "date"         date NOT NULL,
    "year"         integer NOT NULL,
    "is_recurring" boolean NOT NULL DEFAULT false,
    "country"      text NOT NULL DEFAULT 'UAE',
    "notes"        text,
    "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at"   timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_public_holidays_tenant"          ON "public_holidays" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_public_holidays_year"            ON "public_holidays" ("tenant_id", "year");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_public_holidays_tenant_date" ON "public_holidays" ("tenant_id", "date");
--> statement-breakpoint

-- ── salary_revisions ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "salary_revisions" (
    "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"             uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "employee_id"           uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
    "effective_date"        date NOT NULL,
    "revision_type"         text NOT NULL DEFAULT 'increment',
    "previous_basic_salary" numeric(12,2),
    "new_basic_salary"      numeric(12,2) NOT NULL,
    "previous_total_salary" numeric(12,2),
    "new_total_salary"      numeric(12,2),
    "reason"                text,
    "approved_by"           uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at"            timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_salary_revisions_tenant"    ON "salary_revisions" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_salary_revisions_employee"  ON "salary_revisions" ("employee_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_salary_revisions_effective" ON "salary_revisions" ("employee_id", "effective_date");
--> statement-breakpoint

-- ── teams ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "teams" (
    "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"     uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "name"          text NOT NULL,
    "description"   text,
    "department_id" uuid REFERENCES "org_units"("id") ON DELETE SET NULL,
    "department"    text,
    "created_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "is_active"     boolean NOT NULL DEFAULT true,
    "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at"    timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_teams_active" ON "teams" ("tenant_id") WHERE is_active = true;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_teams_dept"   ON "teams" ("tenant_id", "department_id")
    WHERE is_active = true AND department_id IS NOT NULL;
--> statement-breakpoint

-- ── team_members ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "team_members" (
    "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "team_id"     uuid NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
    "employee_id" uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
    "tenant_id"   uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "joined_at"   timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_team_member"                ON "team_members" ("team_id", "employee_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_team_members_employee"        ON "team_members" ("employee_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_team_members_tenant_employee" ON "team_members" ("tenant_id", "employee_id");
--> statement-breakpoint

-- ── visa_applications ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "visa_applications" (
    "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"     uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "employee_id"   uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
    "visa_type"     text NOT NULL,
    "status"        text NOT NULL DEFAULT 'not_started',
    "current_step"  integer NOT NULL DEFAULT 1,
    "total_steps"   integer NOT NULL DEFAULT 8,
    "mohre_ref"     text,
    "gdfr_ref"      text,
    "icp_ref"       text,
    "start_date"    date NOT NULL DEFAULT CURRENT_DATE,
    "expiry_date"   date,
    "urgency_level" text NOT NULL DEFAULT 'normal',
    "notes"         text,
    "deleted_at"    timestamp with time zone,
    "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at"    timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_visa_tenant"         ON "visa_applications" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_visa_employee"       ON "visa_applications" ("employee_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_visa_status"         ON "visa_applications" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_visa_tenant_status"  ON "visa_applications" ("tenant_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_visa_tenant_urgency" ON "visa_applications" ("tenant_id", "urgency_level");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_visa_expiry"         ON "visa_applications" ("expiry_date");
--> statement-breakpoint

-- ── visa_costs ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "visa_costs" (
    "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"           uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "visa_application_id" uuid REFERENCES "visa_applications"("id") ON DELETE SET NULL,
    "employee_id"         uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
    "category"            text NOT NULL,
    "description"         text,
    "amount"              numeric(12,2) NOT NULL,
    "currency"            text NOT NULL DEFAULT 'AED',
    "paid_date"           date NOT NULL,
    "receipt_ref"         text,
    "step_number"         integer,
    "step_label"          text,
    "created_by"          uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "chk_visa_costs_amount_positive" CHECK (amount > 0)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_visa_costs_tenant"    ON "visa_costs" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_visa_costs_visa"      ON "visa_costs" ("visa_application_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_visa_costs_employee"  ON "visa_costs" ("employee_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_visa_costs_paid_date" ON "visa_costs" ("paid_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_visa_costs_step"      ON "visa_costs" ("visa_application_id", "step_number");
--> statement-breakpoint

-- ── visa_step_history ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "visa_step_history" (
    "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"           uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "visa_application_id" uuid NOT NULL REFERENCES "visa_applications"("id") ON DELETE CASCADE,
    "from_step"           integer NOT NULL,
    "to_step"             integer NOT NULL,
    "from_step_label"     text NOT NULL,
    "to_step_label"       text NOT NULL,
    "from_status"         text NOT NULL,
    "to_status"           text NOT NULL,
    "costs_total"         numeric(12,2) NOT NULL DEFAULT 0,
    "costs_count"         integer NOT NULL DEFAULT 0,
    "notes"               text,
    "advanced_by"         uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "advanced_by_name"    text,
    "advanced_by_role"    text,
    "created_at"          timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_visa_step_history_tenant"  ON "visa_step_history" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_visa_step_history_visa"    ON "visa_step_history" ("visa_application_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_visa_step_history_created" ON "visa_step_history" ("created_at");
--> statement-breakpoint

-- ── recruitment_jobs ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "recruitment_jobs" (
    "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"    uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "title"        text NOT NULL,
    "department"   text,
    "location"     text,
    "type"         text NOT NULL DEFAULT 'full_time',
    "status"       text NOT NULL DEFAULT 'draft',
    "openings"     integer NOT NULL DEFAULT 1,
    "min_salary"   numeric(12,2),
    "max_salary"   numeric(12,2),
    "industry"     text,
    "description"  text,
    "requirements" jsonb DEFAULT '[]',
    "closing_date" date,
    "posted_by"    uuid REFERENCES "users"("id"),
    "deleted_at"   timestamp with time zone,
    "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at"   timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_jobs_tenant"        ON "recruitment_jobs" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_jobs_status"        ON "recruitment_jobs" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_jobs_tenant_status" ON "recruitment_jobs" ("tenant_id", "status");
--> statement-breakpoint

-- ── job_applications ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "job_applications" (
    "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "job_id"          uuid NOT NULL REFERENCES "recruitment_jobs"("id") ON DELETE CASCADE,
    "tenant_id"       uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "name"            text NOT NULL,
    "email"           text NOT NULL,
    "phone"           text,
    "nationality"     text,
    "stage"           text NOT NULL DEFAULT 'received',
    "score"           integer DEFAULT 0,
    "experience"      integer,
    "expected_salary" numeric(12,2),
    "current_salary"  numeric(12,2),
    "resume_url"      text,
    "notes"           text,
    "applied_date"    date NOT NULL DEFAULT CURRENT_DATE,
    "deleted_at"      timestamp with time zone,
    "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at"      timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_applications_job"          ON "job_applications" ("job_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_applications_tenant"       ON "job_applications" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_applications_stage"        ON "job_applications" ("stage");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_applications_tenant_stage" ON "job_applications" ("tenant_id", "stage");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_applications_job_stage"    ON "job_applications" ("job_id", "stage");
--> statement-breakpoint

-- ── interviews ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "interviews" (
    "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"           uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "application_id"      uuid NOT NULL REFERENCES "job_applications"("id") ON DELETE CASCADE,
    "interviewer_user_id" uuid REFERENCES "users"("id"),
    "scheduled_at"        timestamp with time zone NOT NULL,
    "duration_minutes"    text NOT NULL DEFAULT '60',
    "type"                text NOT NULL DEFAULT 'video',
    "link"                text,
    "location"            text,
    "status"              text NOT NULL DEFAULT 'scheduled',
    "feedback"            text,
    "rating"              text,
    "passed"              boolean,
    "notes"               text,
    "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at"          timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- ── asset_categories ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "asset_categories" (
    "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"   uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "name"        text NOT NULL,
    "description" text,
    "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at"  timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_asset_categories_tenant" ON "asset_categories" ("tenant_id");
--> statement-breakpoint

-- ── assets ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "assets" (
    "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"     uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "asset_code"    text NOT NULL,
    "name"          text NOT NULL,
    "category_id"   uuid REFERENCES "asset_categories"("id") ON DELETE SET NULL,
    "brand"         text,
    "model"         text,
    "serial_number" text,
    "purchase_date" date,
    "purchase_cost" numeric(12,2),
    "status"        text NOT NULL DEFAULT 'available',
    "condition"     text NOT NULL DEFAULT 'good',
    "notes"         text,
    "deleted_at"    timestamp with time zone,
    "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at"    timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "assets_tenant_asset_code_unique" UNIQUE ("tenant_id", "asset_code")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_assets_tenant"   ON "assets" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_assets_status"   ON "assets" ("tenant_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_assets_category" ON "assets" ("category_id");
--> statement-breakpoint

-- ── asset_assignments ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "asset_assignments" (
    "id"                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"            uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "asset_id"             uuid NOT NULL REFERENCES "assets"("id") ON DELETE CASCADE,
    "employee_id"          uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
    "assigned_by"          uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "assigned_date"        date NOT NULL,
    "expected_return_date" date,
    "actual_return_date"   date,
    "status"               text NOT NULL DEFAULT 'assigned',
    "notes"                text,
    "created_at"           timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at"           timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_asset_assignments_tenant"   ON "asset_assignments" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_asset_assignments_asset"    ON "asset_assignments" ("asset_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_asset_assignments_employee" ON "asset_assignments" ("employee_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_asset_assignments_status"   ON "asset_assignments" ("status");
--> statement-breakpoint

-- ── asset_maintenance ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "asset_maintenance" (
    "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"         uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "asset_id"          uuid NOT NULL REFERENCES "assets"("id") ON DELETE CASCADE,
    "reported_by"       uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "issue_description" text NOT NULL,
    "status"            text NOT NULL DEFAULT 'open',
    "cost"              numeric(12,2),
    "resolved_at"       timestamp with time zone,
    "notes"             text,
    "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at"        timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_asset_maintenance_tenant" ON "asset_maintenance" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_asset_maintenance_asset"  ON "asset_maintenance" ("asset_id");
--> statement-breakpoint

-- ── exit_requests ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "exit_requests" (
    "id"                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"               uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "employee_id"             uuid NOT NULL REFERENCES "employees"("id"),
    "exit_type"               text NOT NULL,
    "exit_date"               date NOT NULL,
    "last_working_day"        date NOT NULL,
    "reason"                  text,
    "notice_period_days"      numeric(5,0) NOT NULL DEFAULT 30,
    "status"                  text NOT NULL DEFAULT 'pending',
    "gratuity_amount"         numeric(12,2),
    "leave_encashment_amount" numeric(12,2),
    "unpaid_salary_amount"    numeric(12,2),
    "deductions"              numeric(12,2) DEFAULT 0,
    "total_settlement"        numeric(12,2),
    "settlement_paid"         boolean DEFAULT false,
    "settlement_paid_date"    date,
    "approved_by"             uuid,
    "notes"                   text,
    "created_at"              timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at"              timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- ── login_history ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "login_history" (
    "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"       uuid REFERENCES "tenants"("id") ON DELETE CASCADE,
    "user_id"         uuid REFERENCES "users"("id") ON DELETE CASCADE,
    "email"           text,
    "event_type"      text NOT NULL,
    "success"         boolean NOT NULL DEFAULT true,
    "ip_address"      text,
    "user_agent"      text,
    "browser"         text,
    "browser_version" text,
    "os"              text,
    "os_version"      text,
    "device_type"     text,
    "country"         text,
    "city"            text,
    "failure_reason"  text,
    "session_ref"     text,
    "created_at"      timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_login_history_user"    ON "login_history" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_login_history_tenant"  ON "login_history" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_login_history_created" ON "login_history" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_login_history_event"   ON "login_history" ("event_type");
--> statement-breakpoint

-- ── activity_logs ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "activity_logs" (
    "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"   uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "user_id"     uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "actor_name"  text,
    "actor_role"  text,
    "entity_type" text NOT NULL,
    "entity_id"   text,
    "entity_name" text,
    "action"      text NOT NULL,
    "changes"     jsonb,
    "metadata"    jsonb,
    "ip_address"  text,
    "user_agent"  text,
    "created_at"  timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_activity_logs_tenant"  ON "activity_logs" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_activity_logs_user"    ON "activity_logs" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_activity_logs_entity"  ON "activity_logs" ("entity_type", "entity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_activity_logs_created" ON "activity_logs" ("created_at");
--> statement-breakpoint

-- ── notifications ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "notifications" (
    "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"  uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "user_id"    uuid REFERENCES "users"("id") ON DELETE CASCADE,
    "type"       text NOT NULL,
    "title"      text NOT NULL,
    "message"    text NOT NULL,
    "action_url" text,
    "is_read"    boolean NOT NULL DEFAULT false,
    "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_notifications_tenant" ON "notifications" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notifications_user"   ON "notifications" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notifications_read"   ON "notifications" ("is_read");
--> statement-breakpoint

-- ── audit_logs ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"   uuid NOT NULL REFERENCES "tenants"("id"),
    "user_id"     uuid REFERENCES "users"("id"),
    "action"      text NOT NULL,
    "entity_type" text,
    "entity_id"   uuid,
    "ip_address"  text,
    "user_agent"  text,
    "metadata"    jsonb,
    "created_at"  timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_audit_tenant"  ON "audit_logs" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_created" ON "audit_logs" ("created_at");
--> statement-breakpoint

-- ── connected_apps ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "connected_apps" (
    "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"     uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "name"          text NOT NULL,
    "description"   text,
    "app_key"       text NOT NULL UNIQUE,
    "secret_hash"   text NOT NULL,
    "scopes"        text[] NOT NULL DEFAULT ARRAY[]::text[],
    "ip_allowlist"  text[] NOT NULL DEFAULT ARRAY[]::text[],
    "status"        text NOT NULL DEFAULT 'active',
    "last_used_at"  timestamp with time zone,
    "request_count" bigint NOT NULL DEFAULT 0,
    "revoked_at"    timestamp with time zone,
    "created_by"    uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at"    timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_connected_apps_tenant" ON "connected_apps" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_connected_apps_status" ON "connected_apps" ("tenant_id", "status");
--> statement-breakpoint

-- ── app_request_logs ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "app_request_logs" (
    "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "app_id"      uuid NOT NULL REFERENCES "connected_apps"("id") ON DELETE CASCADE,
    "tenant_id"   uuid NOT NULL,
    "method"      text NOT NULL,
    "path"        text NOT NULL,
    "status_code" integer NOT NULL,
    "latency_ms"  integer,
    "ip_address"  text,
    "created_at"  timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_app_req_logs_app_time"    ON "app_request_logs" ("app_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_app_req_logs_tenant_time" ON "app_request_logs" ("tenant_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_app_req_logs_status"      ON "app_request_logs" ("app_id", "status_code");
--> statement-breakpoint

-- ── subscription_events ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "subscription_events" (
    "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"         uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "user_id"           uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "event_type"        text NOT NULL,
    "plan_from"         text,
    "plan_to"           text,
    "employee_quota"    integer,
    "monthly_cost"      integer,
    "stripe_session_id" text,
    "contact_name"      text,
    "contact_email"     text,
    "metadata"          jsonb DEFAULT '{}',
    "created_at"        timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- ── complaints ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "complaints" (
    "id"                      uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id"               uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "submitted_by_employee_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
    "subject_employee_id"     uuid REFERENCES "employees"("id") ON DELETE SET NULL,
    "title"                   text NOT NULL,
    "category"                text NOT NULL,
    "severity"                text NOT NULL,
    "confidentiality"         text NOT NULL DEFAULT 'confidential',
    "description"             text NOT NULL,
    "status"                  text NOT NULL DEFAULT 'draft',
    "assigned_to_id"          uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "resolution_notes"        text,
    "acknowledged_at"         timestamp with time zone,
    "resolved_at"             timestamp with time zone,
    "sla_due_at"              timestamp with time zone,
    "created_at"              timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at"              timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "complaints_category_check"        CHECK (category IN ('harassment','pay_dispute','leave_dispute','working_conditions','discrimination','other')),
    CONSTRAINT "complaints_severity_check"        CHECK (severity IN ('low','medium','high','critical')),
    CONSTRAINT "complaints_confidentiality_check" CHECK (confidentiality IN ('anonymous','named','confidential')),
    CONSTRAINT "complaints_status_check"          CHECK (status IN ('draft','submitted','under_review','escalated','resolved'))
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_complaints_tenant"       ON "complaints" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_complaints_submitted_by" ON "complaints" ("submitted_by_employee_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_complaints_status"       ON "complaints" ("tenant_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_complaints_severity"     ON "complaints" ("tenant_id", "severity");
