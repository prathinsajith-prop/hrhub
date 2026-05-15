import { z } from 'zod'

export const uuidSchema = z.string().uuid('Invalid UUID format')

export function parseUuidParam(
    params: Record<string, unknown>,
    key: string,
    reply: { code: (c: number) => { send: (b: unknown) => unknown } },
): string | null {
    const result = uuidSchema.safeParse(params[key])
    if (!result.success) {
        reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: `${key}: Invalid UUID format` })
        return null
    }
    return result.data
}

export const paginationSchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
})

export const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
})

export const refreshSchema = z.object({
    refreshToken: z.string().min(1),
})

export const forgotPasswordSchema = z.object({
    email: z.string().email('Invalid email address'),
})

export const resetPasswordSchema = z.object({
    token: z.string().min(1, 'Reset token is required'),
    password: z.string().min(8, 'Password must be at least 8 characters').max(128),
})

export const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters').max(128),
})

export const updateMyProfileSchema = z.object({
    phone: z.string().max(30).optional(),
    mobileNo: z.string().max(30).optional(),
    personalEmail: z.string().email().optional(),
    emergencyContact: z.string().max(255).optional(),
    emergencyContactName: z.string().max(150).optional(),
    emergencyContactPhone: z.string().max(30).optional(),
    homeCountryAddress: z.string().max(500).optional(),
})

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

export const listLeaveSchema = paginationSchema.extend({
    employeeId: uuidSchema.optional(),
    status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional(),
    leaveType: z.string().optional(),
    from: z.string().date().optional(),
    to: z.string().date().optional(),
    search: z.string().max(100).optional(),
})

export const listAttendanceSchema = paginationSchema.extend({
    employeeId: uuidSchema.optional(),
    startDate: z.string().date().optional(),
    endDate: z.string().date().optional(),
    status: z.string().optional(),
})

export const checkInOutSchema = z.object({
    employeeId: uuidSchema.optional(),
}).optional()

export function validate<T>(schema: z.ZodType<T>, data: unknown): T {
    const result = schema.safeParse(data)
    if (!result.success) {
        const issues = result.error.issues
        const messages = issues.map((e) => `${e.path.join('.')}: ${e.message}`)
        const err: any = new Error(messages.join('; '))
        err.statusCode = 400
        err.name = 'ValidationError'
        err.validationErrors = issues
        throw err
    }
    return result.data
}
