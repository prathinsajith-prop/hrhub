# HRHub — Functional, Business Flow & Integration Documentation (Tester's Source of Truth)

> **Audience:** QA engineers, testers, business analysts, implementation & support teams.
> **Purpose:** Explain *what the system does*, *how features behave*, *how they interact*, and *what should happen* when users act — without requiring developer assistance.
> **Nature:** Business & behavioral documentation (not developer/technical docs). Where a file is cited, it is only to let a tester locate the behavior; testers validate behavior, not code.

---

## 0. How to Use This Document

1. **Start with §1–§2 (System Overview + Global Concepts).** Every module reuses the same cross-cutting machinery — roles, audit logging, notifications, emails, background jobs, multi-tenancy. Understanding these once means you understand them everywhere.
2. **Go to the relevant module section (§3).** Each module is documented with a uniform template: Purpose → Actions/Roles → Workflow/Statuses → Notifications → Emails → Audit → Activity Timeline → Validations → Dashboard/Report impact → Dependencies → **QA Validation Checklist**.
3. **Use §4 (End-to-End Business Flows)** to test complete user journeys that cross modules.
4. **Use §5 (Dependency Map) and §6 (Event-Trigger Matrix)** to predict the downstream blast radius of any action.
5. **Use §7 (Master QA Checklists)** as the per-feature 12-point sign-off.
6. **Use §8 (Risks, Gaps & Known Issues)** as a defects/known-limitations watchlist while testing.

**Legend used throughout:**
- ✅ implemented & expected · ⚠️ partial / inconsistent · ❌ missing / not implemented · 🔒 security concern
- "In-app notification" = bell-icon item polled every 60s. "Email" = outbound mail. "Audit" = `activity_logs` row. "Activity timeline" = the per-employee "Updates" feed (a mirrored audit row).

---

## 1. System Overview

**HRHub** is a multi-tenant SaaS HR platform for UAE businesses (bilingual EN/AR, RTL-aware). Each customer company is a **tenant**; all data is isolated per tenant. Users log in, are assigned a **role**, and operate only within their tenant.

**User-facing surfaces:**
- **Main web app** (authenticated) — the full HR system for staff and admins.
- **Employee self-service** ("My …" pages) — leave, payslips, profile, attendance, training, loans, complaints.
- **Public careers portal** (`/careers/:companyCode/jobs`) — unauthenticated job listing + apply.
- **Public onboarding upload** (`/onboarding/upload/:token`) — unauthenticated document upload via magic link.
- **Public exit interview** (token link) — unauthenticated survey.
- **Connected Apps API** — external/biometric systems authenticate with an app key + secret.

**Roles (hierarchy, highest to lowest authority):**
```
super_admin  >  hr_manager  >  pro_officer  >  dept_head  >  employee
```
- **super_admin** — everything, incl. tenant management, members, billing.
- **hr_manager** — all HR features, members, settings, org structure.
- **pro_officer** — visa, documents, compliance focus; read-only on employees.
- **dept_head** — scoped **server-side** to their own reporting subtree (their department & reports); approves leave for their team; can view but not always mutate.
- **employee** — own data only (own leave, payslips, attendance, profile, training, loans, complaints) + org chart.

---

## 2. Global Concepts (apply to every module)

### 2.1 Multi-Tenancy & Data Isolation
- Every table has a `tenantId`. Every service filters by the `tenantId` from the verified JWT. **Cross-tenant data access is impossible at the data layer** when implemented correctly — any route returning another tenant's data is a defect.
- JWT identity (no per-request DB hit): `{ id, tenantId, role, name, email, employeeId, department }`. Access token TTL **15 min**; refresh token **7 days** (rotated on use — old token revoked).
- **`isActive` check is cached in Redis for 5 minutes.** Deactivating a user therefore takes **up to 5 minutes** to fully block them (existing 15-min access tokens also expire naturally). ⚠️ Test this lag explicitly.
- **QA isolation test (run for every module):** Log in as Tenant A, attempt to read/modify a Tenant B record by ID → must return 403/404, never data.

### 2.2 Role-Based Access Control (RBAC)
- Frontend matrix: **38 permissions, 44 guarded routes**, in `frontend/src/lib/permissions.ts` (`hasPermission`, `canAccessRoute`). Do not expect permission logic anywhere else on the frontend.
- Backend guards: `fastify.authenticate` (verify JWT + isActive) and `fastify.requireRole(...)`. UI hiding is **not** security — every protected action is also enforced server-side.
- **dept_head scoping is server-side** for employees/leave/performance/attendance (recursive `managerId` subtree, capped at 50 levels). Frontend filter params are ignored for dept_head; the server forces their own subtree. ⚠️ Scoping is implemented per-route, not globally — see §8 for gaps.
- **QA permission test (run for every feature):** For each role, confirm allowed actions succeed and disallowed actions return 403 (API) and are hidden/blocked (UI).

### 2.3 Status & Lifecycle Conventions
- **Soft delete:** Most entities set `deletedAt` (or `isArchived`/`isActive=false`) instead of hard-deleting; soft-deleted rows are filtered from lists but remain for audit. A few (employee dependents, notes, warnings) are **hard-deleted** — see §8.
- Statuses are documented per module. Many status fields are **not state-machine-guarded** server-side (e.g., performance review status) — the client controls transitions. Testers should attempt illegal transitions and note whether the server blocks them.

### 2.4 Audit Log & Activity Timeline (the `recordActivity` system)
- **Every mutation should call `recordActivity(...)`** (fire-and-forget; an audit failure never blocks or rolls back the user action).
- Standard fields: `tenantId, userId, actorName, actorRole, entityType, entityId, entityName, action, changes{from,to}, metadata, ipAddress, userAgent, requestId`.
- **Actions:** `create | update | delete | approve | reject | submit | cancel | import | export | view | login | logout | failed_login | invite | resend …`
- **Dual-entry pattern:** Many employee-related mutations write **two** rows — one on the entity (e.g., `visa`, `leave`, `document`) and one mirrored on `employee` (with `metadata.kind`/`subKind`) so the event appears on the employee's **Updates / Activity timeline**.
- **Sensitive-field masking is automatic** at the single write point: `iban`, `accountNumber`, `passportNo`, `emiratesId`, `swiftCode` are masked to `••••1234` in `changes`. ⚠️ Masking covers `changes`, **not** arbitrary `metadata` — see §8.
- **FK→name resolution:** ID changes (department, manager, grade, sponsor) are resolved to human-readable names in the diff (async, best-effort).
- **Login history** is a separate table (`login_history`) powering the "Login History" page: login/logout/failed_login (+ schema support for password_change/reset, token_refresh, 2fa_success/failed — not all wired).
- **Retention (per WORKFLOWS.md; not yet implemented in code):** hot 90 days → warm 90d–2y → cold (S3 Parquet) >2y; login/logout/export never deleted. ⚠️ Currently all rows persist indefinitely.
- **QA audit test (every feature):** after each action, confirm the expected `activity_logs` row(s) exist with correct `action`, `entityType`, masked diffs, and that the employee timeline mirror appears where applicable.

### 2.5 Notifications System (in-app)
- `createNotification({tenantId, userId?, type, title, message, actionUrl?})` → inserts a row **and** pushes a `notification:new` WebSocket event. `userId=null` = tenant-wide broadcast.
- `notifyEmployee(tenantId, employeeId, …)` resolves the employee's user (by `employeeId` FK, then email) and no-ops silently if the employee has no user account. `notifyEmployeesBulk(...)` writes in chunks but does **not** push WebSocket (relies on 60s poll).
- **Types:** `info | success | warning | error`. **Delivery:** frontend bell polls `GET /notifications` every **60 seconds**; mark-read (single/all) supported; scope-checked (own + tenant-wide only).
- **QA notification test (every feature):** confirm the right users get the right type/title/message/actionUrl, and only intended recipients.

### 2.6 Email System
- **Providers (via `EMAIL_PROVIDER`):** `smtp` (default; Mailpit at `localhost:8025` in dev), `resend`, `gmail`. `EMAIL_DEV_FALLBACK=true` logs to console instead of sending. Boot-time `verifyEmailConfig()` fails fast on bad transport.
- **Tenant notification kill-switch:** `tenants.notificationsEnabled=false` causes `sendEmail()` calls that pass `tenantId` to be suppressed (`{ok:false, error:'tenant-disabled'}`). **Transactional emails omit `tenantId` and always send** (password reset, invite). ⚠️ Confirm per-route which emails bypass the kill-switch.
- **Email template catalog (trigger → recipient → subject):**

