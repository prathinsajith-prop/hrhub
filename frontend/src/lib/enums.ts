/**
 * Centralised enum → human-readable label map.
 *
 * Usage:
 *   import { labelFor, ROLE_LABELS, LEAVE_TYPE_LABELS } from '@/lib/enums'
 *
 *   labelFor('hr_manager')       // → "HR Manager"
 *   labelFor('wps_submitted')    // → "WPS Submitted"
 *   ROLE_LABELS.hr_manager       // → "HR Manager"
 *
 * `labelFor` falls back to title-casing the raw value when no mapping exists.
 */

// ─── Roles ─────────────────────────────────────────────────────────────────
export const ROLE_LABELS: Record<string, string> = {
    super_admin: 'Super Admin',
    hr_manager: 'HR Manager',
    pro_officer: 'PRO Officer',
    dept_head: 'Dept Head',
    employee: 'Employee',
}

// ─── Employee status ────────────────────────────────────────────────────────
export const EMPLOYEE_STATUS_LABELS: Record<string, string> = {
    active: 'Active',
    onboarding: 'Onboarding',
    probation: 'Probation',
    suspended: 'Suspended',
    terminated: 'Terminated',
    visa_expired: 'Visa Expired',
}

// ─── Visa status ────────────────────────────────────────────────────────────
export const VISA_STATUS_LABELS: Record<string, string> = {
    not_started: 'Not Started',
    entry_permit: 'Entry Permit',
    medical_pending: 'Medical Pending',
    eid_pending: 'EID Pending',
    stamping: 'Stamping',
    active: 'Active',
    expiring_soon: 'Expiring Soon',
    expired: 'Expired',
    cancelled: 'Cancelled',
}

// ─── Visa type (from visa applications) ─────────────────────────────────────
export const VISA_TYPE_LABELS: Record<string, string> = {
    employment_new: 'Employment (New)',
    employment_renewal: 'Employment Renewal',
    mission: 'Mission',
    visit: 'Visit',
    investor: 'Investor',
    dependant: 'Dependant',
    golden: 'Golden Visa',
    freelancer: 'Freelancer',
    cancellation: 'Cancellation',
    // From employee.visaType
    employment: 'Employment',
    dependent: 'Dependent',
}

// ─── Leave type ─────────────────────────────────────────────────────────────
export const LEAVE_TYPE_LABELS: Record<string, string> = {
    annual: 'Annual',
    sick: 'Sick',
    maternity: 'Maternity',
    paternity: 'Paternity',
    hajj: 'Hajj',
    compassionate: 'Compassionate',
    unpaid: 'Unpaid',
    public_holiday: 'Public Holiday',
}

// ─── Leave / common approval status ─────────────────────────────────────────
export const APPROVAL_STATUS_LABELS: Record<string, string> = {
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
}

// ─── Attendance status ───────────────────────────────────────────────────────
export const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
    present: 'Present',
    absent: 'Absent',
    half_day: 'Half Day',
    late: 'Late',
    wfh: 'WFH',
    on_leave: 'On Leave',
}

// ─── Document category ───────────────────────────────────────────────────────
export const DOC_CATEGORY_LABELS: Record<string, string> = {
    identity: 'Identity',
    visa: 'Visa',
    company: 'Company',
    employment: 'Employment',
    insurance: 'Insurance',
    qualification: 'Qualification',
    financial: 'Financial',
    compliance: 'Compliance',
}

// ─── Document status ─────────────────────────────────────────────────────────
export const DOC_STATUS_LABELS: Record<string, string> = {
    valid: 'Valid',
    expiring_soon: 'Expiring Soon',
    expired: 'Expired',
    pending_upload: 'Pending Upload',
    under_review: 'Under Review',
    rejected: 'Rejected',
}

// ─── Document lifecycle action ───────────────────────────────────────────────
export const DOC_ACTION_LABELS: Record<string, string> = {
    uploaded: 'Uploaded',
    viewed: 'Viewed',
    downloaded: 'Downloaded',
    verified: 'Verified',
    rejected: 'Rejected',
    deleted: 'Deleted',
    status_changed: 'Status Changed',
    metadata_updated: 'Metadata Updated',
}

// ─── Onboarding status ───────────────────────────────────────────────────────
export const ONBOARDING_STATUS_LABELS: Record<string, string> = {
    pending: 'Pending',
    in_progress: 'In Progress',
    completed: 'Completed',
    overdue: 'Overdue',
}

// ─── Asset status ────────────────────────────────────────────────────────────
export const ASSET_STATUS_LABELS: Record<string, string> = {
    available: 'Available',
    assigned: 'Assigned',
    maintenance: 'Maintenance',
    lost: 'Lost',
    retired: 'Retired',
}

// ─── Asset condition ─────────────────────────────────────────────────────────
export const ASSET_CONDITION_LABELS: Record<string, string> = {
    new: 'New',
    good: 'Good',
    damaged: 'Damaged',
}

