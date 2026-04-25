# HRHub.ae — 30-Week Task List

> Multi-Tenant UAE HR & PRO Platform · Full Implementation Roadmap  
> Sprint duration: 1 week · Start date: Week 1

---

## Legend

| Symbol | Meaning |
|--------|---------|
| 🔴 | Critical — blocks functionality |
| 🟠 | High — core feature missing |
| 🟡 | Medium — important for completeness |
| 🟢 | Enhancement — improves quality |
| `BE` | Backend task |
| `FE` | Frontend task |
| `FS` | Full Stack |
| `OPS` | DevOps / Infrastructure |

---

## Phase 1 — Bug Fixes & Foundation (Weeks 1–6)

> **Goal:** Make every existing screen actually work. No hardcoded data. No dead buttons. Before writing a single new feature, the existing codebase must be correct.

---

### Week 1 — Schema Fixes & Type Safety

| # | Task | Type | Priority | Est. |
|---|------|------|----------|------|
| 1.1 | Add 14 missing columns to `employees` table: `mobile_no`, `personal_email`, `work_email`, `marital_status`, `home_country_address`, `emergency_contact`, `grade_level`, `work_location`, `contract_type`, `probation_end_date`, `contract_end_date`, `labour_card_number`, `bank_name`, `iban` | `BE` | 🔴 | 1d |
| 1.2 | Add salary allowance columns to `employees`: `housing_allowance`, `transport_allowance`, `other_allowances`, `payment_method` | `BE` | 🔴 | 0.5d |
| 1.3 | Create `fullName` computed mapper in `employees.service.ts` — concatenate `first_name + last_name` in all list/detail responses | `BE` | 🔴 | 0.5d |
| 1.4 | Add `manager_name` join in `getEmployee()` — resolve `reportingTo` UUID to employee's full name | `BE` | 🔴 | 0.5d |
| 1.5 | Generate Drizzle migration files with `pnpm drizzle-kit generate`, then run them with `pnpm drizzle-kit migrate` | `BE` | 🔴 | 0.5d |
| 1.6 | Update frontend `Employee` type in `src/types/index.ts` to match new DB column names exactly | `FE` | 🔴 | 0.5d |
| 1.7 | Remove `// @ts-nocheck` from `employees.routes.ts` and fix all resulting type errors | `BE` | 🔴 | 1d |
| 1.8 | Remove `// @ts-nocheck` from `visa.routes.ts`, `documents.routes.ts`, `payroll.routes.ts` | `BE` | 🔴 | 1d |
| 1.9 | Remove `// @ts-nocheck` from remaining 6 route files and fix type errors | `BE` | 🔴 | 1d |

---

### Week 2 — Security & Auth Hardening

| # | Task | Type | Priority | Est. |
|---|------|------|----------|------|
| 2.1 | Add route-level rate limiting on `POST /api/v1/auth/login` — max 10 requests per 15 minutes per IP using `@fastify/rate-limit` route override | `BE` | 🔴 | 0.5d |
| 2.2 | Add rate limiting on `POST /api/v1/auth/refresh` — max 20 requests per 15 minutes per IP | `BE` | 🔴 | 0.5d |
| 2.3 | Validate `Content-Type: application/json` on all POST/PATCH routes — reject malformed requests with 415 | `BE` | 🟠 | 0.5d |
| 2.4 | Add Fastify JSON Schema to every route that currently has no body/querystring schema | `BE` | 🟠 | 2d |
| 2.5 | Add `X-Request-ID` correlation header to all responses for log tracing | `BE` | 🟡 | 0.5d |
| 2.6 | Ensure JWT `sub` field matches `userId` consistently — fix auth plugin to use `payload.sub` not `payload.userId` | `BE` | 🔴 | 0.5d |
| 2.7 | Add `helmet` CSP headers for frontend static assets — configure `contentSecurityPolicy` properly | `BE` | 🟠 | 0.5d |
| 2.8 | Confirm `refreshTokens` table has index on `token_hash` and `expires_at` — add cleanup job for expired tokens | `BE` | 🟡 | 0.5d |

---

### Week 3 — Dashboard & Frontend Data Integrity

| # | Task | Type | Priority | Est. |
|---|------|------|----------|------|
| 3.1 | Add `GET /api/v1/dashboard/payroll-trend` endpoint — return last 6 months of net payroll from `payroll_runs` table grouped by month/year | `BE` | 🔴 | 1d |
| 3.2 | Add `GET /api/v1/dashboard/nationality-breakdown` endpoint — return `COUNT(*)` grouped by `nationality` from active employees | `BE` | 🔴 | 0.5d |
| 3.3 | Add `GET /api/v1/dashboard/dept-headcount` endpoint — return `COUNT(*)` grouped by `department` from active employees | `BE` | 🔴 | 0.5d |
| 3.4 | Remove hardcoded `payrollTrend`, `nationalityData`, `departmentData` arrays from `DashboardPage.tsx` | `FE` | 🔴 | 0.5d |
| 3.5 | Add `useDashboardPayrollTrend()`, `useNationalityBreakdown()`, `useDeptHeadcount()` React Query hooks | `FE` | 🔴 | 0.5d |
| 3.6 | Connect dashboard AreaChart, PieChart, and BarChart to the new live hooks — add loading skeletons | `FE` | 🔴 | 1d |
| 3.7 | Add `useNotifications()` hook result to real-time bell count in `SiteHeader` — replace hardcoded `3` badge | `FE` | 🟠 | 0.5d |
| 3.8 | Add `useDashboardKPIs()` loading skeleton — replace `—` fallback with animated skeleton during fetch | `FE` | 🟡 | 0.5d |
| 3.9 | Wire "View all" button in Dashboard alert banner to navigate to the relevant module | `FE` | 🟡 | 0.5d |

---

### Week 4 — File Storage & Document Upload