| Template | Trigger | Recipient | Respects kill-switch? |
|---|---|---|---|
| `passwordResetEmail` | Forgot-password request | User | ❌ always sends |
| `inviteUserEmail` | Member/employee invite | Invitee | ❌ always sends |
| `leaveNotificationEmail` | Leave request submitted | Manager/HR/dept_head | ✅ |
| `onboardingUploadLinkEmail` | Onboarding upload token issued | New hire | ✅ |
| `visaExpiryAlertEmail` | Visa expiry worker (90/60/30/14/7d) | HR + PRO officers | ✅ |
| `documentExpiryAlertEmail` | Document expiry worker (90/60/30d) | HR + PRO officers | ✅ |
| `documentVerifiedEmail` | HR verifies a document | Employee | ✅ |
| `documentRejectedEmail` | HR rejects a document | Employee | ✅ |
| `payslipEmail` | Payroll run completes | Employee | ✅ |
| `subscriptionInvoiceEmail` | Stripe checkout success / quota update | Billing user | ✅ |
| `subscriptionExpiryReminderEmail` | Subscription expiry worker (7d, 1d) | Tenant admin | ✅ |
| `upgradeRequestConfirmationEmail` / `upgradeRequestSalesEmail` | Upgrade request (no Stripe) | Requester / sales | ✅ |
| `enterpriseContactEmail` | Enterprise inquiry | Sales | ✅ |
| `mailTestEmail` | Admin mail test | Test recipient | ❌ |
| (complaint submit alert) | Complaint submitted | HR managers + super_admin | ✅ |
| `applicationReceivedEmail` | Public careers application submitted | Applicant | ✅ |
| `newApplicationAlertEmail` | Public careers application submitted | HR + super_admin | ✅ |
| `contractExpiryAlertEmail` | Contract expiry worker (90/30d) | HR + super_admin | ✅ |
| `passportExpiryAlertEmail` | Passport expiry worker (180/90/30d) | HR + PRO + super_admin | ✅ |
| `complaintStatusEmail` | Complaint resolved | Complainant | ✅ |
| `transferEmail` | Transfer recorded | Employee | ✅ |
| `interviewInvitationEmail` | Interview scheduled | Candidate / interviewer | ✅ |
| `travelStatusEmail` | Travel submitted / approved / rejected | Approver / requester | ✅ |
| `performanceReviewEmail` | Review submitted/completed | Employee | ✅ |
| `trainingAssignedEmail` | Training assigned | Employee | ✅ |
| `membershipChangeEmail` | Member role changed / removed | Affected member | ✅ |

- ❌ **No retry** on send failure (logged & swallowed). ❌ No delivery/bounce tracking.

### 2.7 Background Workers & Scheduled Jobs
All expiry workers run **daily at 02:00 UTC = 06:00 UAE** via BullMQ; they **gracefully skip if Redis is absent** (no crash, but no alerts fire either — ⚠️ silent).

| Worker / Queue | Schedule | Thresholds | Output | Recipients |
|---|---|---|---|---|
| Visa expiry | daily 02:00 UTC | 90/60/30/14/7 days | in-app (info→warning→error) + email | HR + PRO |
| Document expiry | daily 02:00 UTC | 90/60/30 days | in-app + email; sets `expiring_soon`/`expired` | HR + PRO |
| Contract expiry | daily 02:00 UTC | 90/30 days | in-app + email | HR + super_admin |
| Passport expiry | daily 02:00 UTC | 180/90/30 days | in-app + email | HR + PRO + super_admin |
| Subscription expiry | daily 02:00 UTC | 7/1 days | email + in-app | Tenant admin/users |
| Onboarding overdue | daily 02:00 UTC | dueDate < today | marks steps `overdue` (⚠️ no notification) | — |
| Exit relieving date | daily 02:00 UTC | lastWorkingDay == today | fires `on_relieving_date` workflows | workflow engine |
| Complaint SLA | daily 02:00 UTC | slaDueAt passed & still open | in-app alert to HR | HR managers |
| Training cert expiry | daily 02:00 UTC | 90/60/30 days | in-app to HR + employee | HR + employee |
| Payroll run | on-demand | — | runs payroll; `payroll:completed/failed` WS; per-payslip audit | tenant |

- In-app expiry notifications are **deduplicated per day** (title+message). **Emails are NOT deduplicated** — re-running a worker re-sends emails. ⚠️
- **QA job test:** trigger each worker with seed data at each threshold; verify notification type escalation, email send/suppression, and dedup behavior.

### 2.8 Real-Time / WebSocket
- In-process registry (single-process deployment). `broadcastToUser` / `broadcastToTenant`. Dead sockets evicted lazily on next broadcast (⚠️ no heartbeat).
- **Events:** `notification:new`, `payroll:completed`, `payroll:failed`, `recruitment:candidate-added`, `recruitment:stage-changed`, `recruitment:candidate-removed`, `recruitment:candidate-updated`, `recruitment:job-changed`, `recruitment:interview-scheduled`.
- Frontend sends `X-Socket-Id` so the originating tab can skip echoing its own optimistic update.
- **QA real-time test:** with two browser sessions in the same tenant, confirm one user's action updates the other's view live; confirm cross-tenant sessions never receive each other's events.

### 2.9 File Storage & Rate Limiting
- All uploads → S3/MinIO, key format `tenants/{tenantId}/{folder}/{timestamp}_{sanitized-name}`. Presigned **upload** URLs expire in 5 min; **download** URLs in 1 hour (avatars cached 23h). `objectExists()` pre-flight before registering a document.
- 🔒 **Known issue:** `POST /documents` does **not** validate that a client-supplied `s3Key` begins with `tenants/{tenantId}/` → cross-tenant S3 key registration. (Presigned-upload path is safe; manual `s3Key` path is not.)
- **Rate limits:** global **200 req/min/IP**; login **10 / 15 min** (keyed by email or IP); password-reset request/confirm **5 / 15 min**; public careers **browse 60/min**, **apply 5 / 10 min**. ⚠️ No per-authenticated-user rate limit (IP only).

---

## 3. Module-by-Module Functional Documentation

Each module follows: **Purpose · Actions & Roles · Workflow/Statuses · Notifications · Emails · Audit · Validations & Edge Cases · Dashboard/Report Impact · Dependencies · QA Checklist.**

---

### 3.1 Authentication & Security

**Purpose:** Identity, login, MFA, password lifecycle, account protection.

**Actions & Roles:** All roles authenticate. Self-service for own credentials. Member deactivation is HR/super_admin.

**Key behaviors & workflows:**
- **Login** (`POST /auth/login`): validates email (lowercased) + password (bcrypt). Success → access+refresh tokens, `failedLoginCount=0`, `lastLoginAt` set. If `twoFaEnabled` → returns `{requiresMfa:true, mfaToken}` (5-min token) instead of real tokens.
- **Account lockout:** 5 consecutive failures → locked **15 minutes** (`lockedUntil`); auto-unlocks. 🔒 Known TOCTOU: counter increment not atomic → concurrent attempts can bypass threshold (fix applied via atomic `SET count=count+1`; verify).
- **2FA (TOTP):** setup → returns QR + secret; verify with 6-digit code → enables, generates **10 single-use backup codes** (shown once). Challenge flows: `/2fa/challenge` (TOTP) and `/2fa/backup-challenge` (backup code, consumed on use). Disable & backup-regenerate require a valid current TOTP. ⚠️ Code must check `.valid` explicitly (a truthiness bug would defeat 2FA).
- **Password:** forgot → emails reset link (token hashed, 1-hr TTL, **always returns 200** to avoid enumeration); reset → sets password + **revokes all refresh tokens**; change-password (authenticated) → does **not** revoke sessions.
- **Token refresh:** rotates (old deleted). Scheduled `cleanupExpiredTokens()` every 6h purges expired reset/refresh tokens.
- **Profile self-edit** (`PATCH /auth/me`, `/me/avatar`): name/department/avatar; avatar synced to linked employee.

**Notifications:** none for auth events. **Emails:** password reset (always), nothing for login/2FA/lockout. **Audit:** login/logout/failed_login in `login_history`; 2FA enable/disable, password change recorded as `employee` self-events (only if linked employee). ⚠️ token_refresh & password_reset not recorded.

**Validations/Edge cases:** password ≥ 8 chars (⚠️ no complexity rules); MFA token 5-min; backup code 8–32 chars normalized; reset token single-use + expiring.

**Dashboard/Report:** Login History page (per-user device/IP/browser). No KPI impact.

**Dependencies:** Redis (isActive cache, optional), JWT, email, S3 (avatar).

**QA Checklist (Auth):**
- ☐ Functional: login success/failure; refresh rotation; logout revokes refresh; avatar upload+employee sync.
- ☐ Workflow: 2FA enroll→challenge→backup→regenerate→disable; lockout at 5 fails; 15-min auto-unlock.
- ☐ Notification: n/a (confirm none generated).
- ☐ Email: reset link arrives + 1-hr expiry; reset revokes all sessions; forgot returns 200 for unknown email.
- ☐ Permission: only HR/super_admin can deactivate members; user can only edit own profile.
- ☐ Audit: login/failed_login/logout rows; 2FA & password-change self-events.
- ☐ Activity timeline: 2FA/password events appear on employee Updates (if linked).
- ☐ Integration: deactivate user → blocked within 5-min Redis TTL; expired access token still works ≤15 min.
- ☐ Edge: concurrent failed logins (lockout bypass 🔒); reused/expired reset token rejected; reused backup code rejected.
- ☐ Security: enumeration (forgot/login timing); 2FA `.valid` enforced; rate limits (10 login / 15 min).
- ☐ Performance: bcrypt latency under burst login; refresh singleton (no double-refresh race).

---

### 3.2 Employees & Organizational Data

**Purpose:** Employee master records + org hierarchy (branch→division→department), teams, designations, grades, transfers, salary revisions, dependents, notes, warnings.

**Actions & Roles:** Create/update/archive/bulk-import/export: **hr_manager, super_admin**. Self-edit limited fields: **employee** (`PATCH /employees/me`: phone, personal email, emergency contact, home address). View: all (dept_head scoped to subtree; peers subject to privacy policy).

**Workflow/Statuses:** Employee status `onboarding → active → suspended/terminated` (+ `visa_expired`). New hire starts `onboarding`; auto-promoted to `active` when onboarding checklist hits 100%. Archive = soft (`isArchived=true`, `status=terminated`); ⚠️ **no unarchive** function. Employee number auto-generated atomically (`{CODE}-NNN-MM-YYYY`).

**Notifications:** Transfer → in-app to employee ("You have been transferred"). Others: none on create/update. **Emails:** invite email only on explicit `POST /employees/:id/invite`. None on create.

