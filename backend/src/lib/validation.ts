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
const employeeBaseSchema = z.object({
    entityId: uuidSchema,
    employeeNo: z.string().min(1).max(50),
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    email: z.string().email().optional(),
    phone: z.string().max(30).optional(),
    nationality: z.string().max(100).optional(),
    passportNo: z.string().max(50).optional(),
    emiratesId: z.string().max(30).optional(),
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
    gender: z.enum(['male', 'female']).optional(),
    department: z.string().max(100).optional(),
    designation: z.string().max(150).optional(),
    joinDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
    basicSalary: z.number().nonnegative().optional(),
    totalSalary: z.number().nonnegative().optional(),
    passportExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    emiratisationCategory: z.enum(['emirati', 'expat']).optional(),
    iban: z.string().max(34).optional(),
    bankName: z.string().max(150).optional(),
})

export const createEmployeeSchema = employeeBaseSchema.refine(
    d => !d.totalSalary || !d.basicSalary || d.totalSalary >= d.basicSalary,
    { message: 'totalSalary must be >= basicSalary', path: ['totalSalary'] }
)

// updateEmployeeSchema — all fields optional, no cross-field refinement needed
export const updateEmployeeSchema = employeeBaseSchema.partial().omit({ entityId: true })

export const listEmployeesSchema = paginationSchema.extend({
    search: z.string().max(100).optional(),
    status: z.enum(['active', 'onboarding', 'probation', 'suspended', 'terminated', 'visa_expired']).optional(),
    department: z.string().max(100).optional(),
})

// ── Leave ─────────────────────────────────────────────────────────────────────
export const createLeaveSchema = z.object({
    employeeId: uuidSchema,
    leaveType: z.enum(['annual', 'sick', 'maternity', 'paternity', 'unpaid', 'emergency', 'bereavement', 'hajj']),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.string().max(500).optional(),
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
    applicationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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
