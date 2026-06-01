import { formatDate, formatCurrency } from '@/lib/utils'

/**
 * Shared helpers for rendering audit / activity-log change records.
 * Keeps labels and value formatting consistent across the Updates tab
 * on entity detail pages and the global Audit Log page.
 */

/** Human-friendly labels for camelCase / snake_case field keys. */
export const FIELD_LABEL_OVERRIDES: Record<string, string> = {
    // Identity
    firstName: 'First Name',
    lastName: 'Last Name',
    middleName: 'Middle Name',
    fullName: 'Full Name',
    displayName: 'Display Name',
    dob: 'Date of Birth',
    dateOfBirth: 'Date of Birth',
    gender: 'Gender',
    maritalStatus: 'Marital Status',
    nationality: 'Nationality',
    religion: 'Religion',
    bloodGroup: 'Blood Group',

    // Contact
    email: 'Email',
    phone: 'Phone',
    mobile: 'Mobile',
    address: 'Address',
    city: 'City',
    country: 'Country',
    emergencyContact: 'Emergency Contact',
    emergencyContactName: 'Emergency Contact Name',
    emergencyContactPhone: 'Emergency Contact Phone',
    emergencyContactRelation: 'Emergency Contact Relation',

    // IDs & documents
    iban: 'IBAN',
    uaeId: 'UAE ID',
    emiratesId: 'Emirates ID',
    emiratesIdNumber: 'Emirates ID Number',
    emiratesIdExpiry: 'Emirates ID Expiry',
    passportNo: 'Passport No.',
    passportNumber: 'Passport Number',
    passportExpiry: 'Passport Expiry',
    passportIssueDate: 'Passport Issue Date',
    visaNo: 'Visa No.',
    visaNumber: 'Visa Number',
    visaExpiry: 'Visa Expiry',
    visaIssueDate: 'Visa Issue Date',
    visaType: 'Visa Type',
    labourCardNo: 'Labour Card No.',
    labourCardExpiry: 'Labour Card Expiry',

    // Banking
    bankName: 'Bank Name',
    bankBranch: 'Bank Branch',
    accountNumber: 'Account Number',
    accountHolderName: 'Account Holder Name',
    swiftCode: 'SWIFT Code',

    // Employment
    orgUnitId: 'Department',
    designationId: 'Designation',
    teamId: 'Team',
    branchId: 'Branch',
    divisionId: 'Division',
    departmentId: 'Department',
    reportingTo: 'Reports To',
    managerId: 'Manager',
    role: 'Role',
    employmentType: 'Employment Type',
    employeeStatus: 'Status',
    status: 'Status',
    isActive: 'Active',

    // Dates
    joinDate: 'Join Date',
    startDate: 'Start Date',
    endDate: 'End Date',
    effectiveDate: 'Effective Date',
    probationEndDate: 'Probation End Date',
    contractEndDate: 'Contract End Date',
    contractStartDate: 'Contract Start Date',
    transferDate: 'Transfer Date',
    issueDate: 'Issue Date',
    expiryDate: 'Expiry Date',
    createdAt: 'Created',
    updatedAt: 'Updated',

    // Salary
    basicSalary: 'Basic Salary',
    housingAllowance: 'Housing Allowance',
    transportAllowance: 'Transport Allowance',
    otherAllowances: 'Other Allowances',
    totalSalary: 'Total Salary',
    netSalary: 'Net Salary',
    grossSalary: 'Gross Salary',
    currency: 'Currency',
    payFrequency: 'Pay Frequency',

    // Misc
    notes: 'Notes',
    remarks: 'Remarks',
    reason: 'Reason',
    title: 'Title',
    description: 'Description',
    name: 'Name',
    avatar: 'Avatar',
    avatarUrl: 'Avatar',
    photoUrl: 'Photo',
}

