# HRHub.ae - Software Requirements Specification

> Multi-Tenant SaaS HR & PRO Management Platform  
> Domain: hrhub.ae  
> Version 1.0 | April 2026 | CONFIDENTIAL

## Supported Industries

Real Estate • Travel & Tourism • Construction • Trading • Healthcare • Hospitality • Education • Retail

---

## 1. Executive Summary

HRHub.ae is a multi-tenant SaaS platform purpose-built for UAE-based firms across all free zones and mainland jurisdictions. It automates the full employee lifecycle — from recruitment and onboarding through visa processing, payroll (WPS), document management, and termination — while ensuring strict compliance with UAE Federal Labour Law (Federal Decree-Law No. 33 of 2021), MOHRE regulations, GDRFA requirements, and free-zone-specific rules.

### 1.1 Business Objectives

- Eliminate manual PRO processes and reduce visa processing time by 60%
- Ensure 100% compliance with UAE labour law including gratuity, leave, and WPS
- Provide a single platform for HR + PRO eliminating spreadsheet-based tracking
- Support 10+ industries with configurable workflows and document templates
- Enable multi-entity management (mainland + free zone companies under one account)

### 1.2 Technology Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| Frontend | React 18 + TypeScript | Vite build, SPA with code splitting |
| Styling | Tailwind CSS 3 | Custom design system, RTL support for Arabic |
| Backend API | Fastify 4 + TypeScript | REST API, JSON Schema validation |
| Database | PostgreSQL 16 | Row-level security for multi-tenancy |
| Cache / Queue | Redis 7 + BullMQ | Job queues for visa status polling |
| File Storage | AWS S3 / MinIO | Encrypted document storage with versioning |
| Auth | JWT + Refresh Tokens | RBAC with tenant isolation |
| Notifications | Firebase + SendGrid | Push, email, SMS (Twilio) |
| Deployment | Docker + Kubernetes | Auto-scaling, blue-green deployments |
| CI/CD | GitHub Actions | Automated testing, linting, deployment |

---

## 2. System Architecture

### 2.1 Multi-Tenancy Model

The system uses a **shared-database, shared-schema multi-tenancy** approach with PostgreSQL Row-Level Security (RLS). Every table includes a `tenant_id` column, and RLS policies ensure complete data isolation between tenants at the database level.

- **Tenant Context**: Set via `SET app.current_tenant` on each DB connection from the connection pool
- **RLS Policies**: Automatically filter all SELECT, INSERT, UPDATE, DELETE by `tenant_id`
- **Tenant Onboarding**: Automated provisioning via admin API — creates tenant record, seeds industry config, and provisions S3 bucket prefix
- **Data Backup**: Per-tenant logical backups using `pg_dump` with tenant_id filter

### 2.2 High-Level Architecture

| Layer | Components | Responsibility |
|-------|------------|----------------|
| Presentation | React SPA, Mobile PWA | UI rendering, form validation, offline support |
| API Gateway | Fastify + Rate Limiter | Auth, routing, request validation, tenant resolution |
| Business Logic | Service Layer (TypeScript) | Workflow orchestration, business rules, compliance checks |
| Integration | Adapter Layer | MOHRE, GDRFA, WPS, ICP portal connectors |
| Data | PostgreSQL + Redis + S3 | Persistence, caching, file storage |
| Infrastructure | K8s + Docker + CDN | Scaling, load balancing, static asset delivery |

### 2.3 Database Schema Overview

| Entity | Key Fields | Relations |
|--------|------------|-----------|
| tenants | id, name, trade_license_no, jurisdiction, industry_type, subscription_plan | has_many: employees, entities, users |
| entities | id, tenant_id, entity_name, license_type, free_zone_id | belongs_to: tenant; has_many: employees |
| employees | id, tenant_id, entity_id, passport_no, emirates_id, nationality, status | belongs_to: entity; has_many: visas, documents, payslips |
| visa_applications | id, employee_id, visa_type, status, mohre_ref, gdrfa_ref, expiry_date | belongs_to: employee; has_many: documents |
| documents | id, employee_id, doc_type, s3_key, expiry_date, verified_at | belongs_to: employee |
| payroll_runs | id, tenant_id, month, year, wps_file_ref, status | belongs_to: tenant; has_many: payslips |
| recruitment_jobs | id, tenant_id, title, department, status, industry_category | belongs_to: tenant; has_many: applications |
| onboarding_checklists | id, employee_id, template_id, progress_pct, due_date | belongs_to: employee |

---

## 3. Phase 1 — Recruitment & Onboarding (Weeks 1–12)

