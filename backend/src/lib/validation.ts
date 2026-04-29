/**
 * Shared Zod validation schemas for API route input validation.
 * Each schema is used in route handlers to parse + validate request body/query.
 */
import { z } from 'zod'

// ── Common ───────────────────────────────────────────────────────────────────
export const uuidSchema = z.string().uuid('Invalid UUID format')

export const paginationSchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
    after: z.string().optional(), // cursor for keyset pagination
})

// ── Auth ─────────────────────────────────────────────────────────────────────
export const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
})

export const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8).max(128),
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    tenantName: z.string().min(2).max(200).optional(),
})

export const forgotPasswordSchema = z.object({
    email: z.string().email(),
})

export const resetPasswordSchema = z.object({
    token: z.string().min(1),
    password: z.string().min(8).max(128),
})

export const changePasswordSchema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(128),
})

// ── Employees ────────────────────────────────────────────────────────────────
// z.string().date() (Zod v4) validates YYYY-MM-DD AND checks it's a real calendar date
const dateField = z.string().date('Must be a valid date (YYYY-MM-DD)').optional()

const employeeBaseSchema = z.object({
    entityId: uuidSchema.optional(),
    employeeNo: z.string().min(1).max(50).optional(),
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    status: z.enum(['active', 'onboarding', 'probation', 'suspended', 'terminated', 'visa_expired']).optional(),
    email: z.string().email().optional(),
    phone: z.string().max(30).optional(),
    nationality: z.string().max(100).optional(),
    passportNo: z.string().max(50).optional(),
    emiratesId: z.string().max(30).optional(),
    dateOfBirth: dateField,
    gender: z.enum(['male', 'female']).optional(),
    department: z.string().max(100).optional(),
    designation: z.string().max(150).optional(),
    joinDate: z.string().date('Must be a valid date (YYYY-MM-DD)'),
    basicSalary: z.number().nonnegative().optional(),
    totalSalary: z.number().nonnegative().optional(),
    passportExpiry: dateField,
    emiratisationCategory: z.enum(['emirati', 'expat']).optional(),
    // Extended fields (migration 0002)
    workEmail: z.string().email().optional(),
    personalEmail: z.string().email().optional(),
    mobileNo: z.string().max(30).optional(),
    maritalStatus: z.enum(['single', 'married', 'divorced', 'widowed']).optional(),
    gradeLevel: z.string().max(50).optional(),
    managerName: z.string().max(150).optional(),
    reportingTo: z.string().uuid().nullable().optional(),
    labourCardNumber: z.string().max(50).optional(),
    bankName: z.string().max(150).optional(),
    iban: z.string().max(34).optional(),
    housingAllowance: z.number().nonnegative().optional(),
    transportAllowance: z.number().nonnegative().optional(),
    otherAllowances: z.number().nonnegative().optional(),
    paymentMethod: z.enum(['bank_transfer', 'cash', 'cheque']).optional(),
    emergencyContact: z.string().max(255).optional(),
    homeCountryAddress: z.string().max(500).optional(),
    visaNumber: z.string().max(50).optional(),
    visaIssueDate: dateField,
    visaType: z.enum(['employment', 'investor', 'dependent', 'mission']).optional(),
    emiratesIdExpiry: dateField,
    sponsoringEntity: z.string().max(200).optional(),
    contractType: z.enum(['permanent', 'contract', 'part_time']).optional(),
    workLocation: z.string().max(150).optional(),
    probationEndDate: dateField,
    contractEndDate: dateField,
    avatarUrl: z.string().max(500).optional(),
    divisionId: z.string().uuid().nullable().optional(),
    departmentId: z.string().uuid().nullable().optional(),
    branchId: z.string().uuid().nullable().optional(),
})

export const createEmployeeSchema = employeeBaseSchema
    .refine(
        d => !d.totalSalary || !d.basicSalary || d.totalSalary >= d.basicSalary,
        { message: 'totalSalary must be >= basicSalary', path: ['totalSalary'] }
    )
    .refine(
        d => {
            if (!d.dateOfBirth) return true
            const min = new Date(); min.setFullYear(min.getFullYear() - 10)
            return d.dateOfBirth <= min.toISOString().split('T')[0]
        },
        { message: 'Employee must be at least 10 years old', path: ['dateOfBirth'] }
    )
    .refine(
        d => !d.contractEndDate || !d.joinDate || d.contractEndDate >= d.joinDate,
        { message: 'Contract end date must be on or after join date', path: ['contractEndDate'] }
    )
    .refine(
        d => !d.probationEndDate || !d.joinDate || d.probationEndDate >= d.joinDate,
        { message: 'Probation end date must be on or after join date', path: ['probationEndDate'] }
    )

