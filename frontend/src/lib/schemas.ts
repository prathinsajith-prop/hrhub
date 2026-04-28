/**
 * Shared Zod schemas used for client-side form validation.
 * Keep messages short — they render inline under each field.
 */
import { z } from 'zod'

export const employeeStep1Schema = z.object({
    firstName: z.string().trim().min(1, 'First name is required').max(100),
    lastName: z.string().trim().min(1, 'Last name is required').max(100),
    nationality: z.string().trim().optional().or(z.literal('')),
    personalEmail: z
        .string()
        .trim()
        .email('Enter a valid email address')
        .optional()
        .or(z.literal('')),
    mobileNo: z
        .string()
        .trim()
        .refine((v) => !v || v.replace(/\D/g, '').length >= 7, 'Enter a valid phone number')
        .optional()
        .or(z.literal('')),
    dateOfBirth: z
        .string()
        .trim()
        .refine((v) => {
            if (!v) return true
            const dob = new Date(v)
            if (isNaN(dob.getTime())) return false
            const tenYearsAgo = new Date()
            tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10)
            return dob <= tenYearsAgo
        }, 'Employee must be at least 10 years old')
        .optional()
        .or(z.literal('')),
})

export const employeeStep2Schema = z.object({
    joinDate: z.string().trim().min(1, 'Join date is required'),
})

export const jobPostSchema = z.object({
    title: z.string().trim().min(1, 'Title is required').max(150),
    department: z.string().trim().min(1, 'Department is required').max(100),
})

export const visaApplicationSchema = z.object({
    employeeId: z.string().trim().min(1, 'Please select an employee'),
})

export const leaveRequestSchema = z
    .object({
        employeeId: z.string().trim().min(1, 'Please select an employee'),
        startDate: z.string().trim().min(1, 'Start date is required'),
        endDate: z.string().trim().min(1, 'End date is required'),
    })
    .refine(({ startDate, endDate }) => !startDate || !endDate || endDate >= startDate, {
        message: 'End date must be on or after start date',
        path: ['endDate'],
    })

export const documentMetaSchema = z.object({
    category: z.string().trim().min(1, 'Category is required'),
    type: z.string().trim().min(1, 'Document type is required'),
})

export const employeeSalaryRuleSchema = z
    .object({
        basicSalary: z.number().nonnegative().optional(),
        totalSalary: z.number().nonnegative().optional(),
    })
    .refine(
        ({ basicSalary = 0, totalSalary = 0 }) => totalSalary >= basicSalary,
        { message: 'Total salary must be ≥ basic salary', path: ['totalSalary'] },
    )

/**
 * Parse with a Zod schema and return {ok, errors} where errors is a flat map
 * of `field → message`. Perfect for driving field-level UI error state.
 */
export function zodToFieldErrors<T extends z.ZodTypeAny>(schema: T, data: unknown): {
    ok: boolean
    data?: z.infer<T>
    errors: Record<string, string>
} {
    const result = schema.safeParse(data)
    if (result.success) return { ok: true, data: result.data, errors: {} }
    const errors: Record<string, string> = {}
    for (const issue of result.error.issues) {
        const key = issue.path.join('.') || '_form'
        if (!errors[key]) errors[key] = issue.message
    }
    return { ok: false, errors }
}