Phase 1 establishes the core platform infrastructure, authentication, tenant management, and the complete recruitment-to-onboarding pipeline.

### 3.1 Authentication & Tenant Management

| Feature | Description | API Endpoint |
|---------|-------------|--------------|
| Tenant Registration | Company signup with trade license upload, jurisdiction selection, industry type | `POST /api/v1/tenants` |
| User Authentication | Email/password login with JWT + refresh token rotation | `POST /api/v1/auth/login` |
| Role-Based Access | Roles: Super Admin, HR Manager, PRO Officer, Department Head, Employee Self-Service | `GET /api/v1/auth/me` |
| Multi-Entity Support | Add subsidiary companies (mainland + free zone) under one tenant | `POST /api/v1/entities` |
| SSO Integration | SAML 2.0 / OAuth 2.0 for enterprise clients | `GET /api/v1/auth/sso/:provider` |
| Two-Factor Auth | TOTP-based 2FA for admin and PRO roles | `POST /api/v1/auth/2fa/verify` |
| Audit Logging | Every action logged with user, timestamp, IP, and tenant context | `GET /api/v1/audit-logs` |

### 3.2 Recruitment Module

#### 3.2.1 Job Requisition & Posting

- Create job requisitions with approval workflow (Dept Head → HR Manager → Finance for budget approval)
- Industry-specific job templates:
  - **Real estate**: broker, property consultant, facilities manager
  - **Travel**: tour guide, travel consultant, ticketing agent
  - **Construction**: site engineer, safety officer, foreman
- Auto-generate MOHRE-compliant job offer templates based on job category and skill level
- Multi-channel posting: company careers page, LinkedIn, Bayt.com, GulfTalent, Indeed ME
- Quota tracking: Monitor Emiratisation targets per industry (e.g., 2% annual increase for private sector firms with 50+ employees)

#### 3.2.2 Applicant Tracking System (ATS)

| Stage | Features | Automation |
|-------|----------|------------|
| Application Received | Resume parsing, duplicate detection, nationality tracking | Auto-reject if missing mandatory fields |
| Screening | Skill matrix scoring, experience matching, qualification verification | Auto-score based on weighted criteria |
| Interview | Schedule via calendar integration, video interview link generation, scorecard templates | Automated reminders to interviewers |
| Assessment | Technical tests, personality assessments, reference check tracking | Auto-send assessment links |
| Offer | Generate MOHRE-compliant offer letter, salary benchmarking by role + industry | Auto-calculate gratuity projections |
| Pre-boarding | Document collection (passport, photos, degrees), medical fitness coordination | Checklist auto-creation on offer acceptance |

#### 3.2.3 Emiratisation Compliance

- Dashboard showing current Emiratisation ratio vs. MOHRE target per entity
- Auto-flag non-compliant entities and calculate projected penalties (AED 1,000/month per missing Emirati in 2025, increasing annually)
- Track Nafis programme registrations and wage subsidies for Emirati hires
- Generate MOHRE Emiratisation reports (quarterly submission)

### 3.3 Onboarding Module

#### 3.3.1 Onboarding Workflow Engine

A configurable, multi-step onboarding engine that adapts to industry, entity jurisdiction, and employee nationality. Each step can have dependencies, deadlines, and assigned owners.

| Step | Owner | SLA | Documents Required |
|------|-------|-----|-------------------|
| Offer Acceptance | HR Manager | 3 days | Signed offer letter, passport copy, photos |
| Medical Fitness Test | PRO Officer | 5 days | Medical fitness certificate (DHA/HAAD/MOH) |
| Emirates ID Application | PRO Officer | 7 days | Passport, entry permit, medical certificate |
| Labour Card Application | PRO Officer | 5 days | MOHRE application, company trade license |
| Bank Account Opening | Employee | 7 days | Passport, Emirates ID, salary certificate |
| Insurance Enrolment | HR Manager | 3 days | Employee details, dependant information |
| IT Provisioning | IT Admin | 2 days | Email, system access, hardware assignment |
| Orientation & Training | Dept Head | 5 days | Training schedule, handbook acknowledgement |
| Probation Setup | HR Manager | 1 day | Probation period (max 6 months per UAE law), review dates |

#### 3.3.2 Employee Self-Service Portal

- Mobile-first portal for new joiners to upload documents, fill personal info, and track onboarding progress
- Digital signature for employment contracts (UAE Electronic Transactions Law compliant)
- Multilingual support: English and Arabic (RTL layout) as primary; Hindi, Urdu, Filipino, Bengali configurable
- Push notifications for pending tasks and upcoming deadlines