**Audit:** create/update/delete on `employee` (payroll-field changes tagged `kind:'payroll'`). Transfer → dual entry (`employee_transfer` + `employee`). Dependents/notes/warnings → mirrored to `employee` as `update`. ⚠️ Salary revision creates **no** audit row of its own and does **not** update the employee's live salary (audit-only record).

**Validations/Edge cases:** unique employeeNo & email per tenant; salary ≥ 0, total ≥ basic; contract/probation end ≥ join date; bulk import **all-or-nothing** (one bad row rolls back the whole batch, max 500); reporting-manager cycle risk (client-guarded; subtree query capped at 50 levels); department text/FK auto-sync; changing department auto-removes from dept-scoped teams.

**Dashboard/Report:** headcount KPI (cache `dashboard:kpis:{tenantId}` invalidated on create/archive); org chart; headcount/turnover reports; export CSV/PDF (privacy feature-flags applied).

**Dependencies (downstream of an employee change):** payroll (salary/status/bank), leave (balances), visa & documents (expiry sync), assets, attendance, onboarding/exit, org chart, teams, compliance (emiratisation/visa). ⚠️ Archive does **not** cascade-remove team memberships, cancel pending travel, or exclude from an in-flight payroll automatically.

**QA Checklist (Employees):**
- ☐ Functional: create/edit/archive; self-edit whitelist; avatar; org-unit & team assignment; designations/grades CRUD.
- ☐ Workflow: onboarding→active auto-promotion; archive sets terminated; transfer/salary-revision records.
- ☐ Notification: transfer notifies employee; (confirm none on create).
- ☐ Email: invite email only on explicit invite.
- ☐ Permission: dept_head sees only subtree; employee self-edit cannot touch salary/status/visa; only HR mutates.
- ☐ Audit: create/update diffs (sensitive masked); transfer dual-entry + email; payroll-field tag; salary revision audited + applied to employee row.
- ☐ Activity timeline: dependents/notes/warnings/transfer appear on employee Updates.
- ☐ Reporting: headcount KPI + org chart + reports update; export masks per privacy flags.
- ☐ Dashboard: KPI cache invalidates on create/archive.
- ☐ Integration: department change → team auto-exit; salary revision does NOT change payroll until employee row updated (document expectation).
- ☐ Edge: bulk import partial failure rolls back all; duplicate email/employeeNo; reporting cycle; concurrent create numbering.
- ☐ Performance: large list pagination (offset & cursor); subtree query depth.

---

### 3.3 Payroll & Finance

**Purpose:** Monthly WPS-compliant payroll, payslips, adjustments (leave/loan/manual), gratuity, WPS SIF export, employee loans, salary-component catalog.

**Actions & Roles:** Payroll & components & WPS: **hr_manager, super_admin** (dept_head has **no** payroll access). Employees view **own** payslips and request **own** loans. Loan approve/reject/record-payment: HR.

**Workflow/Statuses:**
- **Payroll run:** `draft → processing → approved → wps_submitted → paid`; failure reverts to `draft`. Period unique per tenant (cannot run a month twice). Async via BullMQ (202 + jobId, poll or WS); sync fallback if Redis down.
- **Run sequence:** sync adjustments (auto unpaid-leave + loan deductions, preserve manual) → resolve earnings (catalog → legacy fallback, % -of-basic) → build payslips (pro-rata for mid-month) → persist atomically → fire payslip emails + per-employee audit + cache invalidation.
- **Period lock:** once a run leaves draft, that period's adjustments are read-only (409 on mutation).
- **Loan:** `pending → approved → active → completed` (+ rejected/cancelled). Active loans auto-deduct each period; auto-closes when installments paid.

**Notifications:** loan approved (success) / rejected (warning) to employee; payslip generated per employee on run completion. **Emails:** `payslipEmail` per employee on completion.

**Audit:** payroll create/run(approve)/update/delete; per-payslip `approve` with net/period metadata; adjustments create/update/delete/import; loan create+submit/approve/reject/payment; salary-component create/update/delete.

**Validations/Edge cases:** readiness checklist (blockers: no payable employees, missing basic salary; warnings: missing IBAN, pending leave). Re-run blocked (unique index). WPS SIF includes only bank-transfer employees (placeholder IBAN if missing → would fail at bank). Gratuity: 21 days/yr (≤5 yrs) + 30 days/yr (>5), 0 if <1 yr. Pro-rata uses fixed /30. ⚠️ async failure → manual retry, no auto-requeue, no HR alert.

**Dashboard/Report:** payroll cost KPI, headcount cost, outstanding loans, pending loan approvals; payroll & loan reports; compliance WPS rate.

**Dependencies:** employee salary/status/bank → payroll; approved leave → unpaid-leave deductions; active loans → loan deductions; salary-components → earnings; payroll status → compliance WPS metric.

**QA Checklist (Payroll):**
- ☐ Functional: create draft (no payslips); readiness; process sync & async; payslip PDF; employee My Payslips; WPS SIF; loan request/approve/reject/payment; component CRUD + %-of-basic.
- ☐ Workflow: status path draft→…→paid; failure reverts to draft; period lock; loan auto-close.
- ☐ Notification: loan approve/reject; payslip generated.
- ☐ Email: payslip email per employee; kill-switch suppresses when tenant notifications disabled.
- ☐ Permission: dept_head blocked from payroll; employee sees only own payslip/loans.
- ☐ Audit: run, per-payslip, adjustments, loans, components.
- ☐ Activity timeline: loan submit on employee; payroll per-employee entries.
- ☐ Reporting/Dashboard: cost KPIs + outstanding loans update; cache invalidation.
- ☐ Integration: leave → unpaid-leave adjustment; loan → deduction; salary-component override.
- ☐ Edge: re-run same month (409); zero payable; missing IBAN warning vs cash; mid-month pro-rata; gratuity boundaries (<1yr, exactly 5yr, >5yr); async retry.
- ☐ Performance: many drafts preview cost; large run async concurrency (2).

---
### 3.4 Leave Management

**Purpose:** Leave requests, approvals, balances, accrual, policies, holidays, adjustments, air tickets, leave offsets.

**Actions & Roles:** Submit own: **employee** (HR/PRO can submit on behalf). Approve/reject: **hr_manager, super_admin, dept_head** (dept_head scoped to own department; cannot self-approve). Cancel: requester or admin. Policies & balance adjustments & rollover: HR.

**Workflow/Statuses:** `pending → approved → (auto-creates on_leave attendance)` or `→ rejected`; `→ cancelled`. Working days = calendar minus tenant week-off days (default Fri+Sat) minus public holidays (min 1).

**Notifications & Emails:** On submit → email to HR/super_admin/dept_head of employee's department (respects kill-switch). On approve/reject → email to employee. **Audit:** dual-entry (`leave` + `employee`) on create/approve/reject/cancel; policy update; balance adjustment.

**Validations/Edge cases:** balance check (non-unlimited types require available ≥ days); overlap check (409); self-approval blocked (403); cancellation restores `taken` via `GREATEST(taken-days,0)`; carry-forward expiry zeroed when `carryExpiresOn<today`; year-boundary requests use start-date year.

**Accrual rules:** `flat` (full on day 1), `monthly_2_then_30` (2/mo capped 30 first partial year, full after), `unlimited`, `none`. Balance components: entitled, accrued, carriedForward, taken, pending, adjustment, available. Cached 5-min (Redis). Year-end rollover = on-demand (HR), gated by `rolloverEnabledFrom`.

**Dashboard/Report:** pending-leave KPI (cache invalidated on approve/cancel); leave balance & leave reports; export CSV/PDF; approved leave shown on calendar.

**Dependencies:** approval → attendance `on_leave` + balance deduction → payroll unpaid-leave/sick-half-pay; holidays → working-day calc; calendar.

**QA Checklist (Leave):** ☐ Functional submit/approve/reject/cancel; balances; policies; rollover; air tickets; offsets. ☐ Workflow status path; auto-attendance on approve. ☐ Notification to approvers + employee. ☐ Email submit→approvers, decision→employee (+kill-switch). ☐ Permission dept_head scope; no self-approve; employee self only. ☐ Audit dual entries. ☐ Timeline on employee. ☐ Reporting/Dashboard pending KPI + reports. ☐ Integration attendance + payroll deduction + holidays. ☐ Edge insufficient balance, overlap, year boundary, carry expiry, cancel restores. ☐ Security cross-tenant; dept scope using current (not stale) department. ☐ Performance rollover bulk (chunked).

---

### 3.5 Attendance & Shifts

**Purpose:** Track presence via web punch, manual HR entry, external/biometric punch, CSV/biometric bulk import; shift templates; attendance calendar.

**Actions & Roles:** Web punch: employee (self; flag-gated `attendancePunchEnabled`); HR/dept_head on behalf (scoped). Manual entry: HR/super_admin (flag-gated). External punch: HR role **or** Connected-App key with `attendance:write`. Mappings & bulk import & shifts: HR. View: employee own, dept_head dept, HR all.

**Workflow/Statuses:** Per-day status: `present | late | absent | half_day | wfh | on_leave` (+ calendar codes holiday/weekly-off/in-progress/incomplete). Punches alternate in/out; hours summed; 8h standard for overtime.

**Notifications/Emails:** none for punches. **Audit:** every punch mirrored to `employee` timeline (`kind:'attendance'`, subKind check-in/check-out/manual/delete/external); mapping & bulk import audited.

**Validations/Edge cases:** punch alternation enforced for web (409 on double-in/out), allowed for manual; 60-sec idempotency window; geo bounds; calendar codes IP (in-progress) vs INC (incomplete past day); biometric resolution mapper_id→employee_no; bulk import dedup (max 2000 rows), mappings (max 500).

