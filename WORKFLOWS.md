# HRHub UAE — Workflows & Operational Guide

Last updated: 1 May 2026

This document defines the operational workflows that HRHub supports.
Use it as the source of truth when explaining the product to a new admin, HR
manager, employee, or auditor.

---

## Contents

1. [Roles & Permissions](#1-roles--permissions)
2. [Organisational Structure](#2-organisational-structure)
3. [Employee Lifecycle](#3-employee-lifecycle)
4. [Onboarding Workflow](#4-onboarding-workflow)
5. [Visa Workflow](#5-visa-workflow)
6. [Leave Management](#6-leave-management)
7. [Payroll & WPS](#7-payroll--wps)
8. [Attendance](#8-attendance)
9. [Performance Reviews](#9-performance-reviews)
10. [Recruitment Pipeline](#10-recruitment-pipeline)
11. [Exit & Offboarding](#11-exit--offboarding)
12. [Documents & Compliance](#12-documents--compliance)
13. [Complaints / Grievance Workflow](#13-complaints--grievance-workflow)
14. [Audit Trail](#14-audit-trail)
15. [Subscription & Billing](#15-subscription--billing)
16. [Appendix — Glossary](#appendix--glossary)

---

## 1. Roles & Permissions

The system uses a fixed, string-based role list stored on `users.role`. Roles map
directly to backend `requireRole(...)` guards — they are not free-form.

| Role | Code | Purpose |
|---|---|---|
| Super Admin | `super_admin` | Tenant config, billing, user provisioning, all access |
| HR Manager | `hr_manager` | Full HR access: approvals, payroll, complaints, org settings |
| PRO Officer | `pro_officer` | UAE-specific: visa, documents, compliance, government PRO work |
| Department Head | `dept_head` | Approves leave/attendance for their department only |
| Employee | `employee` | Self-service: own profile, leave requests, payslips, complaints |

> **UAE note:** The `pro_officer` role covers what some systems call "Recruiter" or
> "Auditor." In UAE HR practice the Public Relations Officer (PRO) handles visa
> applications, MOHRE filings, and document compliance. This role has no access
> to payroll or workspace admin.

### Role enforcement

- **Backend:** every protected route declares `preHandler: [fastify.authenticate, fastify.requireRole(...)]`
- **Frontend:** `canAccessRoute(role, routeKey)` and `hasPermission(role, permission)` in `lib/permissions.ts` gate UI and route access
- **Audit:** every role-gated mutation writes `actor_role` to `activity_logs`

### Managing users

1. **Invite:** Org Settings → Members → *Invite user* → enter email + select role → system sends invitation email; user sets password on first login.
2. **Change role:** Org Settings → Members → click user → change Role dropdown → save. The change is logged. The user must log out and back in for the new JWT role to take effect.
3. **Deactivate:** Members → toggle Active. The Redis `isActive` cache (5 min TTL) enforces the change without a full re-deploy.
4. **Link to employee record:** `users.employeeId` FK — links the account to an `employees` row so the same person has both a payroll record and a login. Employees without a login (e.g. blue-collar staff) still appear in the HR system.

---

## 2. Organisational Structure

Three-level hierarchy: **Branch → Division → Department**, stored in `org_units`.

- **Tenant** (`tenants`) — the company. All rows are scoped by `tenantId`.
- **Org Units** (`org_units`) — `type` ∈ `{branch, division, department}`. Managed in Org Settings → Org Structure. Rendered on the Org Chart page.
- **Reporting line** (`employees.managerId` self-FK) — one manager per employee. Org Chart → Reporting Lines builds the tree recursively.
- **Teams** (`teams`) — cross-functional groupings independent of the org hierarchy. Managed in Org Settings → Org Structure.
- **Designations** (`designations`) — job titles / grades. Managed in Org Settings → Designations.
- **Department (legacy)** (`employees.department` string) — still used for display and report aggregations. Keep in sync with the `org_units` department name.

### Setting up

1. Org Settings → Org Structure → create branches → divisions under each branch → departments under each division.
2. Org Settings → Designations → create job titles.
3. Employee records → assign `department`, `designation`, and `managerId`.

---

## 3. Employee Lifecycle

### States

```
active  →  on_leave  →  active
active  →  terminated
active  →  probation  →  active     (after onboarding completes)
```

### Creating an employee

1. Employees → *Add Employee* (or bulk import via CSV template).
2. Required fields: first name, last name, email, department, designation, start date.
3. Optional: passport, visa expiry, contract end date, salary, bank IBAN.
4. System assigns an auto-generated `employeeNo` (e.g. `EMP-0001`).
5. Audit: `action='create', entityType='employee'`.

### Bulk CSV import

1. Employees → Import → download the CSV template.
2. Fill rows (one employee per row).
3. Upload → server validates all rows, returns errors if any row fails.
4. On success, all employees are created in a single DB transaction.

### Org Chart

- **Structure tab:** Three-level org unit hierarchy with counts.
- **Reporting Lines tab:** Tree rendered from `managerId` FK (`GET /employees/org-chart`).

---

## 4. Onboarding Workflow

Onboarding is a guided checklist attached to each new hire, persisted in `onboarding_checklists` + `onboarding_steps`.

### Triggering onboarding

- **From recruitment:** when a candidate's application status is set to `hired`, an onboarding checklist is auto-created for that employee.
- **Manual:** Onboarding → *New Checklist* → select employee.

### Steps (9 template steps per checklist)

| # | Step | Owner |
|---|---|---|
| 1 | Document collection | HR Admin |
| 2 | Visa initiation | PRO Officer |
| 3 | IT setup / account creation | IT / HR Admin |
| 4 | Asset assignment | HR Admin |
| 5 | Welcome email | HR Manager |
| 6 | First-day induction | HR Manager |
| 7 | Probation check-in | Manager |
| 8 | Benefits enrollment | HR Admin |
| 9 | Probation review | HR Manager |

### Step completion

- `PATCH /onboarding/:checklistId/steps/:stepId` with `{ status: 'completed' }`.
- When **all** steps reach `completed`, the employee status automatically flips `probation → active` (`onboarding.service.ts:updateStep`).
- Overdue steps (past `dueDate`) are marked `overdue` nightly by the `onboarding-overdue` BullMQ worker.

### Employee self-service

Employees can view their own checklist at Onboarding (sidebar) and upload required documents directly against checklist steps.

---

## 5. Visa Workflow

Eight steps, one button per step. Each click advances `visa_applications.currentStep` and writes an audit entry. The button label names the step you are about to mark complete; the next step is shown beneath it.

```
1. Entry Permit Application
2. Entry Permit Approval
3. Employee Entry to UAE
4. Medical Fitness Test
5. Emirates ID Biometrics
6. Visa Stamping          ← extra inline actions appear here
7. Labour Card Issuance
8. Completion
```

### Stamping-stage actions

While `status = 'stamping'`, the visa detail page shows three extra actions:
- **Upload stamped passport page** → opens Documents module pre-filtered for this employee + category = visa.
- **Record stamping reference** → prompts for MOHRE/GDRFA reference; writes to `visa_applications.mohreRef` / `gdfraRef`.
- **Schedule stamping appointment** → creates a calendar event N days out (surfaces on the Calendar page).

### Cost tracking

Each application can have multiple cost line items (`visa_costs`) with currency, amount, and receipt URL. The PRO report aggregates these per employee and exports as CSV.

### Cancelling

*Cancel Application* is always visible on non-completed visas. Cancellation:
1. Prompts for a reason.
2. Sets `status = 'cancelled'`.
3. Writes an audit entry with the reason.
4. Irreversible — a new application must be opened.

### Expiry alerts

The `visa-expiry` BullMQ worker runs daily at 06:00 UAE time. It fires in-app notifications and emails to HR managers and PRO officers at 90, 60, 30, 14, and 7 days before expiry.

---

## 6. Leave Management

### Leave policies

Configured in Org Settings → Leave Settings. Each policy defines:
- Leave type (annual, sick, maternity, unpaid, etc.)
- Accrual rules (annual days, carry-over cap)
- Approval requirement

### Leave request lifecycle

```
draft → submitted → approved → active
                 → rejected
```

1. Employee submits leave request (Leave → *Request Leave*) with start/end dates + type.
2. Department Head or HR Manager approves / rejects.
3. On approval, `leave_balances` is decremented.
4. Attendance records for approved leave days are auto-marked `on_leave`.

### Self-service

Employees view their own balance and history at My Leave (`/my/leave`).

### Public holidays

Org Settings → Leave Settings → Holidays. HR adds a holiday calendar; leave requests that fall on holidays are flagged automatically.

---

## 7. Payroll & WPS

### Payroll run lifecycle

```
draft → processing → completed → wps_submitted
```

1. HR Manager creates a payroll run for a month/year (`POST /payroll`).
2. *Run Payroll* button triggers `POST /payroll/:id/run`:
   - If Redis available: enqueues a BullMQ job and returns `202 { jobId, status: 'processing' }`.
   - If Redis unavailable: runs synchronously, returns the completed run immediately.
3. The worker calculates gross = basic + housing + transport + other allowances, then applies deductions (leave without pay, advances).
4. Payslips are generated per active employee and stored in `payslips`.
5. HR downloads payslips as PDF per employee or exports the full WPS SIF file.

### WPS SIF export

`GET /payroll/:id/wps-sif` returns a plain-text Salary Information File (UAE Wages Protection System format) as `attachment; filename="wps-YYYY-MM.txt"`. After submitting to the bank, HR clicks *Mark WPS Submitted* → run status becomes `wps_submitted`.

### Payslip PDF

`GET /payroll/payslips/:payslipId/download` returns a generated PDF with company letterhead, employee details, full breakdown (basic, allowances, deductions, net), bank info, and the pay period.

### Gratuity calculator

`GET /payroll/gratuity-calc?basicSalary=X&yearsOfService=Y` returns the EOSB (end-of-service benefit) per UAE Labour Law — available to HR managers and PRO officers for ad-hoc calculations.

---

## 8. Attendance

### Input channels

1. **Web punch** — employee clicks *Punch In / Out* on the Attendance page; geolocation + IP are captured.
2. **Manual entry** — HR enters or edits attendance records directly.
3. **CSV import** — HR uploads bulk attendance records via the CSV import template.
4. **External punch** — `POST /attendance/external-punch` allows programmatic integration (e.g. biometric bridge scripts); requires `hr_manager` or `super_admin` role.

### Record statuses

- `present` — checked in within shift + grace period
- `late` — checked in after `shiftStart + graceMinutes`
- `absent` — no check-in record
- `on_leave` — approved leave covers the day
- `holiday` — public holiday

### Reports

The Attendance page shows a monthly grid view per employee and summary statistics. CSV export available.

---

## 9. Performance Reviews

### Review cycle

1. HR Manager creates a review cycle (name, period, deadline).
2. Assigns reviewers to employees.
3. Reviewers submit ratings and comments for each employee.
4. HR exports results as CSV or PDF.

### Ratings

Each review has an overall rating (1–5) plus free-text comments. Historical reviews are soft-deleted (not purged) so trends can be tracked.

---

## 10. Recruitment Pipeline

### Pipeline stages (configurable per posting)

```
applied → screening → interview → offer → hired
                                        → rejected
```

### Workflow

1. HR creates a job posting (`recruitments` table) with title, department, and open count.
2. Candidates are added (or apply via a link) — `candidates` table.
3. HR drags candidates across Kanban columns (stage changes call `PATCH /recruitment/candidates/:id`).
4. Interviews are scheduled (`interviews` table) with date, type (technical/hr/final), and interviewer.
5. When a candidate is marked `hired`, the system can auto-create an onboarding checklist for that employee.
6. Resume files are stored in S3 and accessible via `GET /recruitment/candidates/:id/resume`.

---

## 11. Exit & Offboarding

### Exit request lifecycle

```
pending → approved → completed
        → rejected
```

1. HR initiates an exit request for an employee (`POST /exit`) with exit date, reason, and handover assignee.
2. Department Head or HR Manager approves.
3. On approval, settlement is calculated (gratuity, outstanding leave, deductions) per UAE Labour Law.
4. Employee status is set to `terminated` and `isActive` deactivated.
5. The exit record stores final settlement amount, handover notes, and NSSF/EOBI reference.

### Settlement calculation

- **Gratuity (EOSB):** 21 days basic salary per year for the first 5 years; 30 days per year thereafter.
- **Outstanding leave:** unpaid balance converted to cash at daily rate.
- **Deductions:** advances, asset damages.

---

## 12. Documents & Compliance

### Document upload

1. Employee or HR uploads a file via the Documents page.
2. The frontend requests a presigned S3 URL (`POST /documents/presign`), uploads directly to S3, then registers the document (`POST /documents`) with the returned `s3Key`.
3. Documents have a category (passport, visa, certificate, contract, etc.) and an optional expiry date.

### Expiry tracking

Documents with an `expiryDate` are monitored by the `document-expiry` BullMQ worker:
- Status set to `expiring_soon` at 30 days remaining.
- Status set to `expired` once past expiry date.
- In-app notifications + emails sent at 90, 60, and 30 days before expiry.

### Bulk archive

HR can select multiple documents and bulk-archive them (with a confirmation dialog).

### Compliance dashboard

The Compliance page shows:
- **Emiratisation:** current Emirati headcount vs. MOHRE-mandated quota by department.
- **Expiry alerts:** employees with visa, passport, or document expiring soon, grouped by urgency.

### Passport & contract expiry alerts

- **Passport:** alerts at 180, 90, and 30 days (in-app + email).
- **Contract:** alerts at 90 and 30 days (in-app notification).

---

## 13. Complaints / Grievance Workflow

Complaints are confidential employee-to-HR submissions, stored in `complaints`.

### Lifecycle

```
draft → submitted → under_review → resolved
                        ↓
                    escalated → resolved
```

### Roles & visibility

| Action | Who |
|---|---|
| Create draft | Any authenticated user |
| Submit | Original author |
| Read | `hr_manager`, `super_admin`, the author |
| Acknowledge | `hr_manager`, `super_admin` |
| Escalate | `hr_manager` → `super_admin` |
| Close / Resolve | `hr_manager`, `super_admin` (with resolution notes) |

### Required fields on submit

- Category: `harassment | pay_dispute | leave_dispute | working_conditions | discrimination | other`
- Severity: `low | medium | high | critical`
- Description (free text)
- Optional: linked employee (the subject), confidentiality flag (`anonymous | named | confidential`)

### SLA

| Severity | Resolution target |
|---|---|
| critical | 5 working days (~7 calendar days) |
| high | 10 working days (~14 calendar days) |
| medium | 15 working days (~21 calendar days) |
| low | 30 working days (~42 calendar days) |

`slaDeadline` is set on submission. The HR queue shows overdue complaints in red.

### UI surfaces

- **Employee:** My Complaints (`/my/complaints`) — list own complaints, create draft, submit.
- **HR queue:** Complaints page — KPI strip (Total / Open / Critical / Overdue), filterable table, detail dialog with Acknowledge / Escalate / Resolve actions.

---

## 14. Audit Trail

Every mutating action writes a row to `activity_logs`:

| Column | Notes |
|---|---|
| `actorName` | Denormalised at write time so deleted users still display |
| `actorRole` | Role at the time of the action |
| `action` | create / update / delete / approve / reject / submit / view / export / import / login / logout |
| `entityType` | employee / leave / payroll / visa / document / complaint / … |
| `changes` | `{ field: { from, to } }` JSON diff for update actions |
| `ipAddress` | Request IP |
| `userAgent` | Request UA |

### UI features

- KPI strip: total events, created, updated, unique actors.
- Filters: search, entity type, action, date range (Today / 7 days / 30 days / All time).
- Grouped by day with sticky day headers.
- Per-row diff view (strikethrough → green) for `update` actions.
- CSV export of filtered view.
- Infinite scroll (30 per page).

### Login history

A separate *Login History* page (`/misc/login-history`) shows all auth events for the tenant's users with IP, UA, and timestamp.

---

## 15. Subscription & Billing

### Plans

| Plan | Price | Employee limit |
|---|---|---|
| Starter | Free | 5 employees |
| Professional | AED 200 / 5 employees / month | Scales with headcount |
| Enterprise | Custom | Unlimited |

### Upgrade flow

1. Org Settings → Subscription → *Upgrade* button.
2. If `STRIPE_SECRET_KEY` is configured: redirects to Stripe Checkout for Professional plan.
3. If Stripe is not configured: shows an email-request form (fallback).
4. On successful payment, Stripe webhook (`POST /webhooks/stripe`) updates `subscriptions.plan` and `subscriptions.validUntil`.

### Billing history

Org Settings → Subscription → Billing History shows past invoices and payment events with download links.

### Expiry reminders

The `subscription-expiry` BullMQ worker sends email reminders to the tenant admin at 7 days and 1 day before subscription expiry.

---

## Appendix — Glossary

| Term | Definition |
|---|---|
| **Tenant** | A single customer company in the multi-tenant system |
| **MOHRE** | UAE Ministry of Human Resources and Emiratisation |
| **GDRFA** | General Directorate of Residency and Foreigners Affairs |
| **WPS** | Wages Protection System — UAE bank-routed payroll compliance framework |
| **SIF** | Salary Information File — WPS payroll submission format |
| **EOSB** | End-of-Service Benefit (gratuity) — UAE Labour Law mandated severance pay |
| **PRO** | Public Relations Officer — UAE company role handling government paperwork and visas |
| **NOC** | No-Objection Certificate |
| **Emiratisation** | UAE government quota mandating a minimum percentage of UAE nationals in private sector workforces |
| **Probation** | Employment status during first N months (UAE default 6 months, configurable per contract) |
| **Entry Permit** | First-stage UAE visa document allowing the employee to enter the country |
| **Visa Stamping** | Final step where the residency visa is physically stamped in the passport |
