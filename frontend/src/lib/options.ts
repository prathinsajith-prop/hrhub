/**
 * Centralised select-option arrays for every domain enum in the app.
 *
 * Usage:
 *   import { LEAVE_TYPE_OPTIONS, toOptions } from '@/lib/options'
 *
 * Rules:
 *   • Label maps live in lib/enums.ts  — single source for display strings.
 *   • Option arrays live here          — derived with toOptions() so labels
 *     stay in sync automatically.
 *   • Styling / badge-variant maps     — stay local to each component.
 */

import {
    LEAVE_TYPE_LABELS,
    APPROVAL_STATUS_LABELS,
    EMPLOYEE_STATUS_LABELS,
    VISA_STATUS_LABELS,
    VISA_PRIORITY_LABELS,
    ATTENDANCE_STATUS_LABELS,
    DOC_CATEGORY_LABELS,
    DOC_STATUS_LABELS,
    ONBOARDING_STATUS_LABELS,
    ASSET_STATUS_LABELS,
    ASSET_CONDITION_LABELS,
    PAYROLL_STATUS_LABELS,
    PERFORMANCE_STATUS_LABELS,
    JOB_STATUS_LABELS,
    EMPLOYMENT_TYPE_LABELS,
    EXIT_TYPE_LABELS,
    AUDIT_ACTION_LABELS,
    CONTRACT_TYPE_LABELS,
    PAYMENT_METHOD_LABELS,
    MARITAL_STATUS_LABELS,
    GENDER_LABELS,
    EMIRATISATION_LABELS,
    ROLE_LABELS,
    JURISDICTION_LABELS,
    PLAN_LABELS,
    LEAVE_POLICY_TYPE_LABELS,
} from './enums'

export type SelectOption = { value: string; label: string }

/** Convert a label map to a select-option array. */
export function toOptions(map: Record<string, string>): SelectOption[] {
    return Object.entries(map).map(([value, label]) => ({ value, label }))
}

// ── Leave ────────────────────────────────────────────────────────────────────
// Excludes public_holiday — employees cannot request it directly.
export const LEAVE_TYPE_OPTIONS: SelectOption[] = toOptions(LEAVE_TYPE_LABELS).filter(o => o.value !== 'public_holiday')
export const LEAVE_STATUS_OPTIONS: SelectOption[] = toOptions(APPROVAL_STATUS_LABELS)
export const LEAVE_POLICY_TYPE_OPTIONS: SelectOption[] = toOptions(LEAVE_POLICY_TYPE_LABELS)

// ── Employee ─────────────────────────────────────────────────────────────────
export const EMPLOYEE_STATUS_OPTIONS: SelectOption[] = toOptions(EMPLOYEE_STATUS_LABELS)
// Valid statuses when creating a new employee
export const NEW_EMPLOYEE_STATUS_OPTIONS: SelectOption[] = EMPLOYEE_STATUS_OPTIONS.filter(o =>
    ['onboarding', 'probation', 'active'].includes(o.value),
)
// All editable statuses (excludes visa_expired — set automatically)
export const EDIT_EMPLOYEE_STATUS_OPTIONS: SelectOption[] = EMPLOYEE_STATUS_OPTIONS.filter(o =>
    o.value !== 'visa_expired',
)
export const CONTRACT_TYPE_OPTIONS: SelectOption[] = toOptions(CONTRACT_TYPE_LABELS)
export const PAYMENT_METHOD_OPTIONS: SelectOption[] = toOptions(PAYMENT_METHOD_LABELS)
export const MARITAL_STATUS_OPTIONS: SelectOption[] = toOptions(MARITAL_STATUS_LABELS)
export const GENDER_OPTIONS: SelectOption[] = toOptions(GENDER_LABELS)
export const EMIRATISATION_OPTIONS: SelectOption[] = toOptions(EMIRATISATION_LABELS)

// ── Visa ─────────────────────────────────────────────────────────────────────
export const VISA_STATUS_OPTIONS: SelectOption[] = toOptions(VISA_STATUS_LABELS)
export const VISA_PRIORITY_OPTIONS: SelectOption[] = toOptions(VISA_PRIORITY_LABELS)
// Subset of visa types applicable when opening a new application
export const VISA_APPLICATION_TYPE_OPTIONS: SelectOption[] = [
    { value: 'employment_new', label: 'Employment (New)' },
    { value: 'employment_renewal', label: 'Employment (Renewal)' },
    { value: 'dependant', label: 'Dependant' },
    { value: 'visit', label: 'Visit' },
    { value: 'cancellation', label: 'Cancellation' },
]
export const VISA_COST_CATEGORY_OPTIONS: SelectOption[] = [
    { value: 'govt_fee', label: 'Govt Fee' },
    { value: 'medical', label: 'Medical' },
    { value: 'typing', label: 'Typing' },
    { value: 'translation', label: 'Translation' },
    { value: 'other', label: 'Other' },
]

// ── Attendance ───────────────────────────────────────────────────────────────
export const ATTENDANCE_STATUS_OPTIONS: SelectOption[] = toOptions(ATTENDANCE_STATUS_LABELS)

// ── Document ─────────────────────────────────────────────────────────────────
export const DOC_CATEGORY_OPTIONS: SelectOption[] = toOptions(DOC_CATEGORY_LABELS)
export const DOC_STATUS_OPTIONS: SelectOption[] = toOptions(DOC_STATUS_LABELS)
// Simplified categories used in the document upload / edit forms
export const EDIT_DOC_CATEGORY_OPTIONS: SelectOption[] = [
    { value: 'personal', label: 'Personal' },
    { value: 'visa', label: 'Visa' },
    { value: 'contract', label: 'Contract' },
    { value: 'certificate', label: 'Certificate' },
    { value: 'payroll', label: 'Payroll' },
    { value: 'other', label: 'Other' },
]