### 3.4 Phase 1 — Frontend Screens

| Screen | Route | Key Components |
|--------|-------|----------------|
| Login / Register | `/auth/*` | Login form, tenant registration wizard, 2FA input |
| Dashboard | `/dashboard` | KPI cards, onboarding funnel, pending tasks, alerts |
| Job Requisitions | `/recruitment/jobs` | Job list, filters by status/dept, create/edit modal |
| Applicant Pipeline | `/recruitment/pipeline` | Kanban board (drag-drop stages), candidate cards |
| Candidate Profile | `/recruitment/candidates/:id` | Tabs: profile, resume, interviews, assessments, notes |
| Offer Management | `/recruitment/offers` | Offer letter generator, approval workflow status |
| Onboarding Tracker | `/onboarding` | Employee checklist view, progress bars, SLA alerts |
| Employee Profile | `/employees/:id` | Master profile: personal, employment, visa, documents tabs |
| Settings | `/settings/*` | Tenant config, roles, workflows, industry templates, integrations |

### 3.5 Phase 1 — API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/jobs` | Create job requisition |
| GET | `/api/v1/jobs?status=open&dept=sales` | List jobs with filters |
| POST | `/api/v1/jobs/:id/applications` | Submit application |
| PATCH | `/api/v1/applications/:id/stage` | Move applicant to next stage |
| POST | `/api/v1/offers` | Generate offer letter |
| POST | `/api/v1/employees` | Create employee record (on offer accept) |
| GET | `/api/v1/employees/:id/onboarding` | Get onboarding checklist |
| PATCH | `/api/v1/onboarding/:id/steps/:stepId` | Complete onboarding step |
| GET | `/api/v1/emiratisation/dashboard` | Emiratisation compliance metrics |
| POST | `/api/v1/documents/upload` | Upload employee document to S3 |

---

## 4. Phase 2 — Visa & Document Processing (Weeks 13–24)

Phase 2 builds the core PRO functionality — automating the visa lifecycle, government portal integrations, and document management with expiry tracking.

### 4.1 Visa Processing Module

#### 4.1.1 Visa Types Supported

| Visa Type | Duration | Key Requirements | Processing Authority |
|-----------|----------|------------------|---------------------|
| Employment Visa (New) | 2–3 years | Job offer, medical fitness, Emirates ID | MOHRE + GDRFA |
| Employment Visa (Renewal) | 2–3 years | Valid labour card, medical, EID renewal | MOHRE + GDRFA |
| Mission Visa | 90 days | Invitation letter, company guarantee | GDRFA |
| Visit Visa (Tourist) | 30/60/90 days | Passport copy, sponsor details | GDRFA / ICP |
| Investor / Partner Visa | 2–3 years | MOA, trade license, share certificate | GDRFA |
| Dependant Visa | 1–2 years | Sponsor salary (AED 4,000+), tenancy contract | GDRFA |
| Golden Visa | 5/10 years | Category-specific (investor, skilled worker, etc.) | ICP / GDRFA |
| Freelancer Visa | 1–2 years | Freelance permit, portfolio | Free zone authority |
| Visa Cancellation | N/A | Final settlement, NOC, exit or status change | MOHRE + GDRFA |

#### 4.1.2 Visa Workflow Engine

Each visa type follows a configurable state-machine workflow. Example for a new employment visa:

1. **Step 1 — Entry Permit Application**: Submit to MOHRE with job offer, passport copy, company documents. Track MOHRE reference number.
2. **Step 2 — Entry Permit Approval**: Poll MOHRE portal for status. Auto-notify PRO on approval/rejection.
3. **Step 3 — Employee Entry to UAE**: Record entry date, update status. Trigger 60-day residency window countdown.
4. **Step 4 — Medical Fitness Test**: Book appointment, upload certificate. Track DHA/HAAD/MOH based on emirate.
5. **Step 5 — Emirates ID Biometrics**: Schedule ICP appointment, track status via ICP portal.
6. **Step 6 — Visa Stamping**: Submit to GDRFA, track stamping status, upload stamped passport page.
7. **Step 7 — Labour Card Issuance**: MOHRE labour card application, link to WPS registration.
8. **Step 8 — Completion**: All documents collected, employee status set to Active. Start probation timer.

#### 4.1.3 Government Portal Integration

