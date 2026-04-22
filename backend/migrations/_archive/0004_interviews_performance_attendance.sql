CREATE TABLE IF NOT EXISTS "interviews" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "application_id" uuid NOT NULL REFERENCES "job_applications"("id") ON DELETE CASCADE,
    "interviewer_user_id" uuid REFERENCES "users"("id"),
    "scheduled_at" timestamptz NOT NULL,
    "duration_minutes" text DEFAULT '60' NOT NULL,
    "type" text DEFAULT 'video' NOT NULL,
    "link" text,
    "location" text,
    "status" text DEFAULT 'scheduled' NOT NULL,
    "feedback" text,
    "rating" text,
    "passed" boolean,
    "notes" text,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "performance_reviews" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "employee_id" uuid NOT NULL REFERENCES "employees"("id"),
    "reviewer_id" uuid REFERENCES "users"("id"),
    "period" text NOT NULL,
    "review_date" date,
    "status" text DEFAULT 'draft' NOT NULL,
    "overall_rating" integer,
    "quality_score" integer,
    "productivity_score" integer,
    "teamwork_score" integer,
    "attendance_score" integer,
    "initiative_score" integer,
    "strengths" text,
    "improvements" text,
    "goals" text,
    "manager_comments" text,
    "employee_comments" text,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "attendance_records" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "employee_id" uuid NOT NULL REFERENCES "employees"("id"),
    "date" date NOT NULL,
    "check_in" timestamptz,
    "check_out" timestamptz,
    "hours_worked" numeric(5, 2),
    "overtime_hours" numeric(5, 2) DEFAULT '0',
    "status" text DEFAULT 'present' NOT NULL,
    "notes" text,
    "approved_by" uuid,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "updated_at" timestamptz DEFAULT now() NOT NULL
);