// ── Onboarding ───────────────────────────────────────────────────────────────
export const ONBOARDING_STATUS_OPTIONS: SelectOption[] = toOptions(ONBOARDING_STATUS_LABELS)

// ── Asset ────────────────────────────────────────────────────────────────────
export const ASSET_STATUS_OPTIONS: SelectOption[] = toOptions(ASSET_STATUS_LABELS)
export const ASSET_CONDITION_OPTIONS: SelectOption[] = toOptions(ASSET_CONDITION_LABELS)

// ── Payroll ──────────────────────────────────────────────────────────────────
export const PAYROLL_STATUS_OPTIONS: SelectOption[] = toOptions(PAYROLL_STATUS_LABELS)

// ── Performance ──────────────────────────────────────────────────────────────
export const PERFORMANCE_STATUS_OPTIONS: SelectOption[] = toOptions(PERFORMANCE_STATUS_LABELS)

// ── Recruitment ──────────────────────────────────────────────────────────────
export const JOB_STATUS_OPTIONS: SelectOption[] = toOptions(JOB_STATUS_LABELS)
export const EMPLOYMENT_TYPE_OPTIONS: SelectOption[] = toOptions(EMPLOYMENT_TYPE_LABELS)
// Job posting type includes internship (not an employment contract type)
export const JOB_TYPE_OPTIONS: SelectOption[] = [
    ...toOptions(EMPLOYMENT_TYPE_LABELS),
    { value: 'internship', label: 'Internship' },
]

// ── Exit ─────────────────────────────────────────────────────────────────────
export const EXIT_TYPE_OPTIONS: SelectOption[] = toOptions(EXIT_TYPE_LABELS)

// ── Audit ────────────────────────────────────────────────────────────────────
export const AUDIT_ACTION_OPTIONS: SelectOption[] = toOptions(AUDIT_ACTION_LABELS)
export const AUDIT_ENTITY_TYPE_OPTIONS: SelectOption[] = [
    { value: 'employee', label: 'Employee' },
    { value: 'leave', label: 'Leave' },
    { value: 'payroll', label: 'Payroll' },
    { value: 'visa', label: 'Visa' },
    { value: 'document', label: 'Document' },
    { value: 'recruitment', label: 'Recruitment' },
    { value: 'onboarding', label: 'Onboarding' },
    { value: 'compliance', label: 'Compliance' },
    { value: 'user', label: 'User' },
    { value: 'tenant', label: 'Tenant' },
]

// ── Role ─────────────────────────────────────────────────────────────────────
export const ROLE_OPTIONS: SelectOption[] = toOptions(ROLE_LABELS)

// ── Organisation ─────────────────────────────────────────────────────────────
export const JURISDICTION_OPTIONS: SelectOption[] = toOptions(JURISDICTION_LABELS)
export const PLAN_OPTIONS: SelectOption[] = toOptions(PLAN_LABELS)

// NewOrganizationPage stores jurisdiction as title-case strings — kept separate
// to avoid a data migration.
export const ORG_JURISDICTION_OPTIONS: SelectOption[] = [
    { value: 'Mainland', label: 'Mainland' },
    { value: 'Free Zone', label: 'Free Zone' },
    { value: 'Offshore', label: 'Offshore' },
]
export const ORG_INDUSTRY_OPTIONS: SelectOption[] = [
    { value: 'Technology', label: 'Technology' },
    { value: 'Construction', label: 'Construction' },
    { value: 'Hospitality', label: 'Hospitality' },
    { value: 'Retail', label: 'Retail' },
    { value: 'Healthcare', label: 'Healthcare' },
    { value: 'Other', label: 'Other' },
]
export const ORG_PLAN_OPTIONS: SelectOption[] = [
    { value: 'starter', label: 'Starter' },
    { value: 'growth', label: 'Growth' },
    { value: 'enterprise', label: 'Enterprise' },
]

// ── Registration form ─────────────────────────────────────────────────────────
export const INDUSTRY_OPTIONS: SelectOption[] = [
    { value: 'technology', label: 'Technology & Software' },
    { value: 'financial_services', label: 'Financial Services & Banking' },
    { value: 'real_estate', label: 'Real Estate & Construction' },
    { value: 'retail', label: 'Retail & E-commerce' },
    { value: 'healthcare', label: 'Healthcare & Life Sciences' },
    { value: 'education', label: 'Education & Training' },
    { value: 'hospitality', label: 'Hospitality & Tourism' },
    { value: 'manufacturing', label: 'Manufacturing & Industrial' },
    { value: 'oil_gas', label: 'Oil, Gas & Energy' },
    { value: 'logistics', label: 'Transportation & Logistics' },
    { value: 'media', label: 'Media, Marketing & Advertising' },
    { value: 'professional_services', label: 'Professional Services & Consulting' },
    { value: 'government', label: 'Government & Public Sector' },
    { value: 'telecom', label: 'Telecommunications' },
    { value: 'other', label: 'Other' },
]

export const COMPANY_SIZE_OPTIONS: SelectOption[] = [
    { value: '1-10', label: '1 – 10 employees' },
    { value: '11-50', label: '11 – 50 employees' },
    { value: '51-200', label: '51 – 200 employees' },
    { value: '201-500', label: '201 – 500 employees' },
    { value: '501-1000', label: '501 – 1,000 employees' },
    { value: '1000+', label: '1,000+ employees' },
]
