CREATE TABLE "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"date" date NOT NULL,
	"check_in" timestamp with time zone,
	"check_out" timestamp with time zone,
	"hours_worked" numeric(5, 2),
	"overtime_hours" numeric(5, 2) DEFAULT '0',
	"status" text DEFAULT 'present' NOT NULL,
	"notes" text,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"actor_name" text,
	"actor_role" text,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"entity_name" text,
	"action" text NOT NULL,
	"changes" jsonb,
	"metadata" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"user_id" uuid,
	"email" text,
	"event_type" text NOT NULL,
	"success" boolean DEFAULT true NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"browser" text,
	"browser_version" text,
	"os" text,
	"os_version" text,
	"device_type" text,
	"country" text,
	"city" text,
	"failure_reason" text,
	"session_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"template_type" text NOT NULL,
	"body" text NOT NULL,
	"variables" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"s3_key" text NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer,
	"uploaded_by" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exit_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"exit_type" text NOT NULL,
	"exit_date" date NOT NULL,
	"last_working_day" date NOT NULL,
	"reason" text,
	"notice_period_days" numeric(5, 0) DEFAULT '30' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"gratuity_amount" numeric(12, 2),
	"leave_encashment_amount" numeric(12, 2),
	"unpaid_salary_amount" numeric(12, 2),
	"deductions" numeric(12, 2) DEFAULT '0',
	"total_settlement" numeric(12, 2),
	"settlement_paid" boolean DEFAULT false,
	"settlement_paid_date" date,
	"approved_by" uuid,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "interviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"interviewer_user_id" uuid,
	"scheduled_at" timestamp with time zone NOT NULL,
	"duration_minutes" text DEFAULT '60' NOT NULL,
	"type" text DEFAULT 'video' NOT NULL,
	"link" text,
	"location" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"feedback" text,
	"rating" text,
	"passed" boolean,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "performance_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"reviewer_id" uuid,
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "work_email" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "personal_email" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "mobile_no" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "marital_status" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "grade_level" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "manager_name" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "labour_card_number" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "bank_name" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "iban" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "housing_allowance" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "transport_allowance" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "other_allowances" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "payment_method" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "emergency_contact" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "home_country_address" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "visa_number" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "visa_issue_date" date;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "visa_type" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "emirates_id_expiry" date;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "sponsoring_entity" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "contract_type" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "work_location" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "probation_end_date" date;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "contract_end_date" date;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "failed_login_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_history" ADD CONSTRAINT "login_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_history" ADD CONSTRAINT "login_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exit_requests" ADD CONSTRAINT "exit_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exit_requests" ADD CONSTRAINT "exit_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_application_id_job_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."job_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_interviewer_user_id_users_id_fk" FOREIGN KEY ("interviewer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_activity_logs_tenant" ON "activity_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_activity_logs_user" ON "activity_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_activity_logs_entity" ON "activity_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_activity_logs_created" ON "activity_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_login_history_user" ON "login_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_login_history_tenant" ON "login_history" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_login_history_created" ON "login_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_login_history_event" ON "login_history" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_doc_templates_tenant" ON "document_templates" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_doc_templates_type" ON "document_templates" USING btree ("template_type");--> statement-breakpoint
CREATE INDEX "idx_doc_versions_document" ON "document_versions" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "idx_doc_versions_tenant" ON "document_versions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_password_reset_tokens_user" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_employees_tenant_status" ON "employees" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_employees_tenant_dept" ON "employees" USING btree ("tenant_id","department");--> statement-breakpoint
CREATE INDEX "idx_employees_passport_expiry" ON "employees" USING btree ("tenant_id","passport_expiry");--> statement-breakpoint
CREATE INDEX "idx_employees_eid_expiry" ON "employees" USING btree ("tenant_id","emirates_id_expiry");--> statement-breakpoint
CREATE INDEX "idx_employees_active" ON "employees" USING btree ("tenant_id") WHERE "employees"."is_archived" = false;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_employees_no_tenant" ON "employees" USING btree ("tenant_id","employee_no");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_employees_email_tenant" ON "employees" USING btree ("tenant_id","email") WHERE "employees"."email" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "chk_employees_salary_positive" CHECK ("employees"."basic_salary" IS NULL OR "employees"."basic_salary" >= 0);--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "chk_employees_total_gte_basic" CHECK ("employees"."total_salary" IS NULL OR "employees"."basic_salary" IS NULL OR "employees"."total_salary" >= "employees"."basic_salary");--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "chk_employees_gender" CHECK ("employees"."gender" IN ('male', 'female'));--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "chk_employees_contract_after_join" CHECK ("employees"."contract_end_date" IS NULL OR "employees"."contract_end_date" >= "employees"."join_date");--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "chk_employees_probation_after_join" CHECK ("employees"."probation_end_date" IS NULL OR "employees"."probation_end_date" >= "employees"."join_date");