**Dashboard/Report:** attendance summary, calendar grid, punch history, export. Feeds payroll hours/overtime.

🔒 **Known security item:** external-punch endpoint validates employee∈tenant but **not** that requester is that employee/HR → any employee can punch for a colleague. ⚠️ No `status=active` check → terminated employees can still punch. ⚠️ Tenant week-off vs shift week-off may diverge between leave & attendance views.

**QA Checklist (Attendance):** ☐ Functional web/manual/external punch; mappings; bulk import validate+commit; shifts CRUD; calendar. ☐ Workflow status derivation; multi-session hours; IP/INC codes. ☐ Notification/Email n/a. ☐ Permission flags; dept scope; app-key scope. ☐ Audit punch mirrors + import. ☐ Timeline on employee. ☐ Reporting summary/calendar/export; payroll hours. ☐ Integration approved leave → on_leave; shifts → weekly-off cells. ☐ Edge double-punch, 60s idempotency, concurrent import duplicates, geo bounds. ☐ Security external-punch spoofing 🔒, terminated punch, cross-tenant. ☐ Performance calendar 3-query grid, 2000-row import.

---

### 3.6 Calendar & Public Holidays

**Purpose:** Unified calendar aggregating visas, documents, approved leaves, performance reviews, public holidays. Holidays exclude days from leave/working-day calc.

**Actions & Roles:** View: all authenticated (tenant-wide). Holiday CRUD: HR (Org Settings → Leave). **Audit:** holiday create/update/delete.

**Validations:** holiday unique per (tenant, date); leave working-day calc subtracts holidays.

**QA Checklist (Calendar):** ☐ Functional aggregated events render; holiday CRUD. ☐ Permission HR-only holiday edit. ☐ Audit holiday changes. ☐ Integration holiday affects leave working-days + attendance grid. ☐ Edge holiday on weekend, recurring holidays, date-range spanning years.

---

### 3.7 Visa (8-Step Workflow)

**Purpose:** UAE work-visa lifecycle with cost tracking, urgency, PRO report.

**Actions & Roles:** Create/advance/cancel/cost/export: **hr_manager, pro_officer, super_admin**. (pro_officer is a primary user here.)

**Workflow/Statuses:** 8 steps → statuses `entry_permit → medical_pending → eid_pending → stamping → active`; plus `cancelled` (any state, requires reason, terminal), `expired`/`expiring_soon` (auto via urgency recalc). Advancing a completed/terminal visa is a no-op (`advanced:false`). Step-advance + costs are atomic (transaction).

**Notifications/Emails:** Expiry worker → in-app (info→warning→error at 90/60/30/14/7d) + `visaExpiryAlertEmail` to HR+PRO. ⚠️ **No** notification/email on manual step advance or cost add (audit only).

**Audit:** local `audit()` wrapper — dual-entry (`visa` + `employee`, `kind:'visa'`) for create/update/advance(approve)/cancel(reject)/delete; cost create/delete on `visa`. Captures step labels, status transitions, cost totals.

**Validations/Edge cases:** one non-terminal visa per (employee, visaType) — 409 duplicate; cost amount > 0; urgency normal/urgent/critical by days-left; orphaned costs allowed on delete (set null); step history cascades on delete.

**Dashboard/Report:** active-visa KPI (cache invalidated); PRO cost report (CSV/PDF, YTD by category/month/employee); compliance visa-validity.

**Dependencies:** employee.visaExpiry ↔ expiry worker; documents verify syncs visa fields to employee; calendar; compliance.

**QA Checklist (Visa):** ☐ Functional create/advance 1→8/cancel/cost add+delete/export/urgency recalc. ☐ Workflow status transitions; no-op at step 8/terminal; atomic advance+costs. ☐ Notification expiry escalation + employee in-app on step advance. ☐ Email expiry alerts to HR+PRO (+kill-switch). ☐ Permission HR/PRO/super_admin. ☐ Audit dual-entry + cost metadata. ☐ Timeline on employee. ☐ Reporting active-visa KPI + PRO report + compliance. ☐ Integration expiry worker thresholds; document verify sync. ☐ Edge duplicate non-terminal (409), negative cost, expired date, no expiry date. ☐ Security cross-tenant employee/cost. ☐ Performance bulk urgency recalc.

---

### 3.8 Documents

**Purpose:** Centralized document upload (S3), categorization, verify/reject, expiry tracking, employee-field sync on verify.

**Actions & Roles:** Upload/list/view/edit: all authenticated (employee sees own). Verify/reject/delete: **hr_manager, pro_officer, super_admin**.

**Workflow/Statuses:** `pending_upload → under_review → valid` (verify) / `rejected` (reject, reason). Auto `expiring_soon` (30d) / `expired` via worker. **On verify**, mapped doc types sync number/expiry/issue-date back to the employee record (passport, Emirates ID, visa variants, labour card) in the same transaction.

**Notifications/Emails:** verify → employee (success in-app + `documentVerifiedEmail`); reject → employee (warning in-app + `documentRejectedEmail`); expiry worker → HR+PRO (in-app + `documentExpiryAlertEmail`). **Audit:** create/update/approve(verify)/reject/delete dual-entry (`document` + `employee`); separate `onboarding_docs_audit` log (uploaded/verified/rejected/downloaded/viewed/deleted) queryable per document.

**Validations/Edge cases:** MIME whitelist via magic bytes (415); `objectExists` pre-flight; expiry ISO; token-based download (`?token=`) must match doc. 🔒 **Known:** `POST /documents` does not enforce `s3Key` tenant prefix → cross-tenant key registration.

**Dashboard/Report:** compliance document-completeness + expiring-soon.

**Dependencies:** verify → employee field sync; expiry worker; onboarding step linkage; compliance.

**QA Checklist (Documents):** ☐ Functional upload (presigned + multipart); edit; verify; reject; delete; download (auth + token). ☐ Workflow status path; verify syncs employee fields; auto expiry status. ☐ Notification verify/reject/expiry. ☐ Email verify/reject/expiry (+kill-switch). ☐ Permission verify/reject = HR/PRO; employee sees own. ☐ Audit dual-entry + onboarding_docs_audit. ☐ Timeline on employee. ☐ Reporting compliance completeness/expiring. ☐ Integration verify→employee sync; expiry worker. ☐ Edge unmapped docType (no sync), past expiry, S3 upload failure, token mismatch. ☐ Security 🔒 cross-tenant s3Key injection; MIME spoof. ☐ Performance large file, presigned expiry.

---

### 3.9 Compliance

**Purpose:** Read-only dashboard: WPS rate, Emiratisation (2% MOHRE target), visa validity, document completeness, expiring-soon; overall score.

**Actions & Roles:** View: **hr_manager, pro_officer, super_admin**. No mutations → no audit/notifications.

**Validations/Edge cases:** division-by-zero guarded (0 employees → vacuous pass); working statuses = active+onboarding. ⚠️ **Known bug:** expiry-alert queries miss a `>= today` lower bound → already-expired records counted in "expiring in N days".

**Dependencies:** employees, documents, payroll runs (read-only aggregation).

**QA Checklist (Compliance):** ☐ Functional all 5 checks compute; overall = average. ☐ Permission HR/PRO/super_admin only. ☐ Reporting/Dashboard score + per-check counts + route links. ☐ Integration reflects employee/document/payroll changes. ☐ Edge zero employees/docs/runs; ⚠️ already-expired counted in expiring; emiratisation gap = max(0, …). ☐ Performance aggregate query cost.

---
### 3.10 Recruitment & Public Careers Portal

**Purpose:** Job postings, candidate pipeline (kanban), interviews, public careers site, referrals, convert-to-employee, candidate-source tracking, per-tenant skill/qualification catalogs.

**Actions & Roles:** Jobs/candidates/stages/interviews/convert: **hr_manager, super_admin**. Skill/qualification catalog manage: **hr_manager, super_admin** (reads: any authenticated user — job dialogs need them). Referral submit: **employee**. Public browse/apply: **unauthenticated** (careers portal).

**Workflow/Statuses:** Job `draft → open → closed / on_hold` (free transitions, no approval). Candidate pipeline = per-tenant customizable stages (default received→screening→interview→offer→hired/rejected; `pre_boarding` gates conversion). Interview `scheduled → completed/cancelled/no_show`.

**Candidate source tracking:** `direct` (added by HR), `careers` (public portal), `referral` (employee). Shown as a color-coded badge on kanban cards, list rows, and candidate profile; filterable by Source.

**Skill & qualification catalogs:** Per-tenant vocabulary powering type-ahead suggestions in job dialogs and résumé-upload forms. Managed in **Org Settings → Recruitment** (sub-tabs: Stages / Skills / Qualifications) — searchable, server-paginated list (10/page infinite scroll) with add/rename/delete. Names are case-insensitively unique per tenant among live entries; duplicate add/rename → 409. Delete is **soft** (tombstone; entry vanishes from suggestions, the name is immediately reusable; jobs/candidates keep their own denormalised copies). The catalog is also auto-upserted from job create/update (a deleted name re-enters when a job uses it again). Suggestion endpoints (`/jobs/skill-suggestions`, `/jobs/qualification-suggestions`) are paginated with debounced literal substring search (LIKE metacharacters escaped). Job detail page shows the candidates card with two lenses: **Applicants** (stage/source filters) and **Recommended** (talent-pool matches), with count badges; auto-opens Recommended when there are no applicants but matches exist.

**Public careers portal:** `/careers/:companyCode/jobs` (grid, 25/page infinite scroll, filters: search/department/location/type via facets endpoint), `/jobs/:id` (detail), apply with resume (PDF/DOC/DOCX ≤5MB). Tenant resolved by `companyCode`. Rate limits: browse 60/min, apply 5/10min.