| Portal | Integration Type | Functions |
|--------|------------------|-----------|
| MOHRE (Tasheel) | API / RPA fallback | Labour card application, renewal, cancellation, complaint tracking |
| GDRFA (e-Channels) | API / RPA fallback | Entry permit, residence visa, visa cancellation, status enquiry |
| ICP (Federal Authority) | API | Emirates ID application, biometrics scheduling, status tracking |
| ILOE (Insurance) | API | Health insurance verification, policy linking |
| Amer Centre | Manual with tracking | Typing services, document attestation tracking |
| Free Zone Portals | Per-zone connector | JAFZA, DAFZA, DMCC, RAKEZ, ADGM, DIFC portals |

### 4.2 Document Management System

#### 4.2.1 Document Types & Lifecycle

| Document Category | Examples | Expiry Tracking | Renewal Alert |
|-------------------|----------|-----------------|---------------|
| Identity | Passport, Emirates ID, National ID | Yes — auto-read from scan | 90, 60, 30 days before |
| Visa / Immigration | Entry permit, residence visa, labour card | Yes | 90, 60, 30 days before |
| Company | Trade license, establishment card, MOA/AOA | Yes | 120, 90, 60 days before |
| Employment | Offer letter, contract, salary certificate, NOC | Contract end date | 90 days before |
| Insurance | Health insurance card, motor insurance | Yes | 60, 30 days before |
| Qualification | Degree certificates, professional licenses (RERA, DHA) | Varies | Per certification body |
| Financial | Bank letters, salary slips, WPS receipts | Monthly | N/A |
| Compliance | MOHRE reports, Emiratisation certificates | Quarterly/Annual | 30 days before due |

#### 4.2.2 Smart Document Features

- **OCR Extraction**: Auto-extract data from passport scans (MRZ reading), Emirates ID, trade licenses. Populate employee records automatically.
- **Document Verification**: Cross-check passport numbers, EID numbers with visa records. Flag mismatches.
- **Digital Vault**: AES-256 encrypted storage on S3. Per-tenant bucket prefixes. Access controlled by RBAC.
- **Version History**: Full audit trail of document uploads, replacements, and who accessed them.
- **Bulk Operations**: Mass upload and categorize documents (e.g., upload 50 passport scans, auto-match to employees by name/passport number).
- **Template Engine**: Generate offer letters, salary certificates, NOCs, experience letters from templates with auto-filled employee data.

### 4.3 Phase 2 — Frontend Screens

| Screen | Route | Key Components |
|--------|-------|----------------|
| Visa Dashboard | `/visa` | Status overview cards, pipeline by type, expiry calendar |
| New Visa Application | `/visa/apply` | Multi-step wizard: employee selection, visa type, document upload |
| Visa Tracker | `/visa/:id` | Timeline view, current step, required documents, government refs |
| Document Centre | `/documents` | Grid/list view, filters by type/status/expiry, bulk upload |
| Document Viewer | `/documents/:id` | Preview, metadata, version history, share/download |
| Expiry Calendar | `/documents/calendar` | Calendar view of all expiring documents, colour-coded by urgency |
| Template Manager | `/settings/templates` | CRUD for document templates, variable mapping, preview |
| Government Portal Status | `/integrations/status` | Live status of all portal connections, last sync times |

---

## 5. Phase 3 — Payroll & WPS (Weeks 25–36)

### 5.1 Payroll Engine

A fully compliant payroll engine that calculates salaries per UAE Labour Law, generates WPS-compliant SIF files, and handles industry-specific allowance structures.

#### 5.1.1 Salary Structure

| Component | Description | UAE Law Reference |
|-----------|-------------|-------------------|
| Basic Salary | Core salary, must be specified in employment contract | Art. 22, Federal Decree-Law 33/2021 |
| Housing Allowance | Typically 30–50% of basic; taxable in some free zones | Contractual |
| Transport Allowance | Fixed monthly or company vehicle | Contractual |
| Other Allowances | Phone, education, furniture — industry configurable | Contractual |
| Overtime | 125% (normal), 150% (night 10pm–4am); max 2hrs/day | Art. 19, Decree-Law 33/2021 |
| Commission | Real estate (% of deal), Travel (booking incentive), Trading (sales target) | Contractual |
| Deductions | Absence, late, loan repayment, damage recovery (max 5 days/month) | Art. 25, Decree-Law 33/2021 |
| Gratuity Provision | 21 days basic/year (first 5 years), 30 days/year after | Art. 51, Decree-Law 33/2021 |

#### 5.1.2 WPS (Wage Protection System) Integration

