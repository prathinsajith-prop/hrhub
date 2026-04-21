CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid,
	"category" text NOT NULL,
	"doc_type" text NOT NULL,
	"file_name" text NOT NULL,
	"s3_key" text,
	"file_size" bigint,
	"expiry_date" date,
	"status" text DEFAULT 'pending_upload' NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"employee_no" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"nationality" text,
	"passport_no" text,
	"emirates_id" text,
	"date_of_birth" date,
	"gender" text,
	"department" text,
	"designation" text,
	"reporting_to" uuid,
	"join_date" date NOT NULL,
	"status" text DEFAULT 'onboarding' NOT NULL,
	"basic_salary" numeric(12, 2),
	"total_salary" numeric(12, 2),
	"visa_status" text,
	"visa_expiry" date,
	"passport_expiry" date,
	"emiratisation_category" text,
	"avatar_url" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entity_name" text NOT NULL,
	"license_type" text,
	"free_zone_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"trade_license_no" text NOT NULL,
	"jurisdiction" text NOT NULL,
	"industry_type" text NOT NULL,
	"subscription_plan" text DEFAULT 'starter' NOT NULL,
	"logo_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_trade_license_no_unique" UNIQUE("trade_license_no")
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entity_id" uuid,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'employee' NOT NULL,
	"department" text,
	"avatar_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "job_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"nationality" text,
	"stage" text DEFAULT 'received' NOT NULL,
	"score" integer DEFAULT 0,
	"experience" integer,
	"expected_salary" numeric(12, 2),
	"current_salary" numeric(12, 2),
	"resume_url" text,
	"notes" text,
	"applied_date" date DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recruitment_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"department" text,
	"location" text,
	"type" text DEFAULT 'full_time' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"openings" integer DEFAULT 1 NOT NULL,
	"min_salary" numeric(12, 2),
	"max_salary" numeric(12, 2),
	"industry" text,
	"description" text,
	"requirements" jsonb DEFAULT '[]'::jsonb,
	"closing_date" date,
	"posted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visa_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"visa_type" text NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"current_step" integer DEFAULT 1 NOT NULL,
	"total_steps" integer DEFAULT 8 NOT NULL,
	"mohre_ref" text,
	"gdfr_ref" text,
	"icp_ref" text,
	"start_date" date DEFAULT now() NOT NULL,
	"expiry_date" date,
	"urgency_level" text DEFAULT 'normal' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_checklists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"start_date" date,
	"due_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_employee_unique" UNIQUE("employee_id")
);
--> statement-breakpoint
CREATE TABLE "onboarding_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checklist_id" uuid NOT NULL,
	"step_order" integer NOT NULL,
	"title" text NOT NULL,
	"owner" text,
	"sla_days" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"due_date" date,
	"completed_date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"total_employees" integer DEFAULT 0 NOT NULL,
	"total_gross" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_deductions" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_net" numeric(14, 2) DEFAULT '0' NOT NULL,
	"wps_file_ref" text,
	"processed_date" date,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_month_year_unique" UNIQUE("tenant_id","month","year")
);
--> statement-breakpoint
CREATE TABLE "payslips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payroll_run_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"basic_salary" numeric(12, 2) DEFAULT '0' NOT NULL,
	"housing_allowance" numeric(12, 2) DEFAULT '0' NOT NULL,
	"transport_allowance" numeric(12, 2) DEFAULT '0' NOT NULL,
	"other_allowances" numeric(12, 2) DEFAULT '0' NOT NULL,
	"overtime" numeric(12, 2) DEFAULT '0' NOT NULL,
	"commission" numeric(12, 2) DEFAULT '0' NOT NULL,
	"gross_salary" numeric(12, 2) DEFAULT '0' NOT NULL,
	"deductions" numeric(12, 2) DEFAULT '0' NOT NULL,
	"net_salary" numeric(12, 2) DEFAULT '0' NOT NULL,
	"days_worked" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"leave_type" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"days" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"applied_date" date DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"ip_address" text,
	"user_agent" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"action_url" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_job_id_recruitment_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."recruitment_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_jobs" ADD CONSTRAINT "recruitment_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_jobs" ADD CONSTRAINT "recruitment_jobs_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visa_applications" ADD CONSTRAINT "visa_applications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visa_applications" ADD CONSTRAINT "visa_applications_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_checklists" ADD CONSTRAINT "onboarding_checklists_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_checklists" ADD CONSTRAINT "onboarding_checklists_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_steps" ADD CONSTRAINT "onboarding_steps_checklist_id_onboarding_checklists_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."onboarding_checklists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_payroll_run_id_payroll_runs_id_fk" FOREIGN KEY ("payroll_run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_documents_tenant" ON "documents" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_documents_employee" ON "documents" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_documents_expiry" ON "documents" USING btree ("expiry_date");--> statement-breakpoint
CREATE INDEX "idx_documents_status" ON "documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_employees_tenant" ON "employees" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_employees_entity" ON "employees" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "idx_employees_status" ON "employees" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_employees_visa_expiry" ON "employees" USING btree ("visa_expiry");--> statement-breakpoint
CREATE INDEX "idx_refresh_tokens_user" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_users_tenant" ON "users" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_applications_job" ON "job_applications" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "idx_applications_tenant" ON "job_applications" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_applications_stage" ON "job_applications" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "idx_jobs_tenant" ON "recruitment_jobs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_jobs_status" ON "recruitment_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_visa_tenant" ON "visa_applications" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_visa_employee" ON "visa_applications" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_visa_status" ON "visa_applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_checklist_employee" ON "onboarding_checklists" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_steps_checklist" ON "onboarding_steps" USING btree ("checklist_id");--> statement-breakpoint
CREATE INDEX "idx_payroll_tenant" ON "payroll_runs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_payslips_run" ON "payslips" USING btree ("payroll_run_id");--> statement-breakpoint
CREATE INDEX "idx_payslips_employee" ON "payslips" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_leave_tenant" ON "leave_requests" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_leave_employee" ON "leave_requests" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_leave_status" ON "leave_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_audit_tenant" ON "audit_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_audit_created" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_tenant" ON "notifications" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_user" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_read" ON "notifications" USING btree ("is_read");