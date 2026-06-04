/**
 * Centralised select-option arrays for every domain enum in the app.
 *
 * Usage:
 *   import { LEAVE_TYPE_OPTIONS, toOptions } from '@/lib/options'
 *
 * Rules:
 *   • Label maps live in lib/enums.ts  - single source for display strings.
 *   • Option arrays live here          - derived with toOptions() so labels
 *     stay in sync automatically.
 *   • Styling / badge-variant maps     - stay local to each component.
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
    WORKPLACE_TYPE_LABELS,
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
// Excludes public_holiday - employees cannot request it directly.
export const LEAVE_TYPE_OPTIONS: SelectOption[] = toOptions(LEAVE_TYPE_LABELS).filter(o => o.value !== 'public_holiday')
export const LEAVE_STATUS_OPTIONS: SelectOption[] = toOptions(APPROVAL_STATUS_LABELS)
export const LEAVE_POLICY_TYPE_OPTIONS: SelectOption[] = toOptions(LEAVE_POLICY_TYPE_LABELS)

// ── Employee ─────────────────────────────────────────────────────────────────
export const EMPLOYEE_STATUS_OPTIONS: SelectOption[] = toOptions(EMPLOYEE_STATUS_LABELS)
// Valid statuses when creating a new employee
export const NEW_EMPLOYEE_STATUS_OPTIONS: SelectOption[] = EMPLOYEE_STATUS_OPTIONS.filter(o =>
    ['onboarding', 'active'].includes(o.value),
)
// All editable statuses (excludes visa_expired - set automatically)
export const EDIT_EMPLOYEE_STATUS_OPTIONS: SelectOption[] = EMPLOYEE_STATUS_OPTIONS.filter(o =>
    o.value !== 'visa_expired',
)
export const CONTRACT_TYPE_OPTIONS: SelectOption[] = toOptions(CONTRACT_TYPE_LABELS)
export const PAYMENT_METHOD_OPTIONS: SelectOption[] = toOptions(PAYMENT_METHOD_LABELS)
export const MARITAL_STATUS_OPTIONS: SelectOption[] = toOptions(MARITAL_STATUS_LABELS)
export const GENDER_OPTIONS: SelectOption[] = toOptions(GENDER_LABELS)
export const EMIRATISATION_OPTIONS: SelectOption[] = toOptions(EMIRATISATION_LABELS)

// ── Calendar / Shift schedule ────────────────────────────────────────────────
// Sunday-first ordering matches the UAE working-week convention.
import type { WeekDay } from '@/types'

export const WEEK_DAYS: { value: WeekDay; label: string }[] = [
    { value: 'sunday', label: 'Sun' },
    { value: 'monday', label: 'Mon' },
    { value: 'tuesday', label: 'Tue' },
    { value: 'wednesday', label: 'Wed' },
    { value: 'thursday', label: 'Thu' },
    { value: 'friday', label: 'Fri' },
    { value: 'saturday', label: 'Sat' },
]

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
// Job posting uses the same set — internship/temporary/freelance now live in
// EMPLOYMENT_TYPE_LABELS so this alias is just a re-export.
export const JOB_TYPE_OPTIONS: SelectOption[] = EMPLOYMENT_TYPE_OPTIONS
// Where the work happens (on-site / hybrid / remote).
export const WORKPLACE_TYPE_OPTIONS: SelectOption[] = toOptions(WORKPLACE_TYPE_LABELS)

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

// Business Type — backend enum is lowercase ('mainland' | 'freezone'). The
// value sent on form submit must match the schema enum verbatim; we keep
// human-readable labels for the dropdown UI. There is no 'offshore' option
// in the backend type — it was a stale frontend-only value that would have
// been silently stored as a string mismatch.
export const ORG_JURISDICTION_OPTIONS: SelectOption[] = [
    { value: 'mainland', label: 'Mainland' },
    { value: 'freezone', label: 'Free Zone' },
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

// ── Nationalities ─────────────────────────────────────────────────────────────
export const NATIONALITY_OPTIONS: SelectOption[] = [
    { value: 'Emirati', label: 'Emirati' },
    { value: 'Saudi', label: 'Saudi' },
    { value: 'Bahraini', label: 'Bahraini' },
    { value: 'Kuwaiti', label: 'Kuwaiti' },
    { value: 'Omani', label: 'Omani' },
    { value: 'Qatari', label: 'Qatari' },
    { value: 'Afghan', label: 'Afghan' },
    { value: 'Albanian', label: 'Albanian' },
    { value: 'Algerian', label: 'Algerian' },
    { value: 'American', label: 'American' },
    { value: 'Angolan', label: 'Angolan' },
    { value: 'Argentine', label: 'Argentine' },
    { value: 'Armenian', label: 'Armenian' },
    { value: 'Australian', label: 'Australian' },
    { value: 'Austrian', label: 'Austrian' },
    { value: 'Azerbaijani', label: 'Azerbaijani' },
    { value: 'Bangladeshi', label: 'Bangladeshi' },
    { value: 'Belarusian', label: 'Belarusian' },
    { value: 'Belgian', label: 'Belgian' },
    { value: 'Bolivian', label: 'Bolivian' },
    { value: 'Bosnian', label: 'Bosnian' },
    { value: 'Brazilian', label: 'Brazilian' },
    { value: 'British', label: 'British' },
    { value: 'Bulgarian', label: 'Bulgarian' },
    { value: 'Cameroonian', label: 'Cameroonian' },
    { value: 'Canadian', label: 'Canadian' },
    { value: 'Chilean', label: 'Chilean' },
    { value: 'Chinese', label: 'Chinese' },
    { value: 'Colombian', label: 'Colombian' },
    { value: 'Congolese', label: 'Congolese' },
    { value: 'Croatian', label: 'Croatian' },
    { value: 'Cuban', label: 'Cuban' },
    { value: 'Czech', label: 'Czech' },
    { value: 'Danish', label: 'Danish' },
    { value: 'Dutch', label: 'Dutch' },
    { value: 'Ecuadorian', label: 'Ecuadorian' },
    { value: 'Egyptian', label: 'Egyptian' },
    { value: 'Eritrean', label: 'Eritrean' },
    { value: 'Estonian', label: 'Estonian' },
    { value: 'Ethiopian', label: 'Ethiopian' },
    { value: 'Filipino', label: 'Filipino' },
    { value: 'Finnish', label: 'Finnish' },
    { value: 'French', label: 'French' },
    { value: 'Georgian', label: 'Georgian' },
    { value: 'German', label: 'German' },
    { value: 'Ghanaian', label: 'Ghanaian' },
    { value: 'Greek', label: 'Greek' },
    { value: 'Guatemalan', label: 'Guatemalan' },
    { value: 'Hungarian', label: 'Hungarian' },
    { value: 'Indian', label: 'Indian' },
    { value: 'Indonesian', label: 'Indonesian' },
    { value: 'Iranian', label: 'Iranian' },
    { value: 'Iraqi', label: 'Iraqi' },
    { value: 'Irish', label: 'Irish' },
    { value: 'Israeli', label: 'Israeli' },
    { value: 'Italian', label: 'Italian' },
    { value: 'Ivorian', label: 'Ivorian' },
    { value: 'Japanese', label: 'Japanese' },
    { value: 'Jordanian', label: 'Jordanian' },
    { value: 'Kazakhstani', label: 'Kazakhstani' },
    { value: 'Kenyan', label: 'Kenyan' },
    { value: 'Korean', label: 'Korean' },
    { value: 'Lebanese', label: 'Lebanese' },
    { value: 'Libyan', label: 'Libyan' },
    { value: 'Lithuanian', label: 'Lithuanian' },
    { value: 'Malaysian', label: 'Malaysian' },
    { value: 'Mauritian', label: 'Mauritian' },
    { value: 'Mexican', label: 'Mexican' },
    { value: 'Moroccan', label: 'Moroccan' },
    { value: 'Mozambican', label: 'Mozambican' },
    { value: 'Nepali', label: 'Nepali' },
    { value: 'New Zealander', label: 'New Zealander' },
    { value: 'Nigerian', label: 'Nigerian' },
    { value: 'Norwegian', label: 'Norwegian' },
    { value: 'Pakistani', label: 'Pakistani' },
    { value: 'Palestinian', label: 'Palestinian' },
    { value: 'Peruvian', label: 'Peruvian' },
    { value: 'Polish', label: 'Polish' },
    { value: 'Portuguese', label: 'Portuguese' },
    { value: 'Romanian', label: 'Romanian' },
    { value: 'Russian', label: 'Russian' },
    { value: 'Rwandan', label: 'Rwandan' },
    { value: 'Senegalese', label: 'Senegalese' },
    { value: 'Serbian', label: 'Serbian' },
    { value: 'Sierra Leonean', label: 'Sierra Leonean' },
    { value: 'Singaporean', label: 'Singaporean' },
    { value: 'Slovak', label: 'Slovak' },
    { value: 'Somali', label: 'Somali' },
    { value: 'South African', label: 'South African' },
    { value: 'South Sudanese', label: 'South Sudanese' },
    { value: 'Spanish', label: 'Spanish' },
    { value: 'Sri Lankan', label: 'Sri Lankan' },
    { value: 'Sudanese', label: 'Sudanese' },
    { value: 'Swedish', label: 'Swedish' },
    { value: 'Swiss', label: 'Swiss' },
    { value: 'Syrian', label: 'Syrian' },
    { value: 'Taiwanese', label: 'Taiwanese' },
    { value: 'Tanzanian', label: 'Tanzanian' },
    { value: 'Thai', label: 'Thai' },
    { value: 'Tunisian', label: 'Tunisian' },
    { value: 'Turkish', label: 'Turkish' },
    { value: 'Ugandan', label: 'Ugandan' },
    { value: 'Ukrainian', label: 'Ukrainian' },
    { value: 'Uzbekistani', label: 'Uzbekistani' },
    { value: 'Venezuelan', label: 'Venezuelan' },
    { value: 'Vietnamese', label: 'Vietnamese' },
    { value: 'Yemeni', label: 'Yemeni' },
    { value: 'Zimbabwean', label: 'Zimbabwean' },
]