- Generate SIF (Salary Information File) in MOHRE-mandated format: EDR, SIF header, employee records with bank routing codes
- Validate SIF against MOHRE rules: salary matches labour card, bank account active, no duplicate payments
- Submit SIF to WPS agent bank via secure file transfer (or bank portal API where available)
- Track WPS return file: process rejections, flag discrepancies, generate correction SIF
- Monthly WPS compliance report: percentage of employees paid on time, discrepancy log
- Support for cash-paid workers (construction, retail): generate separate SIF with cash payment agent codes

#### 5.1.3 Leave & Attendance Integration

| Leave Type | Entitlement | Payroll Impact |
|------------|-------------|----------------|
| Annual Leave | 30 calendar days/year (after 1 year service) | Full pay, calculated on basic + allowances |
| Sick Leave | 90 days: 15 full pay, 30 half pay, 45 unpaid | Deduction calculated automatically |
| Maternity | 60 days: 45 full pay, 15 half pay | Full pay portion auto-calculated |
| Paternity | 5 working days (within 6 months of birth) | Full pay |
| Hajj Leave | 30 days unpaid (once during service) | Unpaid — salary deduction |
| Compassionate | 3–5 days per occurrence | Full pay |
| Public Holidays | Per UAE official calendar (10–15 days/year) | Paid; double pay if worked |

### 5.2 Phase 3 — Frontend Screens

| Screen | Route | Key Components |
|--------|-------|----------------|
| Payroll Dashboard | `/payroll` | Run payroll wizard, history, WPS status, cost breakdown charts |
| Salary Setup | `/payroll/structures` | Define salary components per entity/industry, bulk assignment |
| Payroll Run | `/payroll/run` | Multi-step: select period, review calculations, approve, generate SIF |
| Payslip View | `/payroll/slips/:id` | Detailed payslip with YTD, downloadable PDF |
| WPS Tracker | `/payroll/wps` | SIF submission log, bank return status, correction queue |
| Leave Management | `/leave` | Apply/approve leave, balance tracker, calendar view |
| Attendance | `/attendance` | Time tracking integration, overtime calculator |
| Gratuity Calculator | `/payroll/gratuity` | Per-employee gratuity projection, bulk end-of-service calculation |

---

## 6. Phase 4 — HR Core & Employee Management (Weeks 37–48)

### 6.1 Employee Lifecycle Management

- Comprehensive employee master record: personal details, employment history, compensation, visa status, documents, performance, training
- Organisation chart: auto-generated from reporting structure, drag-and-drop reorganisation
- Department and cost-centre management with budget tracking
- Employee transfer: inter-entity, inter-department with document and visa impact analysis
- Probation management: automated review reminders (at 3 and 6 months), confirmation workflow

### 6.2 Termination & Exit Management

#### 6.2.1 Termination Types (UAE Law Compliant)

| Type | Notice Period | Gratuity | Key Actions |
|------|---------------|----------|-------------|
| Resignation (Probation) | 14 days (or per contract) | None if <1 year | Visa cancellation, exit or transfer |
| Resignation (Post-probation) | 30–90 days per contract | Full entitlement | Notice period tracking, handover checklist |
| Termination by Employer | 30–90 days per contract | Full entitlement | Disciplinary record, legal review flag |
| Termination (Art. 44 — Gross Misconduct) | Immediate | Forfeited per law | Investigation record, MOHRE notification |
| Contract Expiry (Non-renewal) | Per contract terms | Full entitlement | Auto-alert 90 days before, renewal or exit |
| Mutual Agreement | As agreed | Full entitlement | Settlement agreement template |
| Absconding | Immediate | Forfeited | MOHRE absconding report, visa cancellation |

#### 6.2.2 Final Settlement Calculation

- **Gratuity calculation**: 21 days basic salary per year for first 5 years, 30 days per year thereafter. Pro-rated for partial years. Capped at 2 years total salary.
- **Leave encashment**: Unused annual leave balance paid out at basic salary rate.
- **Notice period settlement**: Payment in lieu of notice if applicable.
- **Deductions**: Outstanding loans, company property, traffic fines, housing advance recovery.
- **Salary for worked days** in final month.
- **Repatriation ticket**: Economy class to home country (employer obligation under UAE law).
- Generate final settlement statement, clearance form, and experience letter.

#### 6.2.3 Exit Workflow