// updateEmployeeSchema — all fields optional, still enforces salary/date refinements
export const updateEmployeeSchema = employeeBaseSchema
    .partial()
    .omit({ entityId: true })
    .refine(
        d => !d.totalSalary || !d.basicSalary || d.totalSalary >= d.basicSalary,
        { message: 'totalSalary must be >= basicSalary', path: ['totalSalary'] }
    )
    .refine(
        d => {
            if (!d.dateOfBirth) return true
            const min = new Date(); min.setFullYear(min.getFullYear() - 10)
            return d.dateOfBirth <= min.toISOString().split('T')[0]
        },
        { message: 'Employee must be at least 10 years old', path: ['dateOfBirth'] }
    )
    .refine(
        d => !d.contractEndDate || !d.joinDate || d.contractEndDate >= d.joinDate,
        { message: 'Contract end date must be on or after join date', path: ['contractEndDate'] }
    )
    .refine(
        d => !d.probationEndDate || !d.joinDate || d.probationEndDate >= d.joinDate,
        { message: 'Probation end date must be on or after join date', path: ['probationEndDate'] }
    )

export const listEmployeesSchema = paginationSchema.extend({
    search: z.string().max(100).optional(),
    status: z.enum(['active', 'onboarding', 'probation', 'suspended', 'terminated', 'visa_expired']).optional(),
    department: z.string().max(100).optional(),
})

// ── Leave ─────────────────────────────────────────────────────────────────────
export const createLeaveSchema = z.object({
    employeeId: uuidSchema,
    leaveType: z.enum(['annual', 'sick', 'maternity', 'paternity', 'unpaid', 'compassionate', 'emergency', 'bereavement', 'hajj']),
    startDate: z.string().date('Must be a valid date (YYYY-MM-DD)'),
    endDate: z.string().date('Must be a valid date (YYYY-MM-DD)'),
    reason: z.string().max(500).optional(),
    handoverTo: uuidSchema.optional().nullable(),
    handoverNotes: z.string().max(1000).optional().nullable(),
}).refine(d => d.endDate >= d.startDate, {
    message: 'endDate must be on or after startDate',
    path: ['endDate'],
})

export const leaveActionSchema = z.object({
    approved: z.boolean(),
    notes: z.string().max(500).optional(),
})

// ── Payroll ───────────────────────────────────────────────────────────────────
export const createPayrollRunSchema = z.object({
    year: z.number().int().min(2000).max(2100),
    month: z.number().int().min(1).max(12),
    currency: z.string().length(3).default('AED'),
    notes: z.string().max(500).optional(),
})

// ── Recruitment ───────────────────────────────────────────────────────────────
export const createJobSchema = z.object({
    title: z.string().min(2).max(200),
    department: z.string().max(100).optional(),
    location: z.string().max(100).optional(),
    description: z.string().max(5000).optional(),
    requirements: z.string().max(5000).optional(),
    salaryMin: z.number().nonnegative().optional(),
    salaryMax: z.number().nonnegative().optional(),
    employmentType: z.enum(['full_time', 'part_time', 'contract', 'intern']).optional(),
}).refine(d => !d.salaryMin || !d.salaryMax || d.salaryMax >= d.salaryMin, {
    message: 'salaryMax must be >= salaryMin',
    path: ['salaryMax'],
})

// ── Visa ──────────────────────────────────────────────────────────────────────
export const createVisaSchema = z.object({
    employeeId: uuidSchema,
    visaType: z.string().max(100),
    applicationDate: z.string().date('Must be a valid date (YYYY-MM-DD)').optional(),
    notes: z.string().max(1000).optional(),
})

// ── Utility: parse or throw 400 ───────────────────────────────────────────────
export function validate<T>(schema: z.ZodType<T>, data: unknown): T {
    const result = schema.safeParse(data)
    if (!result.success) {
        const issues = result.error.issues
        const messages = issues.map(e => `${e.path.join('.')}: ${e.message}`)
        const err: NodeJS.ErrnoException & { statusCode?: number; validationErrors?: unknown } = new Error(messages.join('; '))
        err.statusCode = 400
        err.name = 'ValidationError'
        err.validationErrors = issues
        throw err
    }
    return result.data
}