| # | Task | Type | Priority | Est. |
|---|------|------|----------|------|
| 4.1 | Create `src/plugins/s3.ts` — Fastify plugin wrapping AWS SDK v3 (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`) | `BE` | 🔴 | 1d |
| 4.2 | Add `S3_BUCKET`, `S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` to `env.ts` with validation | `BE` | 🔴 | 0.5d |
| 4.3 | Add `POST /api/v1/documents/upload-url` endpoint — generate presigned S3 PUT URL (5-minute expiry) and return `s3Key` + `uploadUrl` | `BE` | 🔴 | 1d |
| 4.4 | Add `GET /api/v1/documents/:id/download-url` endpoint — generate presigned S3 GET URL (1-hour expiry) | `BE` | 🔴 | 0.5d |
| 4.5 | Install `@fastify/multipart` — add `POST /api/v1/documents/upload` multipart endpoint as alternative to presigned URL flow | `BE` | 🟠 | 1d |
| 4.6 | Update `DocumentsPage.tsx` upload dialog — on file select: call `/upload-url`, PUT file to S3, then POST metadata to `/documents` | `FE` | 🔴 | 1d |
| 4.7 | Add upload progress indicator in the `ImageUpload` component using `XMLHttpRequest` progress events | `FE` | 🟡 | 0.5d |
| 4.8 | Update docker-compose.yml to include MinIO service as S3-compatible local alternative for development | `OPS` | 🟠 | 0.5d |

---

### Week 5 — Add Employee & Core CRUD Forms

| # | Task | Type | Priority | Est. |
|---|------|------|----------|------|
| 5.1 | Build "Add Employee" 3-step dialog — Step 1: Personal Info (name, DOB, gender, nationality, passport, contact) | `FE` | 🔴 | 1d |
| 5.2 | "Add Employee" Step 2: Employment Details (employee no, department, designation, join date, contract type, work location, reporting manager) | `FE` | 🔴 | 1d |
| 5.3 | "Add Employee" Step 3: Salary & Payroll (basic salary, housing, transport, other allowances, payment method, bank name, IBAN) | `FE` | 🔴 | 1d |
| 5.4 | Wire Add Employee form submit to `POST /api/v1/employees` using `useCreateEmployee()` mutation — invalidate `employees` query on success | `FS` | 🔴 | 0.5d |
| 5.5 | Build "Edit Employee" dialog — pre-fill all fields from existing employee record; wire to `PATCH /api/v1/employees/:id` | `FE` | 🟠 | 1d |
| 5.6 | Build "Apply Leave" dialog — leave type select, date range picker, reason textarea, medical certificate upload for sick leave | `FE` | 🔴 | 1d |
| 5.7 | Wire Apply Leave submit to `POST /api/v1/leave` — validate start < end date; wire approval/rejection actions to `PATCH /api/v1/leave/:id` | `FS` | 🔴 | 0.5d |

---

### Week 6 — Recruitment & Visa Forms + Test Infrastructure

| # | Task | Type | Priority | Est. |
|---|------|------|----------|------|
| 6.1 | Build "New Job Requisition" dialog — title, department, location, type, openings, min/max salary, description, closing date | `FE` | 🟠 | 1d |
| 6.2 | Wire New Job form to `POST /api/v1/jobs` — invalidate `jobs` query; show new job in list immediately | `FS` | 🟠 | 0.5d |
| 6.3 | Build "New Visa Application" wizard — Step 1: select employee + visa type; Step 2: urgency + notes; Step 3: confirm | `FE` | 🟠 | 1.5d |
| 6.4 | Wire Visa Application wizard to `POST /api/v1/visa` — display MOHRE ref placeholder; invalidate `visa` query | `FS` | 🟠 | 0.5d |
| 6.5 | Set up Vitest for backend — `pnpm add -D vitest @vitest/coverage-v8` — configure `vitest.config.ts` | `BE` | 🟠 | 0.5d |
| 6.6 | Write unit tests for `calculateGratuity()` — all edge cases: < 1 year, 1–5 years, > 5 years, cap at 2 years | `BE` | 🟠 | 0.5d |
| 6.7 | Write unit tests for `getExpiringVisas()` — mock DB, test cutoff date filter, test ordering | `BE` | 🟠 | 0.5d |
| 6.8 | Write unit tests for `listEmployees()` — test search, status filter, department filter, pagination | `BE` | 🟠 | 0.5d |
| 6.9 | Set up Vitest for frontend — configure with `jsdom`, add `@testing-library/react` | `FE` | 🟡 | 0.5d |

---

## Phase 2 — Core Features (Weeks 7–14)

> **Goal:** Deliver the most important HR features. A working payroll engine, visa workflow, leave system, and document management that actually persists files.

---

### Week 7 — Payroll Calculation Engine

| # | Task | Type | Priority | Est. |
|---|------|------|----------|------|
| 7.1 | Build `calculatePayslip(employeeId, month, year)` in `payroll.service.ts` — fetch employee salary components, compute gross = basic + housing + transport + other | `BE` | 🔴 | 1d |
| 7.2 | Apply leave deductions in payslip calculation — fetch approved leave for the period, deduct unpaid days, half-pay sick days | `BE` | 🟠 | 1d |
| 7.3 | Add `POST /api/v1/payroll/:id/run` endpoint — calculate payslips for all active employees in tenant; store in `payslips` table; update `payroll_runs` totals | `BE` | 🔴 | 1d |
| 7.4 | Add `GET /api/v1/payroll/:id/payslips` endpoint — return all payslips for a run with employee details joined | `BE` | 🟠 | 0.5d |
| 7.5 | Wire "Run Payroll" confirm dialog in `PayrollPage.tsx` to the actual `POST /payroll/:id/run` endpoint — replace immediate toast with async status polling | `FE` | 🔴 | 1d |
| 7.6 | Add payroll run status polling — `GET /api/v1/payroll/:id` every 3 seconds while `status === 'processing'` | `FE` | 🟠 | 0.5d |
| 7.7 | Write unit tests for payslip calculation — test gross total, leave deduction logic, edge cases | `BE` | 🟠 | 1d |

---

### Week 8 — WPS SIF File Generation

| # | Task | Type | Priority | Est. |
|---|------|------|----------|------|
| 8.1 | Implement `generateSifFile(payrollRunId, tenantId)` in `payroll.service.ts` — MOHRE SIF v1.2 format with EDR header, SIF header, employee records | `BE` | 🔴 | 2d |
| 8.2 | SIF employee record fields: Employer Code, Employee ID, Days Worked, Basic Salary, Allowances, Deductions, Net Pay, Bank Code, IBAN — pipe-delimited | `BE` | 🔴 | 1d |
| 8.3 | Validate SIF record: check IBAN format, bank routing code, salary matches `labour_card` registration | `BE` | 🟠 | 0.5d |
| 8.4 | Add `GET /api/v1/payroll/:id/wps-file` endpoint — stream generated SIF as downloadable `.txt` file | `BE` | 🔴 | 0.5d |
| 8.5 | Add `POST /api/v1/payroll/:id/submit-wps` endpoint — mark run as `wps_submitted`, store submission timestamp and bank reference | `BE` | 🟠 | 0.5d |
| 8.6 | Wire "Export WPS" button in `PayrollPage` to `GET /payroll/:id/wps-file` — trigger browser file download | `FE` | 🔴 | 0.5d |
| 8.7 | Wire "Submit WPS" button to `POST /payroll/:id/submit-wps` — show status badge change in real time | `FE` | 🟠 | 0.5d |
| 8.8 | Write unit tests for SIF generation — validate field positions, line length, IBAN masking, header format | `BE` | 🟠 | 0.5d |

---

### Week 9 — Payslip PDF & Leave Balance

| # | Task | Type | Priority | Est. |
|---|------|------|----------|------|
| 9.1 | Install `pdfkit` — create `generatePayslipPdf(payslip, employee, tenant)` function in a new `src/lib/pdf.ts` | `BE` | 🟠 | 1d |
| 9.2 | Payslip PDF layout: company header + logo, employee details, salary breakdown table, deductions, net pay, YTD totals, IBAN | `BE` | 🟠 | 1.5d |
| 9.3 | Upload generated payslip PDF to S3 under `tenants/{tenantId}/payslips/{runId}/{employeeId}.pdf` — store S3 key in `payslips` table | `BE` | 🟠 | 0.5d |
| 9.4 | Add `GET /api/v1/payroll/payslips/:id/download` endpoint — return presigned S3 URL for payslip PDF | `BE` | 🟠 | 0.5d |
| 9.5 | Build leave balance engine — `calculateLeaveBalance(employeeId)` returning accrued annual days, used days, remaining | `BE` | 🟠 | 1d |
| 9.6 | Annual leave accrual rule: clarify UAE Labour Law Art. 29 implementation — accrue 2 calendar days per month after 6 months and up to 1 year of service, then 30 calendar days per year after completing 1 year | `BE` | 🔴 | 0.5d |
| 9.7 | Add `GET /api/v1/leave/balance/:employeeId` endpoint — return all leave types with entitlement, used, and remaining | `BE` | 🟠 | 0.5d |
| 9.8 | Display leave balance on employee profile Payroll tab and on the Leave page header | `FE` | 🟠 | 0.5d |

---

### Week 10 — Automated Expiry Alerts

| # | Task | Type | Priority | Est. |
|---|------|------|----------|------|
| 10.1 | Add Redis service to `docker-compose.yml` — `redis:7-alpine` with volume and health check | `OPS` | 🟠 | 0.5d |
| 10.2 | Install and configure BullMQ — create `src/workers/index.ts` registering all queues on app startup | `BE` | 🟠 | 1d |
| 10.3 | Create `visa-expiry.worker.ts` — daily job querying `visa_applications.expiry_date` for 90/60/30/7 day thresholds; create `notifications` rows | `BE` | 🔴 | 1d |
| 10.4 | Create `document-expiry.worker.ts` — daily job querying `documents.expiry_date` for 90/60/30 day thresholds; auto-update `status` to `expiring_soon` | `BE` | 🔴 | 1d |
| 10.5 | Create `contract-expiry.worker.ts` — daily job querying `employees.contract_end_date` for 90/30 day thresholds; notify HR Manager | `BE` | 🟠 | 0.5d |
| 10.6 | Create `passport-expiry.worker.ts` — daily job querying `employees.passport_expiry`; alert PRO Officer 180/90/30 days before | `BE` | 🟠 | 0.5d |
| 10.7 | Register all workers with a BullMQ cron scheduler — run daily at 06:00 UAE time (UTC+4) | `BE` | 🟠 | 0.5d |
| 10.8 | Display real notification count in `SiteHeader` bell from `GET /dashboard/notifications` with auto-refresh every 60 seconds | `FE` | 🟠 | 0.5d |

---

### Week 11 — Email Service & Notifications

| # | Task | Type | Priority | Est. |
|---|------|------|----------|------|
| 11.1 | Install SendGrid or Resend — create `src/plugins/email.ts` Fastify plugin with `sendEmail(to, template, data)` function | `BE` | 🟠 | 1d |
| 11.2 | Add email env vars: `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_NAME` to `env.ts` | `BE` | 🟠 | 0.5d |
| 11.3 | Create email template: **Visa Expiry Alert** — employee name, visa type, expiry date, days remaining, action link | `BE` | 🟠 | 0.5d |
| 11.4 | Create email template: **Document Expiry Alert** — document type, employee, expiry date, upload link | `BE` | 🟠 | 0.5d |
| 11.5 | Create email template: **Leave Request Notification** — employee name, leave type, dates, approve/reject action buttons | `BE` | 🟠 | 0.5d |
| 11.6 | Create email template: **Payroll Run Ready** — period, total employees, estimated net, confirm/run button | `BE` | 🟠 | 0.5d |
| 11.7 | Create email template: **New User Invitation** — workspace name, role, set-password link (48-hour expiry) | `BE` | 🟠 | 0.5d |
| 11.8 | Wire expiry workers to send emails via `email.ts` plugin for each alert threshold | `BE` | 🟠 | 0.5d |
| 11.9 | Add `POST /api/v1/users/invite` endpoint — create inactive user, generate set-password token, send invite email | `BE` | 🟠 | 1d |
| 11.10 | Wire "Invite User" button in `SettingsPage` Users tab to the new invite endpoint | `FE` | 🟠 | 0.5d |

---

### Week 12 — Onboarding & Checklist Engine

| # | Task | Type | Priority | Est. |
|---|------|------|----------|------|
| 12.1 | Fix `OnboardingPage.tsx` — list all active onboarding checklists (not just `checklists[0]`), show employee name, progress, due date | `FE` | 🔴 | 1d |
| 12.2 | Add step completion form — clicking a step opens a side panel: mark complete, add notes, upload supporting document | `FE` | 🟠 | 1d |
| 12.3 | Wire step completion to `PATCH /api/v1/onboarding/:id/steps/:stepId` — recalculate and update `progress` percentage | `FS` | 🟠 | 0.5d |
| 12.4 | Add overdue detection — highlight steps where `due_date < today` and `status !== 'completed'` in red | `FE` | 🟠 | 0.5d |
| 12.5 | Build onboarding template engine in backend — `templates` table with steps per industry/visa type; auto-create checklist when employee is created | `BE` | 🟠 | 2d |
| 12.6 | Seed default UAE onboarding template — 9 standard steps (offer acceptance → medical → EID → labour card → bank → insurance → IT → orientation → probation) | `BE` | 🟠 | 0.5d |
| 12.7 | Add SLA alert worker — daily BullMQ job notifying step owner when `due_date` is overdue | `BE` | 🟠 | 0.5d |
| 12.8 | Add onboarding summary to dashboard — "X employees in onboarding, Y overdue steps" with link | `FE` | 🟡 | 0.5d |

---

### Week 13 — Compliance & Live Reports

| # | Task | Type | Priority | Est. |
|---|------|------|----------|------|
| 13.1 | Replace hardcoded compliance scores in `CompliancePage.tsx` — build `GET /api/v1/compliance/scores` returning live values | `FS` | 🔴 | 2d |
| 13.2 | WPS compliance score — query last payroll run; calculate % of employees paid on time | `BE` | 🔴 | 0.5d |
| 13.3 | Emiratisation compliance score — live `emirati / total_active` ratio from `employees` table | `BE` | 🔴 | 0.5d |
| 13.4 | Visa validity score — % of active employees with non-expired visa | `BE` | 🔴 | 0.5d |
| 13.5 | Add `GET /api/v1/reports/headcount` endpoint — filterable by status, department, nationality, visa expiry; returns paginated employee list | `BE` | 🟠 | 1d |
| 13.6 | Add `GET /api/v1/reports/payroll-summary` endpoint — monthly gross/net/deductions breakdown by department, with YTD totals | `BE` | 🟠 | 1d |
| 13.7 | Add `GET /api/v1/reports/visa-expiry` endpoint — employees with visa expiry in next N days, grouped by urgency | `BE` | 🟠 | 0.5d |
| 13.8 | Build Reports page in frontend — replace "Coming Soon" stub with 3 report tabs: Headcount, Payroll Summary, Visa Expiry | `FE` | 🔴 | 1.5d |
| 13.9 | Add CSV export to all 3 reports — `papaparse` on frontend for client-side CSV generation | `FE` | 🟠 | 0.5d |

---

### Week 14 — Visa Workflow Completion

| # | Task | Type | Priority | Est. |
|---|------|------|----------|------|
| 14.1 | Build Visa detail page `/visa/:id` — full step timeline, documents per step, reference numbers, notes history | `FE` | 🟠 | 1.5d |
| 14.2 | Add "Advance Step" button on visa timeline — opens dialog with notes field, document upload, completion confirmation | `FE` | 🟠 | 1d |
| 14.3 | Build Visa Cancellation flow — endpoint `POST /api/v1/visa/:id/cancel` with reason, link to termination workflow | `BE` | 🟠 | 1d |
| 14.4 | Add visa urgency auto-calculation — BullMQ worker recalculates `urgency_level` daily: `normal` → `urgent` (60d) → `critical` (30d) from expiry | `BE` | 🟠 | 0.5d |
| 14.5 | Add visa expiry calendar view (`/visa/calendar`) — monthly grid showing all expirations, color-coded by urgency | `FE` | 🟡 | 1.5d |
| 14.6 | Add document upload per visa step — each step can have required document types; upload triggers document creation linked to visa | `FS` | 🟠 | 1d |

---

## Phase 3 — Advanced HR Features (Weeks 15–22)

> **Goal:** Reach full feature parity with a production HRIS. Candidate profiles, exit management, performance, and advanced reporting.

---

### Week 15 — Candidate Profile & ATS Completion

| # | Task | Type | Priority | Est. |
|---|------|------|----------|------|
| 15.1 | Build Candidate profile page `/recruitment/candidates/:id` — tabs: Profile, Resume, Interviews, Notes, Timeline | `FE` | 🟠 | 2d |
| 15.2 | Add resume file upload to candidate profile — store PDF in S3, render with PDF.js preview | `FS` | 🟠 | 1d |
| 15.3 | Implement drag-and-drop kanban pipeline — replace "Move to Next Stage" buttons with `@dnd-kit/core` drag-and-drop | `FE` | 🟡 | 2d |
| 15.4 | Add candidate score and notes panel — score out of 100, interviewer comments, tag system | `FE` | 🟡 | 1d |
| 15.5 | Build "Add Candidate" form — name, email, phone, nationality, CV upload, job selection, expected salary | `FE` | 🟠 | 1d |
| 15.6 | Wire Add Candidate to `POST /api/v1/jobs/:id/applications` endpoint | `FS` | 🟠 | 0.5d |

---

### Week 16 — Interview Scheduling & Offers

| # | Task | Type | Priority | Est. |
|---|------|------|----------|------|
| 16.1 | Add `interviews` table to schema — candidate_id, job_id, scheduled_at, interviewer_id, format (in-person/video), status, feedback_score, notes | `BE` | 🟡 | 0.5d |
| 16.2 | Build `POST /api/v1/interviews` endpoint — create interview, send email to interviewer with calendar `.ics` attachment | `BE` | 🟡 | 1d |
| 16.3 | Build interview scheduling UI in Candidate profile — date/time picker, interviewer selector, video link field | `FE` | 🟡 | 1d |
| 16.4 | Build offer letter generator — select template, auto-fill employee/job data, salary, start date, PDF preview | `FE` | 🟡 | 1.5d |
| 16.5 | Add `GET /api/v1/offers/:id/pdf` endpoint — generate offer letter PDF using PDFKit, upload to S3, return download URL | `BE` | 🟡 | 1d |
| 16.6 | Build Emiratisation live dashboard — current ratio vs. MOHRE target, penalty calculation, hire-to-target gap, Nafis wage subsidy tracker | `FS` | 🟠 | 1.5d |

---

### Week 17 — Password Reset & 2FA

| # | Task | Type | Priority | Est. |
|---|------|------|----------|------|
| 17.1 | Add `password_reset_tokens` table — `user_id`, `token_hash`, `expires_at` | `BE` | 🟠 | 0.5d |
| 17.2 | Add `POST /api/v1/auth/forgot-password` — validate email, generate secure token, send reset email with 1-hour expiry link | `BE` | 🟠 | 1d |
| 17.3 | Add `POST /api/v1/auth/reset-password` — validate token, hash new password, invalidate token, revoke all refresh tokens for user | `BE` | 🟠 | 1d |
| 17.4 | Build forgot password and reset password pages on frontend — `/auth/forgot-password` and `/auth/reset-password?token=…` | `FE` | 🟠 | 1d |
| 17.5 | Wire "Forgot password?" link in `LoginPage.tsx` to the new forgot password route | `FE` | 🟠 | 0.5d |
| 17.6 | Add `totp_secret` and `totp_enabled` columns to `users` table | `BE` | 🟡 | 0.5d |
| 17.7 | Add `POST /api/v1/auth/2fa/setup` — generate TOTP secret, return QR code as base64 data URL | `BE` | 🟡 | 1d |
| 17.8 | Add `POST /api/v1/auth/2fa/verify` — validate 6-digit TOTP, enable 2FA on account | `BE` | 🟡 | 0.5d |
| 17.9 | Build 2FA setup flow in `SettingsPage` Security tab — QR code display, manual entry key, verification input | `FE` | 🟡 | 1d |

---

### Week 18 — Employee Exit & Final Settlement

| # | Task | Type | Priority | Est. |
|---|------|------|----------|------|
| 18.1 | Add `exit_requests` table — `employee_id`, `exit_type`, `reason`, `last_working_day`, `notice_period_days`, `status`, initiated by | `BE` | 🟠 | 0.5d |
| 18.2 | Add `final_settlements` table — `exit_request_id`, `gratuity`, `leave_encashment`, `notice_pay`, `deductions`, `total_payable` | `BE` | 🟠 | 0.5d |
| 18.3 | Build `calculateFinalSettlement(employeeId, exitDate, exitType)` service — gratuity + unused annual leave encashment + notice period pay - loan deductions | `BE` | 🟠 | 2d |
| 18.4 | Add `POST /api/v1/exit/:employeeId/initiate` and `GET /api/v1/exit/:employeeId/settlement` endpoints | `BE` | 🟠 | 0.5d |
| 18.5 | Build Termination Wizard UI — Step 1: reason + type. Step 2: last working day + notice tracking. Step 3: settlement preview. Step 4: confirm | `FE` | 🟠 | 2d |
| 18.6 | Wire "Terminate" menu action in `EmployeesPage` to new termination wizard instead of direct confirm dialog | `FE` | 🟠 | 0.5d |
| 18.7 | Generate final settlement PDF — itemised breakdown; clearance certificate; experience letter template | `BE` | 🟡 | 1d |
| 18.8 | Auto-trigger visa cancellation workflow on employee termination | `BE` | 🟠 | 0.5d |
| 18.9 | Write unit tests for `calculateFinalSettlement()` — test all exit types, service length edge cases, deduction cap | `BE` | 🟠 | 1d |

---

### Week 19 — Employee Performance & Probation

| # | Task | Type | Priority | Est. |
|---|------|------|----------|------|
| 19.1 | Add `performance_reviews` table — `employee_id`, `review_cycle_id`, `reviewer_id`, `overall_rating`, `comments`, `status`, `review_date` | `BE` | 🟡 | 0.5d |
| 19.2 | Add `performance_goals` table — `employee_id`, `title`, `description`, `target_date`, `weight`, `status`, `score` | `BE` | 🟡 | 0.5d |
| 19.3 | Build Performance tab on Employee profile — current goals, review history, rating chart, manager notes | `FE` | 🟡 | 2d |
| 19.4 | Add `POST /api/v1/performance/reviews` and `PATCH /api/v1/performance/reviews/:id` endpoints | `BE` | 🟡 | 1d |
| 19.5 | Build probation management — auto-calculate `probation_end_date` on join (join_date + 6 months); display countdown in employee profile | `FE` | 🟠 | 0.5d |
| 19.6 | Add probation review alert worker — notify HR Manager 14 days and 7 days before `probation_end_date` | `BE` | 🟠 | 0.5d |
| 19.7 | Add "Confirm Probation" and "Extend Probation" actions in employee Employment tab | `FE` | 🟠 | 1d |
| 19.8 | Implement disciplinary action tracker — verbal warning, written warning, final warning; linked to employee profile | `BE` | 🟡 | 1.5d |

---

### Week 20 — Organisation Chart & Bulk Operations

| # | Task | Type | Priority | Est. |
|---|------|------|----------|------|
| 20.1 | Install `react-org-chart` or build with D3.js — render org tree from `employees.reportingTo` relationships | `FE` | 🟡 | 2d |
| 20.2 | Add expand/collapse nodes, department colour-coding, employee card with avatar and designation | `FE` | 🟡 | 1d |
| 20.3 | Add "Export as PNG" button to org chart — use `html-to-image` library | `FE` | 🟡 | 0.5d |
| 20.4 | Build CSV bulk import for employees — downloadable template, upload, validate rows, preview errors, confirm import | `FE` | 🟡 | 1.5d |
| 20.5 | Backend bulk import endpoint — `POST /api/v1/employees/import` accepting multipart CSV; validate each row; return per-row status | `BE` | 🟡 | 1.5d |
| 20.6 | Build bulk document upload — select multiple files, auto-match to employees by passport number or name pattern | `FE` | 🟡 | 1.5d |
| 20.7 | Add employee search with advanced filters — department, nationality, visa expiry range, status, join date range | `FE` | 🟠 | 1d |

---

### Week 21 — Attendance & Overtime

| # | Task | Type | Priority | Est. |
|---|------|------|----------|------|
| 21.1 | Add `attendance_records` table — `employee_id`, `date`, `check_in`, `check_out`, `hours_worked`, `overtime_hours`, `source` | `BE` | 🟡 | 0.5d |
| 21.2 | Add `POST /api/v1/attendance` and `GET /api/v1/attendance?employeeId=&month=&year=` endpoints | `BE` | 🟡 | 1d |
| 21.3 | Build Attendance page `/attendance` — monthly calendar view per employee, daily check-in/out times, late arrivals | `FE` | 🟡 | 2d |
| 21.4 | Implement overtime calculation in payroll — standard hours 8/day (6/day Ramadan); overtime at 125% regular, 150% night (22:00–04:00) | `BE` | 🟠 | 1.5d |
| 21.5 | Add manual timesheet entry — HR can enter hours for employees without biometric integration | `FE` | 🟡 | 1d |
| 21.6 | Feed overtime hours from `attendance_records` into payslip calculation automatically | `BE` | 🟠 | 1d |

---

### Week 22 — Document Preview & Template Engine

| # | Task | Type | Priority | Est. |
|---|------|------|----------|------|
| 22.1 | Add PDF.js viewer — open document preview in a modal with zoom, page navigation, and download button | `FE` | 🟡 | 1.5d |
| 22.2 | Add image preview for JPG/PNG documents — lightbox with metadata panel (upload date, expiry, verified status) | `FE` | 🟡 | 0.5d |
| 22.3 | Build document version history panel — list previous uploads of same doc type per employee with download links | `FE` | 🟡 | 1d |
| 22.4 | Add `document_versions` table — `document_id`, `version_number`, `s3_key`, `uploaded_at`, `uploaded_by` | `BE` | 🟡 | 0.5d |
| 22.5 | Build document template engine — CRUD for templates with `{{employee.name}}`, `{{company.name}}` variable placeholders | `BE` | 🟡 | 2d |
| 22.6 | Add template types: Offer Letter, Salary Certificate, NOC Letter, Experience Letter, Warning Letter | `BE` | 🟡 | 0.5d |
| 22.7 | Build template management UI in Settings — create/edit/preview templates, assign variables, generate sample | `FE` | 🟡 | 1.5d |
| 22.8 | Add `POST /api/v1/documents/generate` endpoint — take template ID + employee ID, fill variables, render PDF, upload to S3 | `BE` | 🟡 | 1d |

---

## Phase 4 — UAE Compliance & Integrations (Weeks 23–26)

> **Goal:** Automate the uniquely UAE-specific compliance requirements — MOHRE integration, Emiratisation, Arabic RTL, OCR document extraction.

---

### Week 23 — OCR & Smart Document Processing

| # | Task | Type | Priority | Est. |
|---|------|------|----------|------|
| 23.1 | Integrate AWS Textract or Google Document AI — create `src/lib/ocr.ts` client | `BE` | 🟡 | 1d |
| 23.2 | Build passport MRZ extraction — parse Machine Readable Zone to extract passport number, name, nationality, DOB, expiry | `BE` | 🟡 | 2d |
| 23.3 | Build Emirates ID OCR — extract EID number, name, nationality, expiry date from card image | `BE` | 🟡 | 1.5d |
| 23.4 | On document upload, if category is `identity` or `visa`, auto-trigger OCR extraction job via BullMQ | `BE` | 🟡 | 0.5d |
| 23.5 | After OCR, auto-fill employee fields if they are empty — show diff UI for user to confirm before saving | `FS` | 🟡 | 1d |
| 23.6 | Add document verification workflow — PRO Officer can mark document as `verified` after reviewing OCR result | `FE` | 🟡 | 0.5d |
| 23.7 | Build "Document Completeness" report — per employee, which required documents are missing, expired, or unverified | `FE` | 🟠 | 1d |

---

### Week 24 — MOHRE API Integration

| # | Task | Type | Priority | Est. |
|---|------|------|----------|------|
| 24.1 | Create `src/modules/integrations/mohre/mohre.client.ts` — HTTP client for MOHRE Connect / Tasheel API with auth token management | `BE` | 🟡 | 1d |
| 24.2 | Implement labour card application submission — `submitLabourCardApplication(employeeId)` calling MOHRE API | `BE` | 🟡 | 2d |
| 24.3 | Implement labour card status polling — `getLabourCardStatus(mohreRef)` with automatic DB update | `BE` | 🟡 | 1d |
| 24.4 | Implement labour card renewal — check expiry, trigger renewal workflow 90 days before | `BE` | 🟡 | 1d |
| 24.5 | Add MOHRE reference number to visa detail page — show live status from polling | `FE` | 🟡 | 0.5d |
| 24.6 | Build MOHRE integration health status page in Settings — last sync time, queue depth, error log | `FE` | 🟡 | 1d |
| 24.7 | Add fallback RPA layer note — document that MOHRE API is unstable; add manual-entry fallback for reference numbers | `BE` | 🟡 | 0.5d |

---

### Week 25 — Arabic RTL Support

| # | Task | Type | Priority | Est. |
|---|------|------|----------|------|
| 25.1 | Install Tailwind RTL plugin (`tailwindcss-rtl`) — configure for `dir="rtl"` switching | `FE` | 🟡 | 1d |
| 25.2 | Add language toggle to `SiteHeader` — EN / AR switch that sets `document.documentElement.dir` and stores preference in `uiStore` | `FE` | 🟡 | 1d |
| 25.3 | Add Arabic translations for all navigation labels, page titles, and KPI card labels | `FE` | 🟡 | 2d |
| 25.4 | Add Arabic translations for all form field labels, placeholders, validation messages | `FE` | 🟡 | 2d |
| 25.5 | Mirror sidebar layout for RTL — nav items align right, icons on right side, text flows right-to-left | `FE` | 🟡 | 1d |
| 25.6 | Add Dubai font (or Tajawal) for Arabic text — apply when `dir="rtl"` is active | `FE` | 🟡 | 0.5d |
| 25.7 | Test all DataTable, Dialog, and Chart components in RTL mode — fix any overflow or alignment issues | `FE` | 🟡 | 1.5d |

---

### Week 26 — Industry-Specific Configurations

| # | Task | Type | Priority | Est. |
|---|------|------|----------|------|
| 26.1 | Add `industry_configs` table — per-tenant configs storing enabled modules, required document types, job category templates | `BE` | 🟡 | 1d |
| 26.2 | Real Estate industry config — RERA card tracking, broker permit, commission salary structure, Ejari document type | `BE` | 🟡 | 1d |
| 26.3 | Healthcare industry config — DHA/HAAD licence tracking, medical malpractice insurance, CME credits, practitioner renewal alerts | `BE` | 🟡 | 1d |
| 26.4 | Construction industry config — safety certificate (NEBOSH/IOSH), site pass document type, labour camp allocation field | `BE` | 🟡 | 1d |
| 26.5 | Education industry config — teaching licence, police clearance, attested degree, KHDA/ADEK approval document types | `BE` | 🟡 | 1d |
| 26.6 | Industry-specific onboarding templates — load different step templates based on tenant's `industry_type` | `BE` | 🟡 | 1d |
| 26.7 | Industry config settings page — enable/disable modules per industry, configure required document types, set custom leave policies | `FE` | 🟡 | 1.5d |

---

## Phase 5 — Production Readiness (Weeks 27–30)

> **Goal:** Security hardening, testing, performance, and production deployment on UAE infrastructure.

---

### Week 27 — Security Hardening

| # | Task | Type | Priority | Est. |
|---|------|------|----------|------|
| 27.1 | Implement PostgreSQL Row-Level Security — enable RLS on all tenant tables; set `app.current_tenant` via Drizzle transaction using `db.execute(sql\`SET LOCAL app.current_tenant = \${tenantId}\`)` at the start of each request transaction | `BE` | 🟠 | 3d |
| 27.2 | Field-level encryption for PII — encrypt `passport_no`, `emirates_id`, `iban` at application level using AES-256 before DB write | `BE` | 🟠 | 2d |
| 27.3 | Mask PII in structured logs — configure Pino to redact `password`, `passport_no`, `iban`, `emirates_id` fields | `BE` | 🟠 | 0.5d |
| 27.4 | Add IP allowlist option — allow tenants to restrict login to specific IP ranges; enforce in authenticate plugin | `BE` | 🟡 | 1d |
| 27.5 | Implement audit log auto-insert plugin — every mutation (POST/PATCH/DELETE) emits to `audit_logs` with `userId`, `action`, `entityType`, `entityId`, `ip` | `BE` | 🟠 | 1d |
| 27.6 | Build audit log viewer in Settings Security tab — filterable table of all audit events per tenant | `FE` | 🟡 | 1d |
| 27.7 | Conduct third-party penetration test — fix all critical and high severity findings | `OPS` | 🟠 | 3d |

---

### Week 28 — Testing & Quality

| # | Task | Type | Priority | Est. |
|---|------|------|----------|------|
| 28.1 | Write integration tests for auth routes — login, refresh, logout, /me; test token expiry, wrong credentials, revoked tokens | `BE` | 🟠 | 1d |
| 28.2 | Write integration tests for employees routes — create, list, get, update, archive; test tenant isolation | `BE` | 🟠 | 1d |
| 28.3 | Write integration tests for payroll routes — run payroll, get payslips, WPS file generation | `BE` | 🟠 | 1d |
| 28.4 | Write integration tests for visa routes — create, advance step, cancel; test RBAC enforcement | `BE` | 🟠 | 1d |
| 28.5 | Write integration tests for documents routes — upload URL, metadata create, verify, expiry query | `BE` | 🟠 | 1d |
| 28.6 | Set up Playwright for E2E testing — configure `playwright.config.ts`; add test data seeding script | `FE` | 🟠 | 1d |
| 28.7 | E2E test: login → navigate to dashboard → verify KPI cards load with data | `FE` | 🟠 | 0.5d |
| 28.8 | E2E test: add employee full flow → verify appears in list → open profile → verify all fields populated | `FE` | 🟠 | 1d |
| 28.9 | E2E test: apply leave → manager approves → verify status changes → verify leave balance reduces | `FE` | 🟠 | 1d |
| 28.10 | E2E test: run payroll → verify payslips created → download WPS file → verify SIF format | `FE` | 🟠 | 1d |
| 28.11 | Reach 80% unit test coverage on all `*.service.ts` files — fill gaps identified by `vitest --coverage` | `BE` | 🟠 | 1d |

---

### Week 29 — Performance & Infrastructure

| # | Task | Type | Priority | Est. |
|---|------|------|----------|------|
| 29.1 | Add database query time logging — log all queries > 100ms using Drizzle middleware | `BE` | 🟠 | 0.5d |
| 29.2 | Add `EXPLAIN ANALYZE` review for all list endpoints — fix any sequential scans with missing indexes | `BE` | 🟠 | 1d |
| 29.3 | Migrate employee and visa list endpoints to cursor-based pagination — replace offset with `created_at + id` cursor | `BE` | 🟠 | 1.5d |
| 29.4 | Add Redis caching for dashboard KPIs — cache for 5 minutes; invalidate on employee/payroll mutations | `BE` | 🟡 | 1d |
| 29.5 | Performance test with k6 — 500 concurrent users on `/employees`, `/dashboard/kpis`, `/visa`; P95 < 200ms target | `OPS` | 🟠 | 1.5d |
| 29.6 | Write `docker-compose.prod.yml` — no exposed ports, secrets from env, health checks, restart policy, log limits | `OPS` | 🟠 | 0.5d |
| 29.7 | Write Kubernetes manifests — Deployment, Service, HPA (scale on CPU > 70%), ConfigMap, Secret, Ingress with TLS | `OPS` | 🟡 | 2d |
| 29.8 | Set up GitHub Actions CI/CD pipeline — on push to main: `pnpm lint → pnpm test → docker build → push → deploy to staging` | `OPS` | 🟠 | 1d |
| 29.9 | Configure Cloudflare CDN for frontend static assets — `Cache-Control` headers, asset fingerprinting for long TTL | `OPS` | 🟡 | 0.5d |

---

### Week 30 — Production Launch

| # | Task | Type | Priority | Est. |
|---|------|------|----------|------|
| 30.1 | Provision production environment on AWS `me-south-1` (Bahrain) or Azure UAE North — closest region to Dubai | `OPS` | 🟠 | 1d |
| 30.2 | Configure RDS PostgreSQL 16 with Multi-AZ failover, automated backups (daily, 7-day retention) | `OPS` | 🟠 | 0.5d |
| 30.3 | Configure ElastiCache Redis cluster for BullMQ job queues | `OPS` | 🟠 | 0.5d |
| 30.4 | Configure S3 buckets — `hrhub-documents-prod` with versioning, AES-256 encryption, lifecycle policy (archive > 2 years) | `OPS` | 🟠 | 0.5d |
| 30.5 | Set up Datadog or Prometheus/Grafana — API latency, error rate, queue depth, DB connections, disk/memory dashboards | `OPS` | 🟡 | 1d |
| 30.6 | Configure alerting — PagerDuty or Opsgenie on: API error rate > 1%, P95 latency > 500ms, BullMQ job failures > 10/hour | `OPS` | 🟡 | 0.5d |
| 30.7 | Write disaster recovery runbook — backup restore procedure, RTO < 4h, RPO < 1h, contact list, escalation path | `OPS` | 🟠 | 1d |
| 30.8 | UAT with 3 pilot UAE companies — collect feedback, fix critical usability issues found | `FS` | 🟠 | 2d |
| 30.9 | Data migration scripts — safely migrate pilot company data from existing spreadsheets/systems to HRHub | `BE` | 🟡 | 1.5d |
| 30.10 | Conduct final security review — check all API keys rotated, no secrets in code, `.env` files not committed, CORS locked to production domain | `OPS` | 🟠 | 0.5d |
| 30.11 | Write user documentation — onboarding guide for HR Manager, PRO Officer, and Payroll Officer roles | `FS` | 🟡 | 1d |
| 30.12 | Go live 🚀 — DNS cutover, smoke test all critical flows, monitor dashboards for 48 hours | `OPS` | 🔴 | 1d |

---

## Summary

| Phase | Weeks | Focus | Tasks |
|-------|-------|-------|-------|
| Phase 1 — Bug Fixes & Foundation | 1–6 | Fix broken functionality, type safety, file storage, core forms | 71 |
| Phase 2 — Core Features | 7–14 | Payroll engine, WPS, alerts, onboarding, reports | 72 |
| Phase 3 — Advanced HR | 15–22 | ATS, exit management, performance, org chart, attendance | 65 |
| Phase 4 — UAE Compliance | 23–26 | OCR, MOHRE API, Arabic RTL, industry configs | 40 |
| Phase 5 — Production | 27–30 | Security, testing, performance, launch | 40 |
| **Total** | **30 weeks** | | **288 tasks** |

---

### Task Priority Distribution

| Priority | Count | Description |
|----------|-------|-------------|
| 🔴 Critical | 42 | Breaks existing functionality — fix first |
| 🟠 High | 118 | Core features required for a working HRIS |
| 🟡 Medium | 108 | Important completeness and compliance features |
| 🟢 Enhancement | 20 | Quality improvements and nice-to-haves |

---

*HRHub.ae · UAE HR & PRO Platform · Confidential · April 2026*