1. **Step 1 — Initiate**: Record resignation/termination, calculate notice period, notify stakeholders.
2. **Step 2 — Handover**: Task assignment, knowledge transfer checklist, access revocation schedule.
3. **Step 3 — Final Settlement**: Auto-calculate gratuity + leave + deductions. Manager approval.
4. **Step 4 — Visa Cancellation**: Trigger visa cancellation workflow (MOHRE + GDRFA), track status.
5. **Step 5 — Asset Recovery**: IT equipment, access cards, vehicle, company property checklist.
6. **Step 6 — Documentation**: Generate experience letter, salary certificate, clearance letter.
7. **Step 7 — Final Payment**: Process through payroll, WPS payment for final settlement.
8. **Step 8 — Archive**: Employee record archived, documents retained per UAE data retention requirements (minimum 2 years).

### 6.3 Performance & Compliance

- Annual performance review cycles with configurable rating scales and competency frameworks
- Goal setting and OKR tracking per department
- Training management: track certifications required per industry (RERA for real estate agents, ATOL for travel, DHA for healthcare)
- Disciplinary action tracking: verbal warning, written warning, final warning, termination — with UAE law Article references
- Grievance and complaint management: Internal resolution workflow, MOHRE complaint pre-check

### 6.4 Phase 4 — Frontend Screens

| Screen | Route | Key Components |
|--------|-------|----------------|
| Employee Directory | `/employees` | Searchable grid, filters (status, dept, nationality, visa expiry) |
| Employee Profile | `/employees/:id` | 6 tabs: personal, employment, visa, documents, payroll, performance |
| Org Chart | `/organisation` | Interactive tree, drag-and-drop, print/export |
| Termination Wizard | `/exit/:id` | Multi-step: reason, settlement calc, checklist, approval |
| Final Settlement | `/exit/:id/settlement` | Detailed breakdown, edit deductions, generate PDF |
| Performance Reviews | `/performance` | Review cycles, employee scorecards, analytics |
| Training Tracker | `/training` | Certification tracking, expiry alerts, course enrolment |
| Compliance Dashboard | `/compliance` | Labour law compliance score, pending renewals, risk alerts |

---

## 7. Industry-Specific Configurations

Each industry has unique regulatory requirements, document types, job categories, and compliance rules. The platform uses a configuration-driven approach where industry modules are enabled per tenant.

| Industry | Regulatory Body | Key Configurations | Unique Documents |
|----------|-----------------|-------------------|------------------|
| Real Estate | RERA / DLD | Broker registration tracking, commission structures, RERA exam compliance | RERA card, broker permit, Ejari certificates |
| Travel & Tourism | DTCM / ATDD / MOE | IATA accreditation, tour guide licensing, seasonal staffing | DTCM permit, IATA certificate, tour guide licence |
| Construction | Municipality / Trakhees | Safety certification (NEBOSH/IOSH), site allocation, labour camp management | Safety certificates, site passes, camp inspection reports |
| Trading | DED / Free Zone | Import/export licensing, customs broker certification | Trade licence categories, customs broker card |
| Healthcare | DHA / HAAD / MOH | Medical practitioner licensing, privilege renewal, CME tracking | DHA licence, medical malpractice insurance |
| Hospitality | DTCM / Municipality | Food handler permits, hotel classification staff ratios | Food handler card, hygiene certificates |
| Education | KHDA / ADEK / MOE | Teacher licensing, background check (police clearance), academic credential attestation | Teaching licence, attested degrees, police clearance |
| Retail | DED / Municipality | Store manager permits, product knowledge certifications | Municipality permits, product handling certificates |

---

## 8. Non-Functional Requirements

### 8.1 Performance

| Metric | Target | Measurement |
|--------|--------|-------------|
| API Response Time (P95) | < 200ms | Datadog APM |
| Page Load Time (LCP) | < 1.5 seconds | Lighthouse CI |
| Concurrent Users per Tenant | 500+ | Load testing (k6) |
| Database Query Time (P95) | < 50ms | Query monitoring |
| File Upload (10MB) | < 3 seconds | S3 direct upload with presigned URLs |
| Search (full-text) | < 500ms | PostgreSQL tsvector or Elasticsearch |
| WPS SIF Generation (1000 employees) | < 30 seconds | Background job |

### 8.2 Security

- **Data Encryption**: AES-256 at rest (S3, database), TLS 1.3 in transit
- **Authentication**: JWT with short-lived access tokens (15 min) and secure refresh token rotation
- **Authorisation**: RBAC with row-level security in PostgreSQL. API-level permission checks
- **Data Residency**: UAE-hosted infrastructure (AWS me-south-1 Bahrain or Azure UAE North)
- **PII Protection**: Passport numbers, Emirates IDs encrypted at field level. Masked in logs
- **Audit Trail**: Immutable audit log of all data access and modifications
- **Penetration Testing**: Quarterly third-party penetration testing
- **Compliance**: UAE Data Protection Law (Federal Decree-Law No. 45 of 2021), PDPL readiness