**Notifications/Emails:** Candidate add/stage-change → WebSocket to HR (live kanban). Public apply → **applicant confirmation email** + **HR "new application" alert** (email + in-app). Interview scheduled → **email to candidate + interviewer** + in-app to interviewer. Convert → employee gets in-app notification.

**Audit:** job/application/stage/interview/recruitment_stage create/update/delete; recruitment_skill / recruitment_qualification create/update/delete (catalog CRUD); public applicant logged with `actorRole:'public'`, `actorId:null`, `metadata.source='careers_portal'`. Convert → dual-entry (application update + employee create).

**Validations/Edge cases:** duplicate application guard (same email+job unless prior rejected → 409); resume magic-byte MIME + 5MB; bulk import (max 500); stage delete blocked if candidates on it (409); careers apply requires resume (validated); resume S3 upload failure is swallowed (application still saved). ⚠️ Referrals table exists but referral management routes appear incomplete; ⚠️ no CAPTCHA on public apply (rate-limit only).

**Dashboard/Report:** recruitment KPIs (open positions, applicants, in-interview, offer); application export CSV/PDF.

**Dependencies:** candidate (pre_boarding) → convert → employee → auto onboarding checklist (9 steps); careers/referral → pipeline; WebSocket live updates.

**QA Checklist (Recruitment):** ☐ Functional job CRUD; add candidate; drag stage; interview schedule/feedback; convert; public browse/filter/apply; referral; skill/qualification catalog add/rename/delete + search. ☐ Workflow job statuses; pipeline stages; pre_boarding gate; stage-delete block. ☐ Notification WS candidate-added/stage-changed; convert notifies employee. ☐ Email applicant confirmation + HR new-application alert + interview invitations. ☐ Permission HR mutate; catalog writes HR-only (reads any auth); public unauthenticated apply; employee referral. ☐ Audit incl. public actorRole; convert dual-entry; catalog create/update/delete. ☐ Timeline on converted employee. ☐ Reporting recruitment KPIs + export. ☐ Integration convert→onboarding; careers companyCode resolution; source badge+filter; job-save upserts catalog; type-ahead reflects catalog edits. ☐ Edge duplicate apply (409), duplicate catalog name (409, case-insensitive), deleted catalog name re-addable, `%`/`_` searched literally, resume MIME/size, rate-limit apply, S3 failure swallow, missing companyCode. ☐ Security public endpoint exposure, no CAPTCHA, cross-tenant (incl. catalog). ☐ Performance 25/page infinite scroll; facets; suggestion paging 10/page.

---

### 3.11 Onboarding

**Purpose:** New-hire checklist (9 template steps), document collection via public magic-link upload, auto-promotion to active.

**Actions & Roles:** Create checklist, manage steps, issue/revoke upload tokens: **hr_manager, super_admin**. View: employee own; pro_officer view. Public upload: link holder (no login).

**Workflow/Statuses:** Checklist seeded with 9 steps (`pending → in_progress → completed`, `overdue` via nightly worker). Progress = completed/total; at **100% the employee auto-promotes `onboarding → active`**. Document upload auto-advances steps (no required-docs → one upload completes; with mandatory docs → all must be satisfied).

**Notifications/Emails:** Upload token issued → `onboardingUploadLinkEmail` to new hire. Step marked complete → employee in-app; checklist 100% → employee in-app (welcome). (Open: no overdue / token-expiry reminder.)

**Audit:** checklist create; step create/update/delete/submit(complete); template step CRUD; token invite/revoke; document uploads in `onboarding_docs_audit`.

**Validations/Edge cases:** one checklist per (employee, tenant); token 1–30 day TTL + revocation (`jti`); upload MIME whitelist, **10MB** limit (⚠️ inconsistent with 5MB resume); expiry-required docs must include expiry date; ⚠️ revoked token may still allow GET upload-info (view) — verify.

**Dashboard/Report:** onboarding analytics (total/completed/in-progress/overdue, avg progress, completion rate).

**Dependencies:** convert-to-employee auto-creates checklist; 100% → employee active; documents module; nightly overdue worker.

**QA Checklist (Onboarding):** ☐ Functional create checklist; step transitions; issue/revoke token; public upload-info + upload. ☐ Workflow auto-advance rules; 100%→active promotion; overdue marking. ☐ Notification on step complete + 100% (welcome). ☐ Email upload-link to hire. ☐ Permission HR manage; employee/link-holder upload. ☐ Audit checklist/step/token + docs audit. ☐ Timeline (via document/employee). ☐ Reporting onboarding analytics. ☐ Integration convert→checklist; 100%→active. ☐ Edge 10MB vs 5MB, expiry-required doc, revoked token view, template reorder. ☐ Security token expiry/revocation, public upload abuse. ☐ Performance concurrent uploads progress recalc.

---

### 3.12 Exit & Offboarding

**Purpose:** Exit request, UAE settlement calc (gratuity + leave encashment + unpaid salary − deductions), clearances, exit interview, settlement payout.

**Actions & Roles:** Create/approve/reject/settle/override: **hr_manager, super_admin**. Exit interview & own settlement preview: **employee** (interview via token link). Clearance owners (manager/HR partner/specific user) mark items.

**Workflow/Statuses:** Exit `pending → approved → completed`; `→ rejected` (terminal). On **approve**, employee → `terminated`; on reject, employee stays `active`. Clearance items `pending → in_progress → completed/waived`. Approval blocked if clearances not completed/waived or required interview questions unanswered — unless `override:true`.

**Notifications/Emails:** approve/reject/settlement-paid → employee in-app. Emails workflow-config-dependent (offboarding workflow automations on `on_request_added/approved/rejected/settlement_paid/relieving_date`). ⚠️ Exit-interview link email exists but may need manual send/workflow config.

**Audit:** exit create/approve/reject/settlement dual-entry (`exit_request` + `employee`); override flag in metadata; exit-interview submit (`exit_interview_response`, actor=employee). ⚠️ Clearance item status changes **not** audited to activity_logs.

**Settlement rules:** gratuity 21 d/yr (≤5) + 30 d/yr (>5), 0 if <1yr; leave encash = unused annual × (basic/30); unpaid salary pro-rata; total = max(0, …). Salary from catalog → legacy fallback; leave from balances → approved-requests fallback.

**Validations/Edge cases:** override bypasses readiness check (audited); ⚠️ exit-interview answers not type-validated; ⚠️ required-question completeness not enforced at submit; no clearance-overdue worker; no un-approve (must reject + recreate).

**Dashboard/Report:** settlement export CSV/PDF (max 10k rows).

**Dependencies:** approve → employee terminated; gratuity from payroll/exit service; assets (manual return — ⚠️ not auto); leave balances.

**QA Checklist (Exit):** ☐ Functional create+settlement; approve/reject; settlement-paid; clearance items; exit interview token; export. ☐ Workflow status path; employee→terminated on approve only; clearance gating; override. ☐ Notification approve/reject/settle to employee. ☐ Email workflow-dependent (document config). ☐ Permission HR mutate; employee interview/own preview. ☐ Audit dual-entry + interview (note: clearance status changes are not audited — see §8.3). ☐ Timeline on employee. ☐ Reporting settlement export. ☐ Integration terminated status; gratuity calc; asset return (manual). ☐ Edge <1yr/5yr/>5yr gratuity, catalog vs legacy salary, balance vs request leave, override+block, reject keeps active. ☐ Security token claims match; cross-tenant. ☐ Performance export 10k cap.

---

### 3.13 Performance Reviews

**Purpose:** Appraisals with multi-dimension 1–5 ratings, feedback, status; CSV/XLSX import, CSV/PDF export.

**Actions & Roles:** Create/edit draft: hr_manager, dept_head (own dept), super_admin. View: employee own, dept_head dept, HR all. Import/export/delete: HR.

**Workflow/Statuses:** `draft → submitted → acknowledged → completed`. ⚠️ Status is a **free field** — no server-side state-machine guard (client controls transitions).

**Notifications/Emails:** On submit/acknowledge/complete → employee in-app **+ email** (`performanceReviewEmail`); HR drafts don't notify. **Audit:** dual-entry (`performance_review` + `employee`, kind:'performance') on create/update/delete. Soft delete.

**Validations/Edge cases:** ratings 1–5; bulk import resolves employeeNo (unknown → row rejected; valid rows committed in one transaction; invalid silently dropped at commit); ⚠️ no uniqueness → duplicate reviews per employee+period possible; ⚠️ no self-rating workflow despite `employeeComments` field.

**Dashboard/Report:** export; ratings distribution (queryable). **Dependencies:** standalone (no payroll/leave impact).

**QA Checklist (Performance):** ☐ Functional create/edit/delete; import validate+commit; export. ☐ Workflow status transitions (note: unguarded). ☐ Notification/Email employee on submit/acknowledge/complete. ☐ Permission dept_head dept scope; employee own. ☐ Audit dual-entry. ☐ Timeline on employee. ☐ Reporting export + distribution. ☐ Edge duplicate review, unknown employeeNo, rating bounds, soft-delete hidden. ☐ Security cross-tenant; dept scope. ☐ Performance bulk import.

---

### 3.14 Training

**Purpose:** Track training records (type, cost, dates, certificate). **Actions & Roles:** Create/edit/delete: HR. View: employee own, HR all.

**Workflow/Statuses:** `planned → in_progress → completed / cancelled` (informational, no approval). **Notifications/Emails:** On assignment → employee in-app **+ email** (`trainingAssignedEmail`); a daily **certificate-expiry worker** alerts HR + employee at 90/60/30 days. **Audit:** `training_record` create/update/delete. Soft delete.

