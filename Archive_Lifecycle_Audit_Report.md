# HRHub — Archive / Soft-Delete Lifecycle Audit & Standardization Report

> System-wide review of archive, unarchive, deactivate, soft-delete, and hard-delete behavior across every entity, with recommendations toward a consistent enterprise lifecycle framework.

---

## 1. Executive Summary

HRHub already uses **three** lifecycle mechanisms inconsistently:

- **`deletedAt` (timestamp soft-delete)** — recruitment, leave, loans, travel, complaints, documents, performance, visa costs, announcements, transfers, interviews, payroll adjustments, biometric mappings, recognitions.
- **`isActive` (boolean deactivate)** — org units, designations, grades, shifts, salary components, document templates, offboarding config, leave policies, connected apps (via `status`).
- **`isArchived` (boolean archive) + `status`** — employees only (now with full **archive ↔ restore**, protected-user rules, and dependency validation as the reference implementation).
- **Hard delete (row removed)** — employee dependents, notes, warnings, team members, attendance punches, notifications, onboarding steps/checklists.

**Goal state:** every *critical business record* supports `Active → Archived → Restored` (never a destructive `Active → Deleted`), behind separate permissions, with audit + activity tracking and restore-time validation — all through one reusable lifecycle service.

---

## 2. Recommended UX Pattern (decided)

Use a **3-way segmented status filter — `Active · Archived · All`** in each list toolbar (with per-segment counts), composing with existing search/filters. **Not** a separate "Archived" tab. Row/bulk actions are context-aware (Active → Archive; Archived → Restore). This is now implemented for Employees and is the template for every other module.

---

## 3. System-Wide Entity Audit

**Legend — Recommended:** `Archive` = needs Active/Archived/Restore; `Deactivate` = isActive is sufficient (config/reference data); `Keep soft` = deletedAt is fine; `Immutable` = should never be deleted (financial/audit); `Fix → soft` = currently hard-deleted, should be soft.

| Entity | Current strategy | Recommended | Restore today? | Dependency risks |
|---|---|---|---|---|
| **employees** | `isArchived` + status | **Archive** ✅ done | ✅ Yes | reports, org head, teams, loans, assets, visa |
| org_units (branch/division/dept) | `isActive` | Deactivate (+restore UI) | partial | employee FKs, child units, head |
| designations | `isActive` | Deactivate (+restore UI) | partial | employee.designation refs |
| grade_levels | `isActive` | Deactivate (+restore UI) | partial | employee grade refs |
| shifts | `isActive` | Deactivate (+restore UI) | partial | employee.shiftId |
| teams | `isActive` | Deactivate | partial | team_members |
| **team_members** | **hard delete** | Keep hard (link table) | n/a | — |
| salary_components | `isActive` + isSystem | Deactivate | partial | employee assignments, payroll |
| document_templates / versions | `isActive` | Deactivate | partial | generated documents |
| leave_policies | `deletedAt`/isActive | Deactivate | partial | balances, requests |
| recruitment_jobs | `deletedAt` | **Archive** (close vs archive) | restore = clear deletedAt | applications |
| job_applications | `deletedAt` | Keep soft | manual | candidate pipeline |
| referrals | `deletedAt` | Keep soft | manual | applications |
| recruitment_stages | `deletedAt`/order | Keep soft | n/a | applications on stage |
| documents | `deletedAt` | **Archive** | manual | employee field sync, expiry |
| performance_reviews | `deletedAt` | Keep soft (+restore) | manual | employee timeline |
| visa_costs | `deletedAt` | Keep soft | manual | visa application |
| employee_loans / loan_payments | `deletedAt` | Keep soft | manual | payroll deductions |
| travel_requests / expenses | `deletedAt` | Keep soft (cascade fix) | manual | ⚠️ soft-delete doesn't cascade to expenses |
| complaints | `deletedAt` (desc encrypted) | Keep soft | manual | SLA, confidentiality |
| announcements (+audiences/receipts) | `deletedAt` | Keep soft | manual | receipts |
| employee_transfers | `deletedAt` | Keep soft | n/a | audit history |
| interviews | `deletedAt` | Keep soft | manual | application |
| assets / asset_assignments / maintenance / categories | `deletedAt` | **Archive** (assets) | manual | assignments, employee |
| recognitions (+ all sub-tables) | `deletedAt` + isArchived | Already archive-capable | partial | points, recipients |
| biometric_id_mappings | `deletedAt` | Keep soft | manual | attendance import resolution |
| employee_dependents | `deletedAt` ✅ fixed | Keep soft | recoverable | visa/insurance data retained |
| employee_notes | `deletedAt` ✅ fixed | Keep soft | recoverable | HR record retained |
| employee_warnings | `deletedAt` ✅ fixed | Keep soft | recoverable | disciplinary record retained (compliance) |
| public_holidays | hard delete | Acceptable (config) | n/a | leave/attendance calc |
| payroll_runs / payslips | no delete (status) | **Immutable** | n/a | financial record |
| payroll_adjustments | `deletedAt` (manual rows) | Keep soft | manual | payroll math |
| attendance_records / punches | no delete | Immutable (correct) | n/a | payroll hours |
| activity_logs / login_history / document_audit_log | no delete | **Immutable** + retention tiers | n/a | compliance |
| notifications | hard delete | Acceptable (ephemeral) | n/a | — |
| onboarding_checklists / steps | hard delete | Consider soft | ❌ No | document links |
| exit_requests | status only | Keep (status lifecycle) | n/a | settlement |
| tenant_memberships | `isActive` + inviteStatus | Deactivate (correct) | ✅ re-invite | last super_admin guard |
| connected_apps | `status` revoked | Deactivate (correct) | ✅ reactivate | API keys |

