-- Multi-punch log for attendance.
--
-- Previously: one attendance_records row per (employee, date) carried a
-- single check_in + check_out — HR couldn't capture lunch break punches,
-- field-staff who clock in/out multiple times, or location data per punch.
--
-- Now: attendance_punches is the authoritative event log. Every clock action
-- (web button, mobile app, biometric device, manual HR entry) inserts a row
-- here with timestamp + type + location.
--
-- attendance_records stays as the daily rollup view: check_in = first 'in'
-- punch of the day, check_out = last 'out' punch, hours_worked = sum across
-- paired in→out segments.

CREATE TABLE IF NOT EXISTS "attendance_punches" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "employee_id" uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
    "date" date NOT NULL,
    "punch_type" text NOT NULL,
    "recorded_at" timestamp with time zone NOT NULL DEFAULT now(),
    "location_name" text,
    "latitude" numeric(10, 7),
    "longitude" numeric(10, 7),
    "source" text NOT NULL DEFAULT 'web',
    "device_id" text,
    "notes" text,
    "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "attendance_punches_punch_type_check" CHECK ("punch_type" IN ('in', 'out')),
    CONSTRAINT "attendance_punches_source_check" CHECK ("source" IN ('web', 'mobile', 'biometric', 'manual'))
);

-- Per-day lookup — used by getPunchesForDay and the recompute pass that
-- updates the daily rollup.
CREATE INDEX IF NOT EXISTS "idx_attendance_punches_emp_date"
    ON "attendance_punches"("employee_id", "date");

-- Tenant-wide reports + audit feeds
CREATE INDEX IF NOT EXISTS "idx_attendance_punches_tenant_date"
    ON "attendance_punches"("tenant_id", "date");

-- Chronological order within a day — index supports ORDER BY recorded_at
CREATE INDEX IF NOT EXISTS "idx_attendance_punches_emp_recorded"
    ON "attendance_punches"("employee_id", "recorded_at");

-- Backfill: convert each existing attendance_records.check_in into one 'in'
-- punch and each check_out into one 'out' punch. Preserves history so HR can
-- still review days that pre-date this migration.
INSERT INTO "attendance_punches" ("tenant_id", "employee_id", "date", "punch_type", "recorded_at", "source")
SELECT "tenant_id", "employee_id", "date", 'in', "check_in", 'web'
FROM "attendance_records"
WHERE "check_in" IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO "attendance_punches" ("tenant_id", "employee_id", "date", "punch_type", "recorded_at", "source")
SELECT "tenant_id", "employee_id", "date", 'out', "check_out", 'web'
FROM "attendance_records"
WHERE "check_out" IS NOT NULL
ON CONFLICT DO NOTHING;