**Validations/Edge cases:** required employeeId/title/startDate; cost numeric AED. ⚠️ certificate `certificateExpiry` **not** monitored by any worker (no expiry alerts). ⚠️ no employee self-enrollment; no mandatory-training compliance.

**QA Checklist (Training):** ☐ Functional CRUD; ☐ Workflow status; ☐ Notification/Email gap none; ☐ Permission HR manage/employee own; ☐ Audit create/update/delete; ☐ Reporting list/cost; ☐ Edge cert expiry not alerted, soft-delete; ☐ Security cross-tenant.

---

### 3.15 Travel

**Purpose:** Travel requests + per-trip expenses with separate approval flows; customer-billable flag.

**Actions & Roles:** Create/edit/submit/cancel own: employee (HR any). Approve/reject/complete request & approve/reject/reimburse expense: HR. View: employee own, dept_head dept (view only), HR all.

**Workflow/Statuses:** Request `draft → submitted → approved → completed`; `→ rejected`; `→ cancelled`. Expense `pending → approved → reimbursed`; `→ rejected`. Travel number `TRV-YYYY-NNNN` (race-safe unique).

**Notifications/Emails:** Submit → approvers (HR) in-app **+ email**; approve/reject → requester in-app **+ email** (`travelStatusEmail`). **Audit:** request & expense create/submit/update/approve/reject/delete (with rejection reason). Soft delete.

**Validations/Edge cases:** arrival ≥ departure (duration inclusive ≥1); can't edit after approval; can't add expense to draft request; rejection reason required. ⚠️ no budget caps; no duplicate-trip detection; ⚠️ travel-number race → 409 (no auto-retry); ⚠️ soft-delete doesn't cascade expenses; no auto-cancel on employee exit.

**QA Checklist (Travel):** ☐ Functional request lifecycle + expense lifecycle. ☐ Workflow both state machines; edit/expense gating. ☐ Notification/Email submit→approvers, decision→requester. ☐ Permission owner vs HR; dept_head view-only. ☐ Audit request+expense. ☐ Reporting list/totals. ☐ Edge duration<1, expense-on-draft, TRV race 409, soft-delete cascade. ☐ Security cross-tenant; scope. ☐ Performance list.

---

### 3.16 Assets

**Purpose:** Asset inventory + assignment to employees + maintenance; bulk import; export.

**Actions & Roles:** Asset CRUD, assign, return, mark-lost, maintenance, categories, bulk import: HR. List: all. View employee assets: employee own / elevated any.

**Workflow/Statuses:** Asset `available → assigned → returned/lost`; `maintenance → available`; `retired`. Assignment `assigned → returned/lost`. Asset code auto `{CODE}-AST-NNNNN`.

**Notifications/Emails:** assign → employee in-app ("Asset assigned, due back {date}"). No email; none on return/lost. **Audit:** asset create/update/delete; assignment create(assign)/update(return) dual-entry on `employee` (kind:'asset').

**Validations/Edge cases:** can't assign non-available (409); can't return non-assigned (409); bulk import (max 500, atomic, dup code rejected). ⚠️ no overdue-return alerts (expectedReturnDate not monitored); ⚠️ double-assignment not DB-constrained; ⚠️ no auto-return on employee exit; no depreciation.

**Dashboard/Report:** asset summary (total/available/assigned/maintenance); export CSV/PDF; per-asset assignment history. **Dependencies:** onboarding step 4 (manual), exit (manual return).

**QA Checklist (Assets):** ☐ Functional CRUD; assign/return/lost; maintenance; categories; bulk import; export. ☐ Workflow asset+assignment states. ☐ Notification assign→employee. ☐ Email gap none. ☐ Permission HR manage; employee own view. ☐ Audit asset + assignment dual-entry. ☐ Timeline on employee. ☐ Reporting summary + history + export. ☐ Integration onboarding/exit (manual). ☐ Edge assign non-available (409), return non-assigned (409), bulk dup, overdue not alerted. ☐ Security cross-tenant. ☐ Performance bulk 500.

---

### 3.17 Complaints (Grievance)

**Purpose:** Confidential grievance submission with SLA tracking and HR workflow.

**Actions & Roles:** Create/edit-draft/submit/view own: employee. List/view/acknowledge/assign/escalate/resolve/delete: hr_manager, super_admin.

**Workflow/Statuses:** `draft → submitted → under_review → resolved`; `under_review → escalated → resolved`. Category & severity & confidentiality (`anonymous/named/confidential`) enums. SLA `slaDueAt` by severity (critical 7d / high 14d / medium 21d / low 42d).

**Notifications/Emails:** Submit → **email + in-app to all hr_manager + super_admin** (subject includes severity + SLA). Acknowledge → complainant in-app; resolve → complainant in-app **+ email** (`complaintStatusEmail`). A daily **SLA-breach worker** alerts HR for open complaints past `slaDueAt`. **Audit:** create/update/submit/acknowledge/assign/escalate/resolve/delete; **field names logged but values redacted**; metadata `{category, severity, stage}`.

**Validations/Edge cases:** title 3–200, description 10–5000, resolution notes ≥5. **Confidentiality:** description is **encrypted at rest** (AES-256-GCM) and decrypted only on authorized read; not full-text searchable; audit logs only field names, never values. Residual: a super_admin could still correlate actor+timestamps. No attachments; no appeal workflow.

**Dashboard/Report:** stats (total/open/critical/overdue); SLA-breach highlight. ❌ no CSV/PDF export.

**QA Checklist (Complaints):** ☐ Functional create/submit/edit-draft; acknowledge/assign/escalate/resolve. ☐ Workflow status path; SLA deadline set by severity. ☐ Notification in-app to HR on submit; complainant on acknowledge/resolve. ☐ Email submit→HR; resolve→complainant. ☐ Permission employee own; HR manage; confidentiality visibility. ☐ Audit redacted values; field names only. ☐ Reporting stats + SLA highlight. ☐ Integration SLA-breach worker alerts HR. ☐ Edge anonymity (description encrypted at rest; actor-correlation residual), SLA breach worker, resolution notes min length. ☐ Security confidentiality (encrypted). ☐ Performance HR queue filters.

---
### 3.18 Tenants (Workspace & Membership)

**Purpose:** Multi-tenant lifecycle, member invites, role changes, workspace switching.

**Actions & Roles:** Create/delete tenant, switch, invite, role-change, remove: super_admin; hr_manager can invite/role-change(non-super_admin)/remove. Accept invite: unauthenticated (token).

**Workflow:** Create → bootstraps super_admin membership + default employee + org units (3-level seed) + grade levels + salary components + shifts + onboarding/recruitment templates. Invite (`pending` → `accepted` on token use, 7-day TTL; auto-creates minimal employee if none). Role change syncs `users.role`. Remove = soft (`isActive=false`). Switch = mints new JWT scoped to target tenant. Delete = hard cascade purge.

**Emails:** `inviteUserEmail` (always sends). **Audit:** tenant create/invite/accept/role-change/remove/switch(view)/delete.

**Validations/Edge cases:** cannot demote/remove last super_admin; cannot self-demote/self-remove; duplicate invite blocked; HR cannot assign super_admin. Role change/removal → affected member emailed (+ in-app on role change). ⚠️ tenant-delete audit may be lost to FK cascade (no platform-level log); invite resend not rate-limited.

**QA Checklist (Tenants):** ☐ Functional create/invite/accept/switch/role-change/remove/delete. ☐ Workflow invite states; bootstrap seeds. ☐ Email invite (always). ☐ Permission last-super_admin/self protections; HR cannot grant super_admin. ☐ Audit all member ops. ☐ Edge expired invite, duplicate invite, delete-cascade audit loss. ☐ Security cross-tenant switch validation; token hash.

---

### 3.19 Subscription & Billing

**Purpose:** Plans (starter free/5 · professional Stripe · enterprise sales), quota enforcement, billing history, expiry reminders.

**Actions & Roles:** View/checkout/quota/upgrade/enterprise inquiry: hr_manager, super_admin. View plan info: all.

**Workflow:** starter → Stripe checkout → webhook `checkout.session.completed` sets plan + quota + expiry(+30d). Quota update via Stripe or manual email fallback. ⚠️ **No auto-downgrade on expiry** (expired plan still allows unlimited adds — revenue/limit risk).

**Notifications/Emails:** expiry reminder (7d,1d) in-app + email; invoice email on success/quota; upgrade-request confirmation + sales; enterprise inquiry → sales. **Audit:** ⚠️ subscription events go to a **separate `subscription_events` table, not `activity_logs`** (not in Audit Log UI).

**Validations/Edge cases:** quota 1–10,000; Stripe signature (HMAC) verified; pricing = ceil(quota)×AED 15. 🔒 ⚠️ webhook **not idempotent** (no `stripe_session_id` uniqueness → duplicate events on retry); quota enforced in app layer only (direct SQL bypass); no pre-limit (80/90%) alert.

**Dependencies:** quota ↔ employee create/import (402 `QUOTA_EXCEEDED`); Stripe; email; subscription-expiry worker.

**QA Checklist (Subscription):** ☐ Functional checkout; webhook activation; quota update; upgrade/enterprise fallback; billing history; invoice PDF. ☐ Workflow plan transitions; expiry reminder; ⚠️ no auto-downgrade. ☐ Notification expiry reminder. ☐ Email invoice/reminder/upgrade/enterprise (+kill-switch). ☐ Permission HR/super_admin. ☐ Audit ⚠️ subscription_events (not activity_logs). ☐ Reporting/Dashboard quota usage KPI; Add-Employee blocked at limit. ☐ Integration quota blocks create/import (402). ☐ Edge webhook idempotency 🔒, expired-plan unlimited adds, quota boundary, Stripe-down fallback. ☐ Security webhook signature; cross-tenant metadata. ☐ Performance webhook handling.

