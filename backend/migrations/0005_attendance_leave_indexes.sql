-- ─── Attendance indexes ───────────────────────────────────────────────────────
-- attendance_records had zero indexes; every query was a full table scan.

CREATE INDEX IF NOT EXISTS "idx_attendance_tenant"
    ON "attendance_records" ("tenant_id");

CREATE INDEX IF NOT EXISTS "idx_attendance_employee"
    ON "attendance_records" ("employee_id");

-- Composite for dashboard/summary queries (tenant + date range)
CREATE INDEX IF NOT EXISTS "idx_attendance_tenant_date"
    ON "attendance_records" ("tenant_id", "date");

-- Composite for per-employee history and check-in/check-out lookup
CREATE INDEX IF NOT EXISTS "idx_attendance_employee_date"
    ON "attendance_records" ("employee_id", "date");

-- One attendance record per employee per day
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_attendance_employee_date"
    ON "attendance_records" ("employee_id", "date");

-- ─── Leave request composite indexes ─────────────────────────────────────────
-- Dashboard KPI counts pending leaves by tenant+status; this index makes it O(log n).

CREATE INDEX IF NOT EXISTS "idx_leave_tenant_status"
    ON "leave_requests" ("tenant_id", "status");

-- Employee leave history within a date range
CREATE INDEX IF NOT EXISTS "idx_leave_tenant_employee"
    ON "leave_requests" ("tenant_id", "employee_id");
