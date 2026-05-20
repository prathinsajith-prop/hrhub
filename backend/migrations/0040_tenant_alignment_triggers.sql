-- Tenant-alignment triggers for the remaining high-traffic junction tables.
--
-- Mirrors the pattern landed in 0039_team_member_tenant_guard.sql. Each
-- BEFORE INSERT/UPDATE trigger refuses to write a row whose tenant_id
-- disagrees with the linked parent rows' tenant_id. FK constraints alone
-- can't express this (Postgres CHECK can't reference other tables), and
-- application-layer validation is easy to bypass via direct DB writes,
-- imports, or seed scripts.
--
-- Tables guarded by this migration:
--   * payslips         — tenant_id must match payroll_runs and employees
--   * leave_requests   — tenant_id must match employees (and handover_to when set)
--   * attendance_records — tenant_id must match employees
--
-- A pre-audit at migration write time showed 0 rows of drift on each
-- table, so no DELETE step is needed; if drift is ever found by a future
-- audit, clean it up explicitly before re-running.

-- ────────────────────────────────────────────────────────────────────────
-- payslips
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enforce_payslip_tenant_alignment()
RETURNS TRIGGER AS $$
DECLARE
    run_tenant uuid;
    emp_tenant uuid;
BEGIN
    SELECT tenant_id INTO run_tenant FROM payroll_runs WHERE id = NEW.payroll_run_id;
    SELECT tenant_id INTO emp_tenant FROM employees WHERE id = NEW.employee_id;

    IF run_tenant IS NULL THEN
        RAISE EXCEPTION 'payslips.payroll_run_id % does not exist', NEW.payroll_run_id;
    END IF;
    IF emp_tenant IS NULL THEN
        RAISE EXCEPTION 'payslips.employee_id % does not exist', NEW.employee_id;
    END IF;
    IF NEW.tenant_id <> run_tenant THEN
        RAISE EXCEPTION 'payslips.tenant_id % does not match payroll_run tenant %', NEW.tenant_id, run_tenant;
    END IF;
    IF NEW.tenant_id <> emp_tenant THEN
        RAISE EXCEPTION 'payslips.tenant_id % does not match employee tenant %', NEW.tenant_id, emp_tenant;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payslips_tenant_alignment ON payslips;
CREATE TRIGGER trg_payslips_tenant_alignment
    BEFORE INSERT OR UPDATE OF tenant_id, payroll_run_id, employee_id ON payslips
    FOR EACH ROW
    EXECUTE FUNCTION enforce_payslip_tenant_alignment();

-- ────────────────────────────────────────────────────────────────────────
-- leave_requests
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enforce_leave_request_tenant_alignment()
RETURNS TRIGGER AS $$
DECLARE
    emp_tenant uuid;
    handover_tenant uuid;
BEGIN
    SELECT tenant_id INTO emp_tenant FROM employees WHERE id = NEW.employee_id;
    IF emp_tenant IS NULL THEN
        RAISE EXCEPTION 'leave_requests.employee_id % does not exist', NEW.employee_id;
    END IF;
    IF NEW.tenant_id <> emp_tenant THEN
        RAISE EXCEPTION 'leave_requests.tenant_id % does not match employee tenant %', NEW.tenant_id, emp_tenant;
    END IF;

    -- handover_to is nullable; only validate when set
    IF NEW.handover_to IS NOT NULL THEN
        SELECT tenant_id INTO handover_tenant FROM employees WHERE id = NEW.handover_to;
        IF handover_tenant IS NULL THEN
            RAISE EXCEPTION 'leave_requests.handover_to % does not exist', NEW.handover_to;
        END IF;
        IF NEW.tenant_id <> handover_tenant THEN
            RAISE EXCEPTION 'leave_requests.tenant_id % does not match handover_to tenant %', NEW.tenant_id, handover_tenant;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leave_requests_tenant_alignment ON leave_requests;
CREATE TRIGGER trg_leave_requests_tenant_alignment
    BEFORE INSERT OR UPDATE OF tenant_id, employee_id, handover_to ON leave_requests
    FOR EACH ROW
    EXECUTE FUNCTION enforce_leave_request_tenant_alignment();

-- ────────────────────────────────────────────────────────────────────────
-- attendance_records
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enforce_attendance_tenant_alignment()
RETURNS TRIGGER AS $$
DECLARE
    emp_tenant uuid;
BEGIN
    SELECT tenant_id INTO emp_tenant FROM employees WHERE id = NEW.employee_id;
    IF emp_tenant IS NULL THEN
        RAISE EXCEPTION 'attendance_records.employee_id % does not exist', NEW.employee_id;
    END IF;
    IF NEW.tenant_id <> emp_tenant THEN
        RAISE EXCEPTION 'attendance_records.tenant_id % does not match employee tenant %', NEW.tenant_id, emp_tenant;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_attendance_tenant_alignment ON attendance_records;
CREATE TRIGGER trg_attendance_tenant_alignment
    BEFORE INSERT OR UPDATE OF tenant_id, employee_id ON attendance_records
    FOR EACH ROW
    EXECUTE FUNCTION enforce_attendance_tenant_alignment();
