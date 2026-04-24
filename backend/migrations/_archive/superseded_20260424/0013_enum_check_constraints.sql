-- Migration: 0013_enum_check_constraints
--
-- Promotes our application-layer enums into PostgreSQL CHECK constraints so
-- bad data can never enter the database, even if a worker / migration / SQL
-- console bypasses the API. We use NOT VALID where we cannot prove existing
-- rows comply, then VALIDATE in the same transaction so the constraint is
-- both safe to add and immediately enforced going forward.
--
-- Each constraint is named with chk_<table>_<column> so it can be located
-- easily and dropped if the enum vocabulary changes.

-- ── Employees ───────────────────────────────────────────────────────────────
ALTER TABLE employees
    DROP CONSTRAINT IF EXISTS chk_employees_status,
    ADD CONSTRAINT chk_employees_status
        CHECK (status IN ('active','onboarding','probation','suspended','terminated','visa_expired')) NOT VALID;
ALTER TABLE employees VALIDATE CONSTRAINT chk_employees_status;

ALTER TABLE employees
    DROP CONSTRAINT IF EXISTS chk_employees_visa_status,
    ADD CONSTRAINT chk_employees_visa_status
        CHECK (visa_status IS NULL OR visa_status IN
            ('not_started','entry_permit','medical_pending','eid_pending','stamping','active','expiring_soon','expired','cancelled')) NOT VALID;
ALTER TABLE employees VALIDATE CONSTRAINT chk_employees_visa_status;

ALTER TABLE employees
    DROP CONSTRAINT IF EXISTS chk_employees_marital_status,
    ADD CONSTRAINT chk_employees_marital_status
        CHECK (marital_status IS NULL OR marital_status IN ('single','married','divorced','widowed')) NOT VALID;
ALTER TABLE employees VALIDATE CONSTRAINT chk_employees_marital_status;

ALTER TABLE employees
    DROP CONSTRAINT IF EXISTS chk_employees_payment_method,
    ADD CONSTRAINT chk_employees_payment_method
        CHECK (payment_method IS NULL OR payment_method IN ('bank_transfer','cash','cheque')) NOT VALID;
ALTER TABLE employees VALIDATE CONSTRAINT chk_employees_payment_method;

ALTER TABLE employees
    DROP CONSTRAINT IF EXISTS chk_employees_contract_type,
    ADD CONSTRAINT chk_employees_contract_type
        CHECK (contract_type IS NULL OR contract_type IN ('permanent','contract','part_time')) NOT VALID;
ALTER TABLE employees VALIDATE CONSTRAINT chk_employees_contract_type;

ALTER TABLE employees
    DROP CONSTRAINT IF EXISTS chk_employees_emiratisation_category,
    ADD CONSTRAINT chk_employees_emiratisation_category
        CHECK (emiratisation_category IS NULL OR emiratisation_category IN ('emirati','expat')) NOT VALID;
ALTER TABLE employees VALIDATE CONSTRAINT chk_employees_emiratisation_category;

-- ── Users ───────────────────────────────────────────────────────────────────
ALTER TABLE users
    DROP CONSTRAINT IF EXISTS chk_users_role,
    ADD CONSTRAINT chk_users_role
        CHECK (role IN ('super_admin','hr_manager','pro_officer','dept_head','employee')) NOT VALID;
ALTER TABLE users VALIDATE CONSTRAINT chk_users_role;

-- ── Leave ──────────────────────────────────────────────────────────────────
ALTER TABLE leave_requests
    DROP CONSTRAINT IF EXISTS chk_leave_requests_type,
    ADD CONSTRAINT chk_leave_requests_type
        CHECK (leave_type IN ('annual','sick','maternity','paternity','hajj','compassionate','unpaid','public_holiday')) NOT VALID;
ALTER TABLE leave_requests VALIDATE CONSTRAINT chk_leave_requests_type;

ALTER TABLE leave_requests
    DROP CONSTRAINT IF EXISTS chk_leave_requests_status,
    ADD CONSTRAINT chk_leave_requests_status
        CHECK (status IN ('pending','approved','rejected','cancelled')) NOT VALID;
ALTER TABLE leave_requests VALIDATE CONSTRAINT chk_leave_requests_status;

ALTER TABLE leave_requests
    DROP CONSTRAINT IF EXISTS chk_leave_requests_dates,
    ADD CONSTRAINT chk_leave_requests_dates
        CHECK (end_date >= start_date) NOT VALID;
ALTER TABLE leave_requests VALIDATE CONSTRAINT chk_leave_requests_dates;

ALTER TABLE leave_requests
    DROP CONSTRAINT IF EXISTS chk_leave_requests_days_positive,
    ADD CONSTRAINT chk_leave_requests_days_positive
        CHECK (days > 0) NOT VALID;
-- days could be zero in odd legacy rows; only validate going forward
-- (intentionally not VALIDATEd).

ALTER TABLE leave_policies
    DROP CONSTRAINT IF EXISTS chk_leave_policies_accrual_rule,
    ADD CONSTRAINT chk_leave_policies_accrual_rule
        CHECK (accrual_rule IN ('flat','monthly_2_then_30','unlimited','none')) NOT VALID;
ALTER TABLE leave_policies VALIDATE CONSTRAINT chk_leave_policies_accrual_rule;

-- ── Payroll ────────────────────────────────────────────────────────────────
ALTER TABLE payroll_runs
    DROP CONSTRAINT IF EXISTS chk_payroll_runs_status,
    ADD CONSTRAINT chk_payroll_runs_status
        CHECK (status IN ('draft','processing','approved','wps_submitted','paid','failed')) NOT VALID;