### 8.3 Scalability & Availability

- 99.9% uptime SLA for production environment
- Horizontal auto-scaling: Kubernetes HPA based on CPU/memory/request rate
- Database: Primary-replica setup with read replicas for reporting queries
- CDN: CloudFront/Cloudflare for static assets and React bundle delivery
- Zero-downtime deployments: Blue-green deployment strategy
- Disaster Recovery: RPO < 1 hour, RTO < 4 hours. Cross-region backup to UAE secondary

### 8.4 Internationalisation

- Primary languages: English (LTR) and Arabic (RTL) with full Tailwind RTL support
- Secondary languages: Hindi, Urdu, Filipino, Bengali (configurable per tenant)
- Date formats: Gregorian and Hijri calendar support
- Currency: AED primary with multi-currency display for international comparisons
- Right-to-left layout: Tailwind CSS RTL plugin with mirrored components

---

## 9. Project Timeline & Milestones

| Phase | Duration | Key Deliverables | Exit Criteria |
|-------|----------|------------------|---------------|
| Phase 1: Recruitment & Onboarding | Weeks 1–12 | Auth, tenant management, ATS, onboarding workflows, employee profiles | End-to-end hiring flow functional, 3 industry templates |
| Phase 2: Visa & Documents | Weeks 13–24 | Visa workflow engine, MOHRE/GDRFA connectors, document vault, OCR, expiry alerts | New employment visa processed end-to-end, document OCR 90% accurate |
| Phase 3: Payroll & WPS | Weeks 25–36 | Payroll engine, WPS SIF generation, leave management, gratuity calculator | SIF file generated and validated, payslips accurate for 3 salary structures |
| Phase 4: HR Core & Exit | Weeks 37–48 | Full employee lifecycle, termination workflows, performance, compliance dashboards | Final settlement calculation verified against manual, all exit steps tracked |
| Phase 5: Polish & Launch | Weeks 49–52 | UAT, performance tuning, security audit, documentation, production deployment | Load test passed, penetration test passed, user acceptance signed off |

### 9.1 Team Structure

| Role | Count | Responsibility |
|------|-------|----------------|
| Product Owner | 1 | Requirements, stakeholder communication, backlog prioritisation |
| Tech Lead / Architect | 1 | Architecture decisions, code reviews, technical standards |
| Senior Frontend (React) | 2 | UI components, design system, state management, RTL support |
| Senior Backend (Fastify) | 2 | API development, database design, integration layer |
| Mid-Level Full Stack | 2 | Feature development across stack, testing |
| PRO / Domain Expert | 1 | UAE visa/labour law expertise, workflow validation, government portal knowledge |
| QA Engineer | 1 | Test automation, regression, UAT coordination |
| DevOps / SRE | 1 | CI/CD, infrastructure, monitoring, security |
| UI/UX Designer | 1 | Design system, user research, Arabic/RTL design |

---

## 10. Appendices

### 10.1 UAE Labour Law Quick Reference

| Topic | Regulation | System Implementation |
|-------|------------|----------------------|
| Employment Contract | Must be written, Arabic + English, registered with MOHRE | Contract template engine with dual-language output |
| Probation Period | Max 6 months, 14 days notice during probation | Auto-set probation end date, review reminders |
| Working Hours | 8 hrs/day, 48 hrs/week; Ramadan reduced to 6 hrs | Attendance module with Ramadan auto-adjustment |
| Overtime | Max 2 hrs/day, 125% regular, 150% night (10pm–4am) | Auto-calculate in payroll, cap enforcement |
| Annual Leave | 30 calendar days after 1 year; 2 days/month if < 1 year | Leave balance engine with accrual rules |
| Sick Leave | 90 days: 15 full, 30 half, 45 unpaid; medical certificate required | Auto-deduction engine, certificate upload |
| Gratuity | 21 days/year (1–5 years), 30 days/year (5+ years), cap 2 years salary | Gratuity calculator with projection |
| Non-Compete | Max 2 years, must specify geography and activities | Contract clause template, compliance flag |
| Termination Notice | Min 30 days (or per contract, max 90 days) | Notice period tracker with countdown |
| WPS | All salaries via bank transfer, SIF file monthly | WPS SIF generator, bank integration |

### 10.2 React Component Library Plan

