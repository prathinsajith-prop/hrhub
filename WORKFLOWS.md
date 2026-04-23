# HR Hub UAE — Workflows & Operational Guide

Last updated: 23 April 2026

This document defines the operational workflows that the HR Hub system supports.
Use it as the source of truth when explaining the product to a new admin, HR
manager, employee, or auditor.

Contents:

1. [Roles & Permissions](#1-roles--permissions)
2. [Creating & Assigning Roles](#2-creating--assigning-roles)
3. [Organisational Structure](#3-organisational-structure)
4. [Employee Onboarding Workflow](#4-employee-onboarding-workflow)
5. [Visa Workflow](#5-visa-workflow)
6. [Complaints / Grievance Workflow](#6-complaints--grievance-workflow)
7. [Attendance & Punch-Device Integration](#7-attendance--punch-device-integration)
8. [Activity Log / Audit Trail](#8-activity-log--audit-trail)

---

## 1. Roles & Permissions

The system uses a fixed string-based role list stored on `users.role`.
Roles are *not* free-form — they map to backend role guards
(`fastify.requireRole(...)`).

| Role             | Code        drizzle-kit studio    | Purpose                                                  |
| ---------------- | --------------- | -------------------------------------------------------- |
| Super Admin      | `super_admin`   | Tenant configuration, billing, user provisioning         |
| HR Admin         | `hr_admin`      | Full HR module access, can create/edit users             |
| HR Manager       | `hr_manager`    | Approvals (leave, exit, performance), payroll edits      |
| Recruiter        | `recruiter`     | Recruitment module (jobs, candidates, interviews)        |
| Department Head  | `dept_head`     | Approves leave/attendance for their department only      |
| Employee         | `employee`      | Self-service: view own profile, request leave, payslips  |
| Auditor          | `auditor`       | Read-only access to audit/activity logs                  |

### Role enforcement

* **Backend**: every protected route declares
  `preHandler: [fastify.authenticate, fastify.requireRole(['hr_admin', 'hr_manager'])]`.
* **Frontend**: `useAuth()` exposes `user.role`. UI hides actions the user cannot perform.
* **Audit**: every role-gated action writes to `activity_logs.actor_role`.

> **Why no `roles` table?** The role list is small, stable, and tightly coupled
> to backend permission code. Exposing it as a free-form table would let an
> admin create a "role" the backend doesn't recognise, which would silently
> grant no permissions. If we ever need org-level custom roles, we'll introduce
> a `roles` table + a `role_permissions` join table; for now string roles are
> intentionally restricted.

---

## 2. Creating & Assigning Roles

### A. Inviting a new user with a role
1. Settings → **Users & Permissions** → *Invite user*
2. Enter email + select role from dropdown (the seven codes above).
3. System sends an invitation email; user sets their password on first login.
4. The role is recorded on `users.role` and copied to every audit row that user produces.

### B. Changing an existing user's role
1. Settings → **Users & Permissions** → click user
2. Change the *Role* dropdown → save
3. The change is logged: `activity_logs(action='update', entity_type='user', changes={role: {from, to}})`.
4. The user must log out and back in for the new role to take effect (JWT contains role claims).

### C. Linking a role to an employee record
* The `users.employee_id` foreign key links an account to an `employees` row
  (so the same person has both a payroll record and a login).
* Employees without a login (e.g. blue-collar staff) can still appear in the
  HR system; they just can't sign in.

---

## 3. Organisational Structure

Three concepts:

* **Tenant** (`tenants` table) — the company. All rows are scoped by `tenant_id`
  and protected by Postgres Row-Level Security (migration `0004_row_level_security.sql`).
* **Department** (`employees.department` string) — currently a free-form text
  field on each employee row (e.g. *Finance*, *Engineering*). The Reports
  module aggregates by this string.
* **Reporting line** (`employees.manager_id` self-FK) — each employee can have
  one manager. The Org Chart page (`GET /employees/org-chart`) builds a tree
  recursively from this column.

### Setting up a new department
1. Edit any employee → set their *Department* field to the new name.
2. The department string will now appear in:
   * Reports → Department breakdowns
   * Filters across Employees, Attendance, Leave, Documents
   * KPIs on the Dashboard

### Building the reporting line
1. Open employee A → **Edit** → set *Manager* to employee B.
2. The Org Chart page recomputes; A appears as a child of B.
3. Department Heads (`dept_head` role) automatically see only employees whose
   `manager_id` chain leads to them.

> **Future enhancement**: promote `department` to its own table with a `head_id`
> FK, allowing department managers to be configured independently of reporting
> lines. Tracked in `task-list.md`.

---

## 4. Employee Onboarding Workflow

Onboarding is a *guided checklist* attached to each new hire. The process has
five stages, persisted in the `onboarding` module.

### Stages

| # | Stage              | Owner          | Trigger                                                 |
| - | ------------------ | -------------- | ------------------------------------------------------- |
| 1 | Offer accepted     | Recruiter      | Candidate marks application status = *accepted*         |
| 2 | Document collection| HR Admin       | Auto-creates a checklist of required UAE documents      |
| 3 | Visa initiation    | HR Admin       | Creates a visa application (see §5)                     |
| 4 | First day          | HR Manager     | Welcome email, asset assignment, account creation       |
| 5 | Probation review   | Manager        | Auto-scheduled review N days after start                |

### Required documents (auto-checklist)

* Passport copy (with min 6 months validity)
* Photo (white background)
* Educational certificates (attested)
* Previous employment NOC (if applicable)
* Emirates ID copy (if already issued)
* Tenancy contract / Ejari (for spouse/dependent visa)

### Backend wiring

* `POST /onboarding` creates an onboarding record.
* `PATCH /onboarding/:id/advance` moves to the next stage and writes an audit
  entry; checklist items can be ticked individually.
* When stage 5 completes, the employee status flips from `probation` →
  `active`.

---

## 5. Visa Workflow

Eight steps, one button per step. Each click advances `visa_applications.current_step`
and writes an audit entry. The button label is dynamic — it always names the
step you are about to mark complete, with the next step shown beneath.

```
1. Entry Permit Application
2. Entry Permit Approval
3. Employee Entry to UAE
4. Medical Fitness Test
5. Emirates ID Biometrics
6. Visa Stamping          ← additional inline actions appear here
7. Labour Card Issuance
8. Completion
```

### Stamping-stage actions

While `status = 'stamping'`, the visa detail page shows three extra buttons
(visible *in addition to* "Mark step complete" and "Cancel"):

* **Upload stamped passport page** → opens Documents module pre-filtered for
  this employee + category=visa.
* **Record stamping reference** → prompts for the MOHRE/GDRFA reference and
  writes it to `visa_applications.mohre_ref` / `gdfr_ref`.
* **Schedule stamping appointment** → sets a calendar reminder N days out
  (surfaces in the Calendar page as an event).

### Cancelling

The *Cancel Application* button is intentionally always visible on
non-completed visas — UAE visa workflows often need to be aborted (e.g.
candidate withdrew, government rejection). Cancellation:

1. Prompts for a reason.
2. Sets `status = 'cancelled'`.
3. Writes an audit entry with the reason.
4. Cannot be reversed (a new application must be opened).

---

## 6. Complaints / Grievance Workflow

Complaints are confidential employee-to-HR submissions, separate from
performance and exit flows.

### Lifecycle

```
draft → submitted → under_review → resolved
                         ↓
                     escalated → resolved
```

### Roles & visibility

| Action          | Who can do it                                      |
| --------------- | -------------------------------------------------- |
| Create draft    | Any employee (against any subject)                 |
| Submit          | Original author                                    |
| Read            | HR Admin, HR Manager, the author, the named subject (optional, redacted) |
| Investigate     | Assigned HR Manager                                |
| Escalate        | HR Manager → Super Admin                           |
| Close/Resolve   | HR Manager (with resolution notes)                 |

### Required fields on submit

* Category: `harassment | pay_dispute | leave_dispute | working_conditions | discrimination | other`
* Severity: `low | medium | high | critical`
* Description (free text, encrypted at rest)
* Optional: linked employee (the subject), supporting documents
* Confidentiality flag: `anonymous | named | confidential`

### SLA

* Acknowledge within **2 working days** (auto-email on submit).
* First update within **5 working days**.
* Resolution target depends on severity:
  * critical → 5 working days
  * high → 10 working days
  * medium → 15 working days
  * low → 30 working days

### Audit

Every state change writes to `activity_logs` with `entity_type='complaint'`.
The change diff is encrypted alongside the description so auditors can verify
*that* something happened without seeing the substance.

### UI surface

* **Employee self-service**: *My Complaints* tile on the dashboard for
  employees with at least one complaint.
* **HR queue**: Settings → *Complaints* → list of open complaints with KPI
  strip (Total / Open / Critical / Overdue).
* **Detail page**: timeline view (similar to Visa detail) with the actions
  Acknowledge, Add note, Reassign, Escalate, Resolve.

> **Status**: backend module + UI page is on the task list. The data model and
> permission matrix above are the agreed spec — any future implementation must
> match it.

---

## 7. Attendance & Punch-Device Integration

The system supports three input channels for attendance:

1. **Web punch** — employees click *Punch in / out* on the Attendance page;
   geolocation + IP are captured.
2. **Mobile app** — same endpoints, with optional GPS coordinates.
3. **External biometric / RFID device** — pushes punches via a dedicated
   integration endpoint.

### External device integration

Devices **push** to the API on each scan. Devices do not poll.

* **Endpoint**: `POST /api/v1/attendance/device-punch`
* **Auth**: device-scoped API key (header `X-Device-Key`), one key per
  physical device. Keys are issued from Settings → *Devices*.
* **Payload** (JSON):

  ```json
  {
    "deviceId": "main-gate-01",
    "employeeRef": "EMP-1042",     // matches employees.employee_no
    "timestamp": "2026-04-23T08:02:14+04:00",
    "direction": "in",              // "in" | "out"
    "method": "fingerprint",        // fingerprint | face | rfid | pin
    "rawScore": 0.91                 // optional confidence score
  }
  ```

* **Server behaviour**:
  1. Verify `X-Device-Key` against `attendance_devices.api_key_hash`.
  2. Resolve `employeeRef` → `employees.id` within the device's tenant.
  3. Reject if the employee is on leave or has `status='inactive'`.
  4. Upsert into `attendance_records` for the date:
     * first push of the day with `direction='in'` sets `check_in`;
     * any later push with `direction='out'` updates `check_out` (last wins).
  5. Re-derive status:
     * `late` if `check_in > shift_start + grace_minutes`
     * `present` otherwise
  6. Write audit entry with `actor_role='device'` and the device ID.

### Supported device families

The integration is intentionally protocol-agnostic — any device that can make
HTTPS POST requests works. Tested gateways:

* **ZKTeco** (BioTime / Push SDK) — gateway script polls device, posts here.
* **Suprema BioStar 2** — webhook out of the box.
* **Hikvision / Dahua face terminals** — via their HTTP listener server.

For devices that only speak proprietary protocols, deploy the lightweight
*HR Hub Bridge* (Node.js) on-premise; it polls the device and pushes to this
endpoint.

### Failure modes

* Device offline → punches buffer locally on the device until reconnect.
* Duplicate timestamp → server deduplicates within a 60-second window.
* Unknown employee ref → row written to `device_punch_errors` for HR review.

> **Status**: `POST /attendance/device-punch` and the Devices admin UI are on
> the task list. Web/mobile punching is fully implemented today.

---

## 8. Activity Log / Audit Trail

Every mutating action writes a row to `activity_logs`:

| Column        | Notes                                                      |
| ------------- | ---------------------------------------------------------- |
| `id`          | UUID                                                       |
| `tenant_id`   | RLS-scoped                                                 |
| `actor_id`    | `users.id` (nullable for system / device actions)          |
| `actor_name`  | denormalised at write time so deleted users still display  |
| `actor_role`  | role at time of action                                     |
| `action`      | create / update / delete / approve / reject / submit / view / export / import / login / logout |
| `entity_type` | employee / leave / payroll / visa / document / …           |
| `entity_id`   | UUID of the affected row                                   |
| `entity_name` | denormalised name for display                              |
| `changes`     | `{field: {from, to}}` JSON diff                            |
| `ip_address`  | request IP                                                 |
| `user_agent`  | request UA                                                 |
| `created_at`  | timestamp                                                  |

### UI features (Activity Log page)

* KPI strip: total events, created, updated, unique actors.
* Filters: search box, entity dropdown, action dropdown, date-range chips
  (Today / 7 days / 30 days / All time).
* Grouped by day with sticky day headers.
* Per-row diff view (red strikethrough → green) for `update` actions.
* CSV export of the currently filtered view.
* Infinite scroll (page size 30).

### Retention

* **Hot**: latest 90 days in the primary table.
* **Warm**: 90 days – 2 years moved to a partitioned archive table nightly.
* **Cold**: > 2 years exported to S3 (Parquet) and dropped.
* **Never deleted**: login/logout/export rows (compliance requirement).

---

## Appendix A — Glossary

* **Tenant** — A single customer company in the multi-tenant system.
* **MOHRE** — UAE Ministry of Human Resources and Emiratisation.
* **GDRFA** — General Directorate of Residency and Foreigners Affairs.
* **WPS** — Wages Protection System (UAE bank-routed payroll).
* **NOC** — No-Objection Certificate.
* **SIF** — Salary Information File (WPS payroll format).
* **Probation** — Employment status during the first N months (configurable
  per contract; UAE default is 6 months).