ALTER TABLE payroll_runs VALIDATE CONSTRAINT chk_payroll_runs_status;

ALTER TABLE payroll_runs
    DROP CONSTRAINT IF EXISTS chk_payroll_runs_month,
    ADD CONSTRAINT chk_payroll_runs_month
        CHECK (month BETWEEN 1 AND 12) NOT VALID;
ALTER TABLE payroll_runs VALIDATE CONSTRAINT chk_payroll_runs_month;

ALTER TABLE payroll_runs
    DROP CONSTRAINT IF EXISTS chk_payroll_runs_year,
    ADD CONSTRAINT chk_payroll_runs_year
        CHECK (year BETWEEN 2000 AND 2100) NOT VALID;
ALTER TABLE payroll_runs VALIDATE CONSTRAINT chk_payroll_runs_year;

ALTER TABLE payslips
    DROP CONSTRAINT IF EXISTS chk_payslips_amounts_non_negative,
    ADD CONSTRAINT chk_payslips_amounts_non_negative
        CHECK (basic_salary >= 0 AND gross_salary >= 0 AND deductions >= 0 AND net_salary >= 0) NOT VALID;
ALTER TABLE payslips VALIDATE CONSTRAINT chk_payslips_amounts_non_negative;

-- ── Attendance ─────────────────────────────────────────────────────────────
ALTER TABLE attendance_records
    DROP CONSTRAINT IF EXISTS chk_attendance_status,
    ADD CONSTRAINT chk_attendance_status
        CHECK (status IN ('present','absent','half_day','late','wfh','on_leave')) NOT VALID;
ALTER TABLE attendance_records VALIDATE CONSTRAINT chk_attendance_status;

-- ── Assets ─────────────────────────────────────────────────────────────────
ALTER TABLE assets
    DROP CONSTRAINT IF EXISTS chk_assets_status,
    ADD CONSTRAINT chk_assets_status
        CHECK (status IN ('available','assigned','maintenance','lost','retired')) NOT VALID;
ALTER TABLE assets VALIDATE CONSTRAINT chk_assets_status;

ALTER TABLE assets
    DROP CONSTRAINT IF EXISTS chk_assets_condition,
    ADD CONSTRAINT chk_assets_condition
        CHECK (condition IN ('new','good','damaged')) NOT VALID;
ALTER TABLE assets VALIDATE CONSTRAINT chk_assets_condition;

ALTER TABLE asset_assignments
    DROP CONSTRAINT IF EXISTS chk_asset_assignments_status,
    ADD CONSTRAINT chk_asset_assignments_status
        CHECK (status IN ('assigned','returned','lost')) NOT VALID;
ALTER TABLE asset_assignments VALIDATE CONSTRAINT chk_asset_assignments_status;

ALTER TABLE asset_maintenance
    DROP CONSTRAINT IF EXISTS chk_asset_maintenance_status,
    ADD CONSTRAINT chk_asset_maintenance_status
        CHECK (status IN ('open','in_progress','resolved')) NOT VALID;
ALTER TABLE asset_maintenance VALIDATE CONSTRAINT chk_asset_maintenance_status;

-- ── Connected Apps ─────────────────────────────────────────────────────────
ALTER TABLE connected_apps
    DROP CONSTRAINT IF EXISTS chk_connected_apps_status,
    ADD CONSTRAINT chk_connected_apps_status
        CHECK (status IN ('active','revoked')) NOT VALID;
ALTER TABLE connected_apps VALIDATE CONSTRAINT chk_connected_apps_status;

-- ── Tenant Memberships ─────────────────────────────────────────────────────
ALTER TABLE tenant_memberships
    DROP CONSTRAINT IF EXISTS chk_tenant_memberships_role,
    ADD CONSTRAINT chk_tenant_memberships_role
        CHECK (role IN ('super_admin','hr_manager','pro_officer','dept_head','employee')) NOT VALID;
ALTER TABLE tenant_memberships VALIDATE CONSTRAINT chk_tenant_memberships_role;

ALTER TABLE tenant_memberships
    DROP CONSTRAINT IF EXISTS chk_tenant_memberships_invite_status,
    ADD CONSTRAINT chk_tenant_memberships_invite_status
        CHECK (invite_status IN ('pending','accepted','revoked')) NOT VALID;
ALTER TABLE tenant_memberships VALIDATE CONSTRAINT chk_tenant_memberships_invite_status;

-- ── Notifications ──────────────────────────────────────────────────────────
ALTER TABLE notifications
    DROP CONSTRAINT IF EXISTS chk_notifications_type,
    ADD CONSTRAINT chk_notifications_type
        CHECK (type IN ('info','warning','error','success')) NOT VALID;
ALTER TABLE notifications VALIDATE CONSTRAINT chk_notifications_type;

-- ── Exit Requests ──────────────────────────────────────────────────────────
ALTER TABLE exit_requests
    DROP CONSTRAINT IF EXISTS chk_exit_requests_type,
    ADD CONSTRAINT chk_exit_requests_type
        CHECK (exit_type IN ('resignation','termination','contract_end','retirement')) NOT VALID;
ALTER TABLE exit_requests VALIDATE CONSTRAINT chk_exit_requests_type;

ALTER TABLE exit_requests
    DROP CONSTRAINT IF EXISTS chk_exit_requests_status,
    ADD CONSTRAINT chk_exit_requests_status
        CHECK (status IN ('pending','approved','rejected','completed')) NOT VALID;
ALTER TABLE exit_requests VALIDATE CONSTRAINT chk_exit_requests_status;
