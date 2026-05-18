// ⚠ DUPLICATED from frontend/src/lib/docTypes.ts
// Keep in sync with the admin app when new doc types are added.
//
// Slimmed down: the portal doesn't expose company/onboarding documents, so the
// `getStepDocSuggestions` helper is omitted. Everything else mirrors the
// admin-app catalog 1:1 so type + expiry rules stay consistent across both.

export type DocCategory =
    | 'identity'
    | 'visa'
    | 'employment'
    | 'insurance'
    | 'qualification'
    | 'financial'
    | 'compliance'
    | 'company'

export interface DocTypeDefinition {
    docType: string
    label: string
    category: DocCategory
    expiryRequired: boolean
    hint?: string
}

export const DOC_TYPE_CATALOG: Record<DocCategory, DocTypeDefinition[]> = {
    identity: [
        { docType: 'Passport', label: 'Passport', category: 'identity', expiryRequired: true, hint: 'Valid passport — all pages' },
        { docType: 'Emirates ID', label: 'Emirates ID', category: 'identity', expiryRequired: true, hint: 'Front and back scan' },
        { docType: 'National ID', label: 'National ID', category: 'identity', expiryRequired: true },
        { docType: 'Driving License', label: 'Driving License', category: 'identity', expiryRequired: true },
        { docType: 'Birth Certificate', label: 'Birth Certificate', category: 'identity', expiryRequired: false },
    ],
    visa: [
        { docType: 'Visa', label: 'Visa', category: 'visa', expiryRequired: true, hint: 'UAE Residence Visa stamp page' },
        { docType: 'Residence Visa', label: 'Residence Visa', category: 'visa', expiryRequired: true },
        { docType: 'Entry Permit', label: 'Entry Permit', category: 'visa', expiryRequired: true },
        { docType: 'Labour Card', label: 'Labour Card', category: 'visa', expiryRequired: true },
        { docType: 'Work Permit', label: 'Work Permit', category: 'visa', expiryRequired: true },
        { docType: 'Visit Visa', label: 'Visit Visa', category: 'visa', expiryRequired: true },
        { docType: 'Cancellation Paper', label: 'Cancellation Paper', category: 'visa', expiryRequired: false },
    ],
    insurance: [
        { docType: 'Health Insurance Card', label: 'Health Insurance Card', category: 'insurance', expiryRequired: true },
        { docType: 'Medical Insurance Card', label: 'Medical Insurance Card', category: 'insurance', expiryRequired: true, hint: 'Medical insurance card or policy document' },
        { docType: 'Life Insurance Policy', label: 'Life Insurance Policy', category: 'insurance', expiryRequired: true },
        { docType: 'Workers Compensation', label: 'Workers Compensation', category: 'insurance', expiryRequired: true },
    ],
    employment: [
        { docType: 'Employment Contract', label: 'Employment Contract', category: 'employment', expiryRequired: false },
        { docType: 'Labour Contract', label: 'Labour Contract', category: 'employment', expiryRequired: false },
        { docType: 'Offer Letter', label: 'Offer Letter', category: 'employment', expiryRequired: false },
        { docType: 'NOC Letter', label: 'NOC Letter', category: 'employment', expiryRequired: false },
        { docType: 'Salary Certificate', label: 'Salary Certificate', category: 'employment', expiryRequired: false },
        { docType: 'Experience Letter', label: 'Experience Letter', category: 'employment', expiryRequired: false },
        { docType: 'Appointment Letter', label: 'Appointment Letter', category: 'employment', expiryRequired: false },
        { docType: 'Resume', label: 'Resume', category: 'employment', expiryRequired: false },
    ],
    qualification: [
        { docType: 'Degree Certificate', label: 'Degree Certificate', category: 'qualification', expiryRequired: false },
        { docType: 'Diploma', label: 'Diploma', category: 'qualification', expiryRequired: false },
        { docType: 'Academic Transcript', label: 'Academic Transcript', category: 'qualification', expiryRequired: false },
        { docType: 'Educational Certificate', label: 'Educational Certificate', category: 'qualification', expiryRequired: false },
        { docType: 'Professional Certificate', label: 'Professional Certificate', category: 'qualification', expiryRequired: true, hint: 'Some professional certs expire — note renewal date' },
        { docType: 'Attestation Certificate', label: 'Attestation Certificate', category: 'qualification', expiryRequired: false },
    ],
    compliance: [
        { docType: 'Police Clearance Certificate', label: 'Police Clearance Certificate', category: 'compliance', expiryRequired: true },
        { docType: 'Police Report', label: 'Police Report', category: 'compliance', expiryRequired: false },
        { docType: 'Medical Fitness Certificate', label: 'Medical Fitness Certificate', category: 'compliance', expiryRequired: true },
        { docType: 'Background Check Report', label: 'Background Check Report', category: 'compliance', expiryRequired: false },
    ],
    financial: [
        { docType: 'Bank Account Details', label: 'Bank Account Details', category: 'financial', expiryRequired: false, hint: 'IBAN confirmation letter or bank statement' },
        { docType: 'Payslip', label: 'Payslip', category: 'financial', expiryRequired: false },
    ],
    company: [],
}

export const CATEGORY_LABELS: Record<DocCategory, string> = {
    identity: 'Identity Documents',
    visa: 'Visa & Work Permits',
    employment: 'Employment Documents',
    insurance: 'Insurance',
    qualification: 'Qualifications & Certificates',
    financial: 'Financial Documents',
    compliance: 'Compliance & Legal',
    company: 'Company Documents',
}

// Display order for the portal's category-grouped Select. Identity → Visa →
// Insurance first because those are the docs employees most frequently upload
// themselves.
export const CATEGORY_DISPLAY_ORDER: DocCategory[] = [
    'identity', 'visa', 'insurance', 'employment', 'qualification', 'compliance', 'financial', 'company',
]

const ALL_DOC_TYPES: DocTypeDefinition[] = Object.values(DOC_TYPE_CATALOG).flat()

export function getDocType(docType: string): DocTypeDefinition | undefined {
    return ALL_DOC_TYPES.find((d) => d.docType === docType)
}

const DOC_NUMBER_LABELS: Record<string, string> = {
    'Passport':                'Passport No.',
    'Emirates ID':             'Emirates ID No.',
    'National ID':             'National ID No.',
    'Driving License':         'Driving License No.',
    'Visa':                    'Visa No.',
    'Residence Visa':          'Residence Visa No.',
    'Entry Permit':            'Entry Permit No.',
    'Work Permit':             'Work Permit No.',
    'Visit Visa':              'Visit Visa No.',
    'Labour Card':             'Labour Card No.',
    'Health Insurance Card':   'Policy No.',
    'Medical Insurance Card':  'Policy No.',
}

export interface DocNumberMeta {
    label: string
    placeholder: string
}

export function docNumberMeta(docType: string): DocNumberMeta {
    const label = DOC_NUMBER_LABELS[docType] ?? 'Document Number'
    const placeholder = docType === 'Emirates ID'
        ? '784-XXXX-XXXXXXX-X'
        : `Enter ${label.toLowerCase()}`
    return { label, placeholder }
}