### Highest-priority fixes (data-loss risks)
1. ✅ **employee_dependents, employee_notes, employee_warnings** — converted to soft-delete (`deleted_at`, migration `0077`), so disciplinary/insurance/HR records are now recoverable.
2. ⏳ **travel soft-delete** doesn't cascade to expenses → orphaned expense rows.
3. ⏳ **Reference data (org_units, designations, grades, shifts, salary_components)** has `isActive` but no **restore UI** — deactivation is currently one-way in the app.

**Standing policy (enforced going forward): every deletable business record is soft-deleted; nothing is hard-deleted** (except pure link tables, ephemeral notifications, and append-only audit/financial tables which are never deleted).

---

## 4. Architecture Recommendation — Unified Lifecycle Framework

Replace ad-hoc per-module logic with a small shared toolkit (the employee implementation is the reference):

1. **`lifecycle.service`** — generic `archive(entity, id, opts)` / `restore(entity, id)` that flips the table's lifecycle column (`isArchived` / `deletedAt` / `isActive`), writes the audit + activity entries, and invalidates caches.
2. **`assertArchivable(entity, id, actor)`** — protected-record rules (per entity); for users: self, last active super_admin/owner.
3. **`getArchiveDependencies(entity, id)`** — returns `{ type, count, blocking, message }[]`; the route maps `block` vs `warn-and-continue` from a `force` flag (employee implementation done).
4. **Audit/activity** — standard `recordActivity` with `metadata.kind:'lifecycle'`, `subKind: archive|restore`, `previousStatus`, `newStatus`, `forced`, `dependencies` (employee implementation done).
5. **List filter contract** — every list accepts `archived=active|archived|all`; default `active`; `lifecycle-counts` endpoint for the segmented control.
6. **Permissions** — separate `archive`, `restore`, `view_archived`, `force_delete` capabilities (today archive+restore share the HR/super_admin role guard; split when the permission matrix is extended).

---

## 5. Per-Module Rollout Plan (priority order)

| Phase | Modules | Action |
|---|---|---|
| ✅ Done | **Employees** | Archive/restore + segmented filter + protected rules + dependency validation + audit/activity |
| 1 | Assets, Recruitment jobs, Documents | Add Active/Archived/All filter + restore (deletedAt → restore clears it) |
| 2 | Org units, Designations, Grades, Shifts, Teams, Salary components | Add restore UI for `isActive` (deactivate ↔ reactivate) |
| 3 | employee_dependents, notes, warnings | Convert hard-delete → soft-delete (migration + restore) |
| 4 | Travel | Cascade soft-delete to expenses |
| 5 | Performance, Complaints, Loans, Announcements | Add restore UI on existing `deletedAt` |
| — | Payroll, Attendance, Audit logs | Leave immutable; add audit retention tiers only |

---

## 6. Validation Checklist (status)

- ☑ Archived employees reachable via status **filter** (Active/Archived/All) — not a tab
- ☑ Employee restore works (single, bulk, row-menu)
- ☑ Protected users cannot be archived (self, last active super_admin/owner)
- ☑ Logged-in user cannot archive self
- ☑ Dependency checks work (block vs warn-and-continue via `force`)
- ☑ Reports/dashboard exclude archived from active counts (server defaults to active)
- ☑ Audit logs created (archive/restore with previous/new status, reason metadata)
- ☑ Activity timeline updated (employee `kind:'lifecycle'`)
- ☑ Permissions enforced (HR/super_admin; separate archive vs restore = future split)
- ☑ No hard delete added for critical data (and existing hard-deletes flagged in §3)
- ☑ Archived records hidden from active views (default `archived=active`)
- ☑ Search supports archived records (`All`/`Archived` scopes compose with search)
- ☑ Soft-delete usage reviewed across entire project (§3)
- ☑ Missing archive functionality identified (§3 "Recommended" column)
- ◻ Consistent lifecycle across ALL modules — Employees done; phases 1–5 pending

---

*This report is the standardization roadmap. Employees is the implemented reference; remaining modules follow the same pattern through the rollout plan.*