// ─── Asset maintenance status ────────────────────────────────────────────────
export const MAINTENANCE_STATUS_LABELS: Record<string, string> = {
    open: 'Open',
    in_progress: 'In Progress',
    resolved: 'Resolved',
}

// ─── Asset assignment status ─────────────────────────────────────────────────
export const ASSIGNMENT_STATUS_LABELS: Record<string, string> = {
    assigned: 'Assigned',
    returned: 'Returned',
    lost: 'Lost',
}

// ─── Payroll status ──────────────────────────────────────────────────────────
export const PAYROLL_STATUS_LABELS: Record<string, string> = {
    draft: 'Draft',
    processing: 'Processing',
    approved: 'Approved',
    wps_submitted: 'WPS Submitted',
    paid: 'Paid',
    failed: 'Failed',
}

// ─── Performance status ──────────────────────────────────────────────────────
export const PERFORMANCE_STATUS_LABELS: Record<string, string> = {
    draft: 'Draft',
    submitted: 'Submitted',
    acknowledged: 'Acknowledged',
    completed: 'Completed',
}

// ─── Recruitment – job status ────────────────────────────────────────────────
export const JOB_STATUS_LABELS: Record<string, string> = {
    draft: 'Draft',
    open: 'Open',
    closed: 'Closed',
    on_hold: 'On Hold',
}

// ─── Recruitment – employment type ──────────────────────────────────────────
export const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
    full_time: 'Full Time',
    part_time: 'Part Time',
    contract: 'Contract',
}

// ─── Recruitment – application stage ────────────────────────────────────────
export const STAGE_LABELS: Record<string, string> = {
    received: 'Received',
    screening: 'Screening',
    interview: 'Interview',
    assessment: 'Assessment',
    offer: 'Offer',
    pre_boarding: 'Pre-boarding',
    rejected: 'Rejected',
}

// ─── Exit type ───────────────────────────────────────────────────────────────
export const EXIT_TYPE_LABELS: Record<string, string> = {
    resignation: 'Resignation',
    termination: 'Termination',
    contract_end: 'Contract End',
    retirement: 'Retirement',
}

// ─── Salary revision type ────────────────────────────────────────────────────
export const SALARY_REVISION_LABELS: Record<string, string> = {
    increment: 'Increment',
    decrement: 'Decrement',
    promotion: 'Promotion',
    annual_review: 'Annual Review',
    probation_completion: 'Probation Completion',
    correction: 'Correction',
}

// ─── Contract type ───────────────────────────────────────────────────────────
export const CONTRACT_TYPE_LABELS: Record<string, string> = {
    permanent: 'Permanent',
    contract: 'Contract',
    part_time: 'Part Time',
}

// ─── Payment method ──────────────────────────────────────────────────────────
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
    bank_transfer: 'Bank Transfer',
    cash: 'Cash',
    cheque: 'Cheque',
}

// ─── Marital status ──────────────────────────────────────────────────────────
export const MARITAL_STATUS_LABELS: Record<string, string> = {
    single: 'Single',
    married: 'Married',
    divorced: 'Divorced',
    widowed: 'Widowed',
}

// ─── Interview type ──────────────────────────────────────────────────────────
export const INTERVIEW_TYPE_LABELS: Record<string, string> = {
    video: 'Video',
    phone: 'Phone',
    in_person: 'In Person',
    technical: 'Technical',
}

// ─── Interview status ────────────────────────────────────────────────────────
export const INTERVIEW_STATUS_LABELS: Record<string, string> = {
    scheduled: 'Scheduled',
    completed: 'Completed',
    cancelled: 'Cancelled',
    no_show: 'No Show',
}

// ─── Auth / audit event type ─────────────────────────────────────────────────
export const AUTH_EVENT_LABELS: Record<string, string> = {
    login: 'Login',
    logout: 'Logout',
    failed_login: 'Failed Login',
    password_change: 'Password Change',
    password_reset: 'Password Reset',
    token_refresh: 'Token Refresh',
    '2fa_success': '2FA Success',
    '2fa_failed': '2FA Failed',
}

// ─── Audit action ────────────────────────────────────────────────────────────
export const AUDIT_ACTION_LABELS: Record<string, string> = {
    create: 'Create',
    update: 'Update',
    delete: 'Delete',
    view: 'View',
    approve: 'Approve',
    reject: 'Reject',
    submit: 'Submit',
    export: 'Export',
    import: 'Import',
    login: 'Login',
    logout: 'Logout',
}

// ─── Tenant jurisdiction ─────────────────────────────────────────────────────
export const JURISDICTION_LABELS: Record<string, string> = {
    mainland: 'Mainland',
    freezone: 'Free Zone',
}