---

### 3.20 Connected Apps (API Integrations)

**Purpose:** Provision app keys + secrets + scopes for external/biometric systems; request logging + analytics.

**Actions & Roles:** Create/update/regenerate/revoke/delete/view analytics+logs: hr_manager, super_admin. App self-read via secret.

**Workflow:** create (`app_live_*` key + bcrypt-hashed secret shown once) → active; update; regenerate (invalidates old secret); revoke (`status=revoked`, 403 thereafter); delete (hard, cascades logs). External calls send `X-API-Secret`/Bearer; middleware validates, logs (latency/status/path), increments count.

**Audit:** create/update/regenerate/delete on `connected_app`. **Notifications/Emails:** none.

**Validations/Edge cases:** name 1–120; scopes free-form. 🔒 **Scopes stored but NOT enforced** (e.g., `attendance:write` not checked) — high risk; ⚠️ IP allowlist not validated (free-form); secret shown once (no re-export); ⚠️ no per-app rate limit; revoke vs delete (hard delete loses audit trail).

**Dashboard/Report:** per-app 24h/7d/30d volume, error rate, latency, top endpoints, status distribution; paginated request logs.

**QA Checklist (Connected Apps):** ☐ Functional create/update/regenerate/revoke/delete; external auth; analytics; logs. ☐ Workflow active→revoked. ☐ Email/Notification n/a. ☐ Permission HR/super_admin; app self-read. ☐ Audit create/update/regenerate/delete. ☐ Reporting analytics + logs. ☐ Integration external attendance punch via `attendance:write`. ☐ Edge revoked key 403, regenerated secret invalidates old, IP allowlist. ☐ Security 🔒 scopes not enforced; secret handling; cross-tenant via secret; no per-app rate limit. ☐ Performance request logging overhead.

---

### 3.21 Settings (Org Configuration)

**Purpose:** Company profile, leave config, holidays, members, roles, privacy policy, notification kill-switch, designations.

**Actions & Roles:** Edit company profile/members/privacy/notifications/leave: hr_manager, super_admin. View profile: all. Personal notification prefs: each user.

**Workflow/Audit:** company profile update (diff-logged, changed fields only); member invite/resend/status; privacy policy (`settings_org_policy`); notifications kill-switch toggle; leave settings. **Emails:** invite/resend.

**Validations/Edge cases:** role enum; HR cannot assign super_admin (403); company code unique; privacy flags default visible; kill-switch is **master gate above per-user prefs**. ⚠️ leave config free-form JSONB (no schema enforcement); privacy not enforced everywhere server-side (reports/exports); logo URL unvalidated.

**Dependencies:** leave settings ↔ leave approval; privacy ↔ dashboard widgets + directory; kill-switch ↔ all emails/notifications.

**QA Checklist (Settings):** ☐ Functional profile edit; member invite/resend/status; privacy; kill-switch; leave config; designations. ☐ Notification/Email invite. ☐ Permission HR/super_admin; HR cannot grant super_admin. ☐ Audit profile diff; member ops; policy; kill-switch. ☐ Integration kill-switch suppresses operational emails (not transactional); privacy hides widgets/directory. ☐ Edge unique code race, free-form leave JSONB, logo URL. ☐ Security role escalation; cross-tenant.

---

### 3.22 Announcements

**Purpose:** Targeted internal comms with audience rules, read/acknowledge tracking, critical-priority auto-email.

**Actions & Roles:** Create/edit/delete/publish/schedule/archive/expire: hr_manager, super_admin. View feed/mark-read/acknowledge: all employees (audience-filtered).

**Workflow/Statuses:** `draft → scheduled (publishAt) → published → archived/expired`. Audience by branch/division/department/team/designation/grade/employment-type/location/individual or all. `requireAck=true` enforces acknowledgment. `priority=critical` auto-emails (capped 500 recipients).

**Audit:** create/update/publish/delete; engagement (view/read/ack) tracked per employee. **Emails:** critical-priority audience email.

**QA Checklist (Announcements):** ☐ Functional create/publish/schedule/archive; audience targeting; read/ack. ☐ Workflow status path; scheduled publish. ☐ Email critical → audience (cap 500, +kill-switch). ☐ Permission HR create; employee view filtered. ☐ Audit lifecycle + engagement. ☐ Edge audience rule combos, requireAck enforcement, 500-cap, scheduled timing. ☐ Security cross-tenant audience leakage.

---

### 3.23 Reports

**Purpose:** Headcount, payroll, turnover, leave and related reports with CSV/PDF export.

**Actions & Roles:** View/export: roles with `view_reports`/`export_reports` (HR/super_admin; pro_officer subset). **Audit:** export actions. **Dependencies:** aggregates employees/payroll/leave/attendance.

**QA Checklist (Reports):** ☐ Functional each report renders; filters; CSV/PDF export. ☐ Permission view vs export; dept_head scope. ☐ Audit export logged. ☐ Integration reflects source-data changes; privacy masking on export. ☐ Edge empty datasets, date ranges, large export. ☐ Performance export size.

---

### 3.24 Dashboard

**Purpose:** Role-aware KPI cards + charts (headcount, payroll cost, pending approvals, compliance, expiries, leave).

**Actions & Roles:** View: all (content varies by role; dept_head scoped). **Cache:** `dashboard:kpis:{tenantId}` invalidated by employee create/archive, leave approve/cancel, visa create/cancel/advance, payroll run.

**QA Checklist (Dashboard):** ☐ Functional KPI cards + charts per role. ☐ Permission role-aware content; dept_head scope. ☐ Integration cache invalidation after each driving action (employee/leave/visa/payroll). ☐ Edge zero-data states; privacy-hidden widgets. ☐ Performance KPI query + cache TTL.

---

### 3.25 Audit Log & Notifications (UI)

**Purpose:** Audit Log page (diff view + filters), Login History page, Notifications page/bell.

**Actions & Roles:** Audit log: `view_audit_log` (HR/super_admin). Login history: own (+ HR all). Notifications: own + tenant-wide; mark read/all.

**Validations/Edge cases:** audit query max 10k rows, stable order; sensitive diffs masked; ⚠️ retention tiers not yet implemented (unbounded growth). Notification 60s poll; scope-checked mark-read.

**QA Checklist (Audit/Notifications):** ☐ Functional audit filters + diff view; login history device/IP; notification list + mark read/all. ☐ Permission audit = HR/super_admin; user marks only own. ☐ Integration every audited action appears; masking applied. ☐ Edge 10k cap, pagination, unread filter, tenant-wide broadcast visible to all. ☐ Security cross-tenant audit isolation. ☐ Performance 10k+ rows.

---
## 4. End-to-End Business Flows (Major Journeys)

Each flow uses the canonical chain: **User Action → System Processing → Workflow → Notifications → Emails → Audit → Activity Timeline → Data Updates → Dashboard → Reporting → Final Result.**

### 4.1 Hire-to-Onboard (Careers → Candidate → Employee → Active)
1. **User Action:** Candidate applies on public careers portal (or HR adds candidate; or employee refers).
2. **System Processing:** Tenant resolved by `companyCode`; duplicate-email guard; resume validated (MIME/5MB) → S3.
3. **Workflow:** Application created at first stage, `source=careers/direct/referral`. HR moves through pipeline to `pre_boarding`, then **convert-to-employee**.
4. **Notifications:** WS `candidate-added`/`stage-changed` to HR; convert → in-app to new employee.
5. **Emails:** applicant confirmation email + HR "new application" alert. Onboarding upload-link email to hire when token issued.
6. **Audit:** application create (public actorRole), stage updates, convert dual-entry (application + employee create).
7. **Activity Timeline:** new employee Updates show creation + onboarding events.
8. **Data Updates:** employee created (`onboarding`); onboarding checklist auto-created (9 steps).
9. **Dashboard:** recruitment KPIs; headcount KPI (cache invalidated).
10. **Reporting:** application export; headcount report.
11. **Final Result:** Hire completes onboarding (uploads docs → steps auto-advance) → **100% → employee auto-promoted to `active`**.

### 4.2 Leave Request-to-Pay-Impact
1. Employee submits leave → 2. balance/overlap validation → 3. `pending`; email to approvers (HR/dept_head); audit dual-entry → 4. dept_head/HR approves (cannot self-approve) → 5. `approved`; email to employee; in-app → 6. attendance auto-marked `on_leave`; balance `taken` increases → 7. dashboard pending-leave KPI updates (cache invalidated) → 8. next **payroll run** generates unpaid-leave/sick-half-pay deductions from approved leave → 9. payslip reflects deduction. **Final:** paid leave deducted from balance; unpaid leave deducted from salary.

### 4.3 Payroll Run-to-Payslip
1. HR creates draft for month → 2. readiness check (blockers/warnings) → 3. Process → adjustments sync (leave+loans+manual) → earnings resolve → payslips build (pro-rata) → 4. async (BullMQ) or sync → 5. `approved`; period **locked** → 6. per-employee payslip email; per-payslip audit; WS `payroll:completed` → 7. dashboard cost KPIs update → 8. HR downloads **WPS SIF** → submits to bank → marks `wps_submitted` → 9. compliance WPS rate updates. **Final:** employees see payslips in My Payslips; WPS compliant.

### 4.4 Visa Lifecycle + Expiry Alerting
1. HR/PRO creates visa (duplicate-non-terminal guard) → 2. advances steps 1→8 (atomic with costs); status transitions; dual-entry audit → 3. `active` with expiry date → 4. daily expiry worker hits 90/60/30/14/7d → in-app (escalating) + email to HR+PRO → 5. compliance visa-validity + dashboard active-visa KPI reflect status. **Final:** visa tracked end-to-end; stakeholders alerted before expiry. ⚠️ no alert on manual step advance.

