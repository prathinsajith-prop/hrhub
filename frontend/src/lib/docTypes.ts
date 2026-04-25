/**
 * Document type catalog for UAE HR compliance.
 * Each entry defines a named document type within a category,
 * whether an expiry date is required, and a short hint.
 */
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
        { docType: 'Birth Certificate', label: 'Birth Certificate', category: 'identity', expiryRequired: false },
    ],
    visa: [
        { docType: 'Residence Visa', label: 'Residence Visa', category: 'visa', expiryRequired: true, hint: 'UAE Residence Visa stamp page' },
        { docType: 'Entry Permit', label: 'Entry Permit', category: 'visa', expiryRequired: true },
        { docType: 'Labour Card', label: 'Labour Card', category: 'visa', expiryRequired: true },
        { docType: 'Work Permit', label: 'Work Permit', category: 'visa', expiryRequired: true },
        { docType: 'Visit Visa', label: 'Visit Visa', category: 'visa', expiryRequired: true },
    ],
    employment: [
        { docType: 'Employment Contract', label: 'Employment Contract', category: 'employment', expiryRequired: false },
        { docType: 'Offer Letter', label: 'Offer Letter', category: 'employment', expiryRequired: false },
        { docType: 'NOC Letter', label: 'NOC Letter', category: 'employment', expiryRequired: false },
        { docType: 'Salary Certificate', label: 'Salary Certificate', category: 'employment', expiryRequired: false },
        { docType: 'Experience Letter', label: 'Experience Letter', category: 'employment', expiryRequired: false },
        { docType: 'Appointment Letter', label: 'Appointment Letter', category: 'employment', expiryRequired: false },
        { docType: 'Termination Letter', label: 'Termination Letter', category: 'employment', expiryRequired: false },
    ],
    insurance: [
        { docType: 'Health Insurance Card', label: 'Health Insurance Card', category: 'insurance', expiryRequired: true, hint: 'Medical insurance card or policy document' },
        { docType: 'Life Insurance Policy', label: 'Life Insurance Policy', category: 'insurance', expiryRequired: true },
        { docType: 'Workers Compensation', label: 'Workers Compensation', category: 'insurance', expiryRequired: true },
    ],
    qualification: [
        { docType: 'Degree Certificate', label: 'Degree Certificate', category: 'qualification', expiryRequired: false },
        { docType: 'Diploma', label: 'Diploma', category: 'qualification', expiryRequired: false },
        { docType: 'Academic Transcript', label: 'Academic Transcript', category: 'qualification', expiryRequired: false },
        { docType: 'Professional Certificate', label: 'Professional Certificate', category: 'qualification', expiryRequired: true, hint: 'Some professional certs expire — note renewal date' },
        { docType: 'Attestation Certificate', label: 'Attestation Certificate', category: 'qualification', expiryRequired: false },
    ],
    financial: [
        { docType: 'Bank Account Details', label: 'Bank Account Details', category: 'financial', expiryRequired: false, hint: 'IBAN confirmation letter or bank statement' },
        { docType: 'WPS Enrollment Form', label: 'WPS Enrollment Form', category: 'financial', expiryRequired: false },
        { docType: 'Salary Revision Letter', label: 'Salary Revision Letter', category: 'financial', expiryRequired: false },
        { docType: 'Payslip', label: 'Payslip', category: 'financial', expiryRequired: false },
    ],
    compliance: [
        { docType: 'MOHRE Registration', label: 'MOHRE Registration', category: 'compliance', expiryRequired: true },
        { docType: 'Professional License', label: 'Professional License', category: 'compliance', expiryRequired: true },
        { docType: 'Police Clearance Certificate', label: 'Police Clearance Certificate', category: 'compliance', expiryRequired: true, hint: 'Valid for 6 months in most jurisdictions' },
        { docType: 'Medical Fitness Certificate', label: 'Medical Fitness Certificate', category: 'compliance', expiryRequired: true },
        { docType: 'Background Check Report', label: 'Background Check Report', category: 'compliance', expiryRequired: false },
    ],
    company: [
        { docType: 'Trade License', label: 'Trade License', category: 'company', expiryRequired: true },
        { docType: 'MOA / AOA', label: 'Memorandum of Association', category: 'company', expiryRequired: false },
        { docType: 'Share Certificate', label: 'Share Certificate', category: 'company', expiryRequired: false },
        { docType: 'Establishment Card', label: 'Establishment Card', category: 'company', expiryRequired: true },
    ],
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

export const ALL_DOC_TYPES: DocTypeDefinition[] = Object.values(DOC_TYPE_CATALOG).flat()

export function getDocType(docType: string): DocTypeDefinition | undefined {
    return ALL_DOC_TYPES.find(d => d.docType === docType)
}

/** Suggested documents for a given onboarding step title */
export function getStepDocSuggestions(stepTitle: string): DocTypeDefinition[] {
    const lower = stepTitle.toLowerCase()
    if (lower.includes('hr documentation') || lower.includes('contract')) {
        return DOC_TYPE_CATALOG.employment.filter(d => ['Employment Contract', 'Offer Letter'].includes(d.docType))
    }
    if (lower.includes('benefits enrollment') || lower.includes('payroll setup')) {
        return [
            ...DOC_TYPE_CATALOG.financial.filter(d => d.docType === 'Bank Account Details'),
            ...DOC_TYPE_CATALOG.insurance.filter(d => d.docType === 'Health Insurance Card'),
        ]
    }
    if (lower.includes('compliance') || lower.includes('safety training')) {
        return DOC_TYPE_CATALOG.compliance.filter(d => d.docType === 'MOHRE Registration')
    }
    if (lower.includes('visa') || lower.includes('immigration')) {
        return DOC_TYPE_CATALOG.visa.filter(d => ['Residence Visa', 'Labour Card'].includes(d.docType))
    }
    if (lower.includes('identity') || lower.includes('documentation collection')) {
        return [
            ...DOC_TYPE_CATALOG.identity.filter(d => ['Passport', 'Emirates ID'].includes(d.docType)),
            ...DOC_TYPE_CATALOG.visa.filter(d => d.docType === 'Residence Visa'),
        ]
    }
    return []
}