// ─── Subscription plan ───────────────────────────────────────────────────────
export const PLAN_LABELS: Record<string, string> = {
    starter: 'Free',
    growth: 'Professional',
    enterprise: 'Enterprise',
}

// ─── Document template type ──────────────────────────────────────────────────
export const TEMPLATE_TYPE_LABELS: Record<string, string> = {
    offer_letter: 'Offer Letter',
    salary_certificate: 'Salary Certificate',
    noc_letter: 'NOC Letter',
    experience_letter: 'Experience Letter',
    warning_letter: 'Warning Letter',
    termination_letter: 'Termination Letter',
    custom: 'Custom',
}

// ─── Membership status ───────────────────────────────────────────────────────
export const MEMBERSHIP_STATUS_LABELS: Record<string, string> = {
    pending: 'Pending',
    accepted: 'Accepted',
    revoked: 'Revoked',
}

// ─── App status ──────────────────────────────────────────────────────────────
export const APP_STATUS_LABELS: Record<string, string> = {
    active: 'Active',
    revoked: 'Revoked',
}

// ─── Visa priority ───────────────────────────────────────────────────────────
export const VISA_PRIORITY_LABELS: Record<string, string> = {
    normal: 'Normal',
    urgent: 'Urgent',
    critical: 'Critical',
}

// ─── Leave policy type ───────────────────────────────────────────────────────
export const LEAVE_POLICY_TYPE_LABELS: Record<string, string> = {
    flat: 'Flat',
    monthly_2_then_30: 'Monthly 2 then 30',
    unlimited: 'Unlimited',
    none: 'None',
}

// ─── Gender ──────────────────────────────────────────────────────────────────
export const GENDER_LABELS: Record<string, string> = {
    male: 'Male',
    female: 'Female',
}

// ─── Emiratisation ───────────────────────────────────────────────────────────
export const EMIRATISATION_LABELS: Record<string, string> = {
    emirati: 'Emirati',
    expat: 'Expat',
}

// ─── Device type ─────────────────────────────────────────────────────────────
export const DEVICE_TYPE_LABELS: Record<string, string> = {
    desktop: 'Desktop',
    mobile: 'Mobile',
    tablet: 'Tablet',
    unknown: 'Unknown',
}

/**
 * Master flat lookup — merges all enum maps above.
 * When the same key exists in multiple maps the value is always the same label,
 * so there are no conflicts.
 */
const ALL_LABELS: Record<string, string> = {
    ...ROLE_LABELS,
    ...EMPLOYEE_STATUS_LABELS,
    ...VISA_STATUS_LABELS,
    ...VISA_TYPE_LABELS,
    ...LEAVE_TYPE_LABELS,
    ...APPROVAL_STATUS_LABELS,
    ...ATTENDANCE_STATUS_LABELS,
    ...DOC_CATEGORY_LABELS,
    ...DOC_STATUS_LABELS,
    ...DOC_ACTION_LABELS,
    ...ONBOARDING_STATUS_LABELS,
    ...ASSET_STATUS_LABELS,
    ...ASSET_CONDITION_LABELS,
    ...MAINTENANCE_STATUS_LABELS,
    ...ASSIGNMENT_STATUS_LABELS,
    ...PAYROLL_STATUS_LABELS,
    ...PERFORMANCE_STATUS_LABELS,
    ...JOB_STATUS_LABELS,
    ...EMPLOYMENT_TYPE_LABELS,
    ...STAGE_LABELS,
    ...EXIT_TYPE_LABELS,
    ...SALARY_REVISION_LABELS,
    ...CONTRACT_TYPE_LABELS,
    ...PAYMENT_METHOD_LABELS,
    ...MARITAL_STATUS_LABELS,
    ...INTERVIEW_TYPE_LABELS,
    ...INTERVIEW_STATUS_LABELS,
    ...AUTH_EVENT_LABELS,
    ...AUDIT_ACTION_LABELS,
    ...JURISDICTION_LABELS,
    ...PLAN_LABELS,
    ...TEMPLATE_TYPE_LABELS,
    ...MEMBERSHIP_STATUS_LABELS,
    ...APP_STATUS_LABELS,
    ...VISA_PRIORITY_LABELS,
    ...LEAVE_POLICY_TYPE_LABELS,
    ...GENDER_LABELS,
    ...EMIRATISATION_LABELS,
    ...DEVICE_TYPE_LABELS,
}

/**
 * Returns the human-readable label for any enum value.
 * Falls back to title-casing the raw value (replacing underscores with spaces).
 *
 * @example
 *   labelFor('hr_manager')    // → "HR Manager"
 *   labelFor('wps_submitted') // → "WPS Submitted"
 *   labelFor('unknown_val')   // → "Unknown Val" (fallback)
 */
export function labelFor(value: string | null | undefined): string {
    if (!value) return '—'
    return (
        ALL_LABELS[value] ??
        value
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase())
    )
}