- **Design System**: Tailwind-based with CSS custom properties for theming. Dark mode support.
- **Core Components**: Button, Input, Select, DatePicker (Gregorian + Hijri), FileUpload, Modal, Toast, DataTable, Tabs, Stepper
- **Layout Components**: Sidebar, TopNav, Breadcrumb, PageHeader, ContentCard, StatCard
- **Domain Components**: EmployeeCard, VisaStatusBadge, DocumentTile, OnboardingProgress, PayslipCard, TimelineStep
- **Form Library**: React Hook Form with Zod validation schemas matching Fastify JSON Schema
- **State Management**: TanStack Query (server state) + Zustand (client state). No Redux.
- **Routing**: React Router v6 with lazy loading per module
- **Charts**: Recharts for dashboards (bar, line, pie, funnel charts)
- **Table**: TanStack Table with server-side pagination, sorting, filtering, and export (CSV/Excel)

### 10.3 Fastify API Standards

- Versioned API: `/api/v1/*` with content negotiation
- JSON Schema validation on all request bodies and query parameters (Fastify built-in)
- Consistent error responses: `{ statusCode, error, message, details }` format
- Pagination: cursor-based for lists (`limit`, `cursor`, `hasMore`)
- Rate limiting: 100 req/min for standard endpoints, 10 req/min for auth endpoints
- Request logging: structured JSON logs with correlation IDs (pino logger)
- Health check: `GET /health` with database, Redis, and S3 connectivity status
- OpenAPI/Swagger: Auto-generated from Fastify schemas, available at `/docs`
- WebSocket: For real-time notifications and visa status updates (Fastify WebSocket plugin)

### 10.4 Glossary

| Term | Definition |
|------|------------|
| MOHRE | Ministry of Human Resources and Emiratisation — federal body governing labour |
| GDRFA | General Directorate of Residency and Foreigners Affairs — manages residency visas |
| ICP | Federal Authority for Identity, Citizenship, Customs & Port Security — issues Emirates ID |
| WPS | Wage Protection System — MOHRE mandated salary payment tracking system |
| SIF | Salary Information File — standardised file format for WPS submissions |
| RERA | Real Estate Regulatory Agency — regulates real estate professionals in Dubai |
| DHA | Dubai Health Authority — healthcare licensing and medical fitness |
| DTCM | Department of Tourism and Commerce Marketing — tourism licensing in Dubai |
| Tasheel | MOHRE service centre for labour and immigration transactions |
| Amer | GDRFA service centre for residency and visa typing services |
| PRO | Public Relations Officer — handles government relations and visa processing |
| Emiratisation | UAE policy requiring private sector companies to hire UAE nationals |
| Nafis | Federal programme supporting Emiratisation with subsidies and incentives |
| Ejari | Online tenancy contract registration system in Dubai |
| RLS | Row-Level Security — PostgreSQL feature for data isolation |

---

## AI Engine Phase Creation Summary

### Phase 1: Recruitment & Onboarding (Weeks 1-12)
**Focus**: Core infrastructure, authentication, tenant management, recruitment pipeline, onboarding workflows
**Key Deliverables**: Auth system, RBAC, ATS, job requisitions, Emiratisation tracking, onboarding checklists, employee profiles
**Tech Components**: JWT auth, PostgreSQL RLS, React SPA foundation, initial API endpoints

### Phase 2: Visa & Document Processing (Weeks 13-24)
**Focus**: PRO functionality, visa lifecycle automation, government portal integrations, document management
**Key Deliverables**: Visa workflow engine, MOHRE/GDRFA connectors, OCR extraction, document vault, expiry alerts
**Tech Components**: State machine workflows, external API integrations, S3 storage, background job processing

### Phase 3: Payroll & WPS (Weeks 25-36)
**Focus**: Payroll calculation, WPS compliance, leave management, gratuity calculations
**Key Deliverables**: Salary structure engine, SIF file generation, leave/attendance integration, WPS submission tracking
**Tech Components**: Complex calculation engine, file generation, bank integrations, reporting

### Phase 4: HR Core & Exit Management (Weeks 37-48)
**Focus**: Complete employee lifecycle, termination workflows, performance management, compliance dashboards
**Key Deliverables**: Exit workflow, final settlement calculator, performance reviews, training tracker, org chart
**Tech Components**: Workflow orchestration, document generation, analytics dashboards

### Phase 5: Polish & Launch (Weeks 49-52)
**Focus**: UAT, performance optimization, security hardening, documentation, production deployment
**Key Deliverables**: Load tested system, security audit completion, user documentation, production environment
**Tech Components**: Performance tuning, monitoring setup, CI/CD finalization
