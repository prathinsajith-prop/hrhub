// Shared TypeScript types for backend-portal.
// IMPORTANT: must stay structurally compatible with backend/src/types/index.ts so JWTs
// issued by either service decode to the same shape.

export type UserRole = 'super_admin' | 'hr_manager' | 'pro_officer' | 'dept_head' | 'employee'

export interface JwtPayload {
    sub: string
    tenantId: string
    role: UserRole
    roles: string[]
    name: string
    email: string
    employeeId?: string | null
    department?: string | null
    iat?: number
    exp?: number
}

export interface RequestUser {
    id: string
    tenantId: string
    role: UserRole
    roles: string[]
    email: string
    name: string
    employeeId?: string | null
    department?: string | null
}

export interface PaginatedResult<T> {
    data: T[]
    total: number
    limit: number
    offset: number
    hasMore: boolean
}