/** Convert a field key (camelCase/snake_case) to a readable label. */
export function humanizeFieldLabel(key: string): string {
    if (FIELD_LABEL_OVERRIDES[key]) return FIELD_LABEL_OVERRIDES[key]
    const spaced = key
        .replace(/[_-]+/g, ' ')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .toLowerCase()
    // Title-case, then re-uppercase common acronyms
    const titled = spaced.replace(/\b\w/g, c => c.toUpperCase()).trim()
    return titled
        .replace(/\bId\b/g, 'ID')
        .replace(/\bUrl\b/g, 'URL')
        .replace(/\bUae\b/g, 'UAE')
        .replace(/\bIban\b/g, 'IBAN')
        .replace(/\bHr\b/g, 'HR')
}

const DATE_FIELD_HINTS = /(date|expiry|dob|joinedAt|createdAt|updatedAt|At)$/i
const MONEY_FIELD_HINTS = /(salary|allowance|cost|amount|pay|wage|gratuity|deduction|bonus|fee|price)/i
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T|$)/

/** Format a single from/to value, inferring type from the field name. */
export function formatChangeValue(field: string, v: unknown): string {
    if (v === null || v === undefined || v === '') return '—'
    if (typeof v === 'boolean') return v ? 'Yes' : 'No'
    if (typeof v === 'number') {
        if (MONEY_FIELD_HINTS.test(field)) return formatCurrency(v)
        return String(v)
    }
    if (typeof v === 'string') {
        // Money columns come back from the DB as numeric strings ("5000.00").
        // Format them as currency so payroll edits read "AED 5,000", not "5000.00".
        if (MONEY_FIELD_HINTS.test(field) && v.trim() !== '' && !Number.isNaN(Number(v))) {
            return formatCurrency(Number(v))
        }
        if (ISO_DATE_RE.test(v) || DATE_FIELD_HINTS.test(field)) {
            const formatted = formatDate(v)
            if (formatted) return formatted
        }
        return v
    }
    if (Array.isArray(v)) return v.length === 0 ? '—' : `${v.length} item${v.length === 1 ? '' : 's'}`
    try { return JSON.stringify(v) } catch { return '—' }
}

/** Past-tense verb for an audit action ("update" → "updated"). */
export function actionVerbFor(action: string): string {
    const map: Record<string, string> = {
        create: 'created',
        update: 'updated',
        delete: 'deleted',
        approve: 'approved',
        reject: 'rejected',
        submit: 'submitted',
        view: 'viewed',
        export: 'exported',
        import: 'imported',
        login: 'logged into',
        logout: 'logged out of',
        archive: 'archived',
        activate: 'activated',
        suspend: 'suspended',
        cancel: 'cancelled',
        invite: 'invited',
        assign: 'assigned',
        unassign: 'unassigned',
        upload: 'uploaded',
        download: 'downloaded',
        permission_change: 'changed permissions for',
        role_change: 'changed the role of',
    }
    return map[action] ?? action.replace(/_/g, ' ')
}

/** Relative time label ("2h ago"), with date fallback for older entries. */
export function timeAgo(iso: string, now: number = Date.now()): string {
    const then = new Date(iso).getTime()
    const sec = Math.floor((now - then) / 1000)
    if (sec < 60) return 'just now'
    const min = Math.floor(sec / 60)
    if (min < 60) return `${min}m ago`
    const hr = Math.floor(min / 60)
    if (hr < 24) return `${hr}h ago`
    const day = Math.floor(hr / 24)
    if (day < 7) return `${day}d ago`
    return formatDate(iso) || ''
}

export interface FormattedChange {
    key: string
    label: string
    from: string
    to: string
}

/** Normalize the `changes` JSON blob into a sorted, ready-to-render array. */
export function formatChangeEntries(
    changes: Record<string, { from: unknown; to: unknown }> | null | undefined,
): FormattedChange[] {
    if (!changes) return []
    return Object.entries(changes).map(([key, val]) => ({
        key,
        label: humanizeFieldLabel(key),
        from: formatChangeValue(key, val?.from),
        to: formatChangeValue(key, val?.to),
    }))
}
