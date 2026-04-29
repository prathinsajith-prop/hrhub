// Shared TypeScript types for the backend
export type UserRole = 'super_admin' | 'hr_manager' | 'pro_officer' | 'dept_head' | 'employee'

export interface JwtPayload {
    sub: string       // user id
    tenantId: string
    role: UserRole
    name: string      // embedded at login — avoids DB lookup in authenticate plugin
    email: string     // embedded at login
    employeeId?: string | null  // linked HR record (null for non-employee accounts)
    department?: string | null  // dept_head scope — their assigned department
    iat?: number
    exp?: number
}

export interface RequestUser {
    id: string
    tenantId: string
    role: UserRole
    email: string
    name: string
    employeeId?: string | null
    department?: string | null  // populated from JWT for dept_head scoping
}

export interface PaginationParams {
    limit: number
    offset: number
}

export interface PaginatedResult<T> {
    data: T[]
    total: number
    limit: number
    offset: number
    hasMore: boolean
}

export interface ApiError {
    statusCode: number
    error: string
    message: string
    details?: unknown
}