### 4.5 Document Verify-to-Employee-Sync
1. Employee/HR uploads document → `under_review` → 2. HR verifies → 3. mapped fields (passport/EID/visa/labour-card number+expiry) **sync to employee record** in same transaction → 4. employee in-app + `documentVerifiedEmail` → 5. compliance completeness updates → 6. expiry worker later alerts on the synced expiry. **Final:** verified document drives employee compliance + future expiry alerts. (Reject path → warning + re-upload.)

### 4.6 Offboard-to-Settlement
1. HR creates exit (settlement calculated: gratuity+leave encash+unpaid−deductions) → clearance items instantiated → 2. clearances completed/waived; required interview answered → 3. HR approves (or `override`) → employee → `terminated`; in-app to employee → 4. settlement-paid → `completed`; in-app → 5. settlement export. **Final:** employee offboarded; settlement recorded. ⚠️ asset return is manual; clearance changes not audited.

### 4.7 Subscription Upgrade + Quota Enforcement
1. At quota, employee create/import → **402 QUOTA_EXCEEDED** → 2. HR initiates Stripe checkout → 3. webhook activates plan + new quota + expiry → invoice email → 4. employee creation now allowed → 5. expiry worker reminds at 7d/1d. **Final:** capacity raised. ⚠️ on expiry, no auto-downgrade.

---

## 5. Dependency Map (Change-Impact)

| When this changes… | …these are affected |
|---|---|
| **Employee created/archived** | headcount KPI + cache, org chart, compliance (emiratisation/visa), subscription quota usage; archive does NOT auto: remove team memberships, cancel travel, exclude from in-flight payroll |
| **Employee salary / salary-components** | next payroll run earnings; gratuity/settlement; payroll cost KPI (salary revision is audit-only — does NOT change live pay until employee row updated) |
| **Employee department/manager** | dept_head scope, org chart, team auto-exit, leave approver routing, reports |
| **Leave approved** | attendance `on_leave`, balance `taken`, payroll deduction, calendar, pending-leave KPI |
| **Loan approved/active** | payroll loan deduction, outstanding-loans KPI |
| **Document verified** | employee passport/EID/visa/labour-card fields, compliance completeness, expiry worker inputs |
| **Visa status/expiry** | compliance visa-validity, active-visa KPI, calendar, expiry alerts |
| **Payroll run completed** | payslips, payslip emails, compliance WPS rate, cost KPIs, period lock |
| **Candidate converted** | new employee, onboarding checklist (9 steps), headcount |
| **Onboarding 100%** | employee status → active |
| **Exit approved** | employee status → terminated; settlement; (assets manual) |
| **Tenant notifications kill-switch** | suppresses ALL operational emails + in-app (transactional emails still send) |
| **Subscription quota** | gates employee create/import (402) |
| **Connected App scopes/secret** | external API access (⚠️ scopes not enforced) |
| **Privacy policy** | dashboard widgets, directory visibility, export masking |
| **Public holiday** | leave working-day calc, attendance calendar |

---

## 6. Event-Trigger Matrix

| Action | Processes triggered | Records updated | In-app notif | Email | Audit | Activity timeline | Reports/Dashboard |
|---|---|---|---|---|---|---|---|
| Login | isActive check | login_history | — | — | login/failed_login | — | Login History |
| Employee create | quota check, number gen | employees | — | (invite only) | employee:create | employee | headcount KPI(+cache) |
| Employee archive | — | employees | — | — | employee:delete | employee | headcount KPI(+cache) |
| Transfer | — | employee_transfers, employees | employee | — | dual create+update | employee | org chart |
| Leave submit | balance/overlap check | leave_requests | approvers | leaveNotification | dual create | employee | pending KPI |
| Leave approve | attendance upsert, balance | leave_requests, attendance, leave_balances | employee | decision email | dual approve | employee | pending KPI(+cache) |
| Payroll run | adjustments sync, payslips | payroll_runs, payslips, adjustments | per employee | payslip email | run + per-payslip | employee | cost KPIs(+cache), WPS |
| Loan approve | — | employee_loans | employee | — | loan approve | employee | outstanding loans |
| Visa advance | atomic step+costs | visa_applications, visa_costs, history | employee | — | dual approve + cost | employee | active-visa KPI(+cache) |
| Visa expiry (worker) | daily threshold scan | notifications | HR+PRO | visaExpiry email | — | — | — |
| Document verify | employee field sync | documents, employees | employee | verified email | dual approve + docs-audit | employee | compliance |
| Document expiry (worker) | daily scan | documents, notifications | HR+PRO | docExpiry email | — | — | compliance |
| Candidate apply (public) | tenant resolve, resume S3 | job_applications | WS + in-app to HR | applicant + HR alert | application:create (public) | — | recruitment KPIs |
| Convert candidate | checklist create | employees, job_applications, onboarding | employee | — | dual update+create | employee | headcount, recruitment |
| Onboarding 100% | status promotion | employees | employee (welcome) | — | step submit | employee | onboarding analytics |
| Exit approve | clearance check, status | exit_requests, employees | employee | workflow-dependent | dual approve | employee | settlement |
| Complaint submit | SLA calc | complaints | in-app to HR | HR alert email | create | — | complaint stats |
| Asset assign | availability check | assets, asset_assignments | employee | — | dual create | employee | asset summary |
| Subscription webhook | plan activate | tenants, subscription_events | — | invoice email | subscription_events (⚠️ not activity_logs) | — | quota usage |
| Member invite | token gen | tenant_memberships | — | invite email | tenant:invite | — | — |

---

## 7. Master QA Validation Template (apply per feature)

For **every** feature, complete these 12 dimensions:

- ☐ **Functional** — the action does what it should; happy path + variations.
- ☐ **Workflow** — all status transitions, illegal transitions blocked, approval/escalation/override paths.
- ☐ **Notification** — correct in-app type/title/message/actionUrl to the correct recipients only.
- ☐ **Email** — correct template/recipient/subject; kill-switch suppresses operational (not transactional); no duplicates beyond expected.
- ☐ **Permission** — each role's allowed/denied actions enforced on API (403) and UI; dept_head scope; cross-tenant isolation (403/404).
- ☐ **Audit** — expected `activity_logs` row(s), correct action/entityType, masked sensitive diffs, dual-entry where applicable.
- ☐ **Activity Timeline** — employee Updates feed mirrors the event where applicable.
- ☐ **Reporting** — relevant reports/exports reflect the change; privacy masking on export.
- ☐ **Dashboard** — KPIs/widgets update; cache invalidation (`dashboard:kpis:{tenantId}`) where driving actions occur.
- ☐ **Integration** — downstream modules update per the Dependency Map (§5).
- ☐ **Edge Case** — boundary/invalid inputs, duplicates, concurrency, empty datasets, idempotency.
- ☐ **Performance** — pagination, bulk operations, worker thresholds, async paths, cache TTLs.

---

## 8. Known Limitations & Testing Risks

This section lists current **open** limitations only (resolved items are documented as normal behavior in the relevant module sections, §2.6 email catalog, and §2.7 workers table).

### 8.1 Security — open items
- **No password-complexity policy** — any 8+ char password is accepted.
- **Rate limiting is IP-based only** — no per-authenticated-user throttle.
- **Complaint anonymity is best-effort** — descriptions are encrypted at rest, but a super_admin could still correlate `actor`+timestamps; true anonymity would require submission with no actor link.

### 8.2 Workflow / automation — open items
- Interview scheduling has **no calendar integration or double-booking conflict detection**.
- Onboarding **upload-token expiry reminder** not sent (the overdue worker marks steps overdue but doesn't notify).
- Exit **clearance-overdue** has no escalation worker.
- Assets: **no overdue-return alerts**, and no auto asset-return / travel-cancel on employee exit.
- Performance review status is **not state-machine-guarded** (any transition accepted).
- Bulk employee import is **all-or-nothing** (no partial success).
- Employees support **archive ↔ restore** via the Active/Archived/All status filter, protected-user rules (self, last active super_admin), and dependency validation (block vs warn-and-continue). See `Archive_Lifecycle_Audit_Report` for the system-wide rollout to other modules.

### 8.3 Audit / data-integrity — open items
- Subscription events live only in `subscription_events` (not mirrored into the Audit Log UI).
- Audit masking covers `changes` but not arbitrary `metadata`.
- Audit retention tiers (hot/warm/cold) are not implemented — `activity_logs` grows unbounded.
- Reporting-manager cycle is guarded client-side only (server subtree capped at 50 levels).
- Tenant week-off vs shift week-off can diverge between the leave and attendance views.
- Onboarding upload limit (10 MB) differs from resume upload limit (5 MB).
- Travel soft-delete doesn't cascade to its expenses. (Employee dependents/notes/warnings are now soft-deleted — policy: no hard-deletes of business data.)

### 8.4 Top Testing Risks (prioritize)
1. **Cross-tenant isolation** on every list/detail/mutation (highest impact).
2. **dept_head server-side scope** across employees/leave/performance/attendance.
3. **Payroll correctness:** leave/loan deductions, pro-rata, gratuity boundaries, period lock, re-run prevention, async failure recovery.
4. **Subscription quota** at the create/import boundary (402) including expired-plan behavior.
5. **Expiry/SLA workers** at each threshold (notification escalation + email send/suppress + daily dedup).
6. **Notification kill-switch** (operational suppressed, transactional still sent).
7. The security items in §8.1.

---

*Living source of truth — keep current as features change. Code references are pointers to locate behavior; testers validate behavior, not code.*

