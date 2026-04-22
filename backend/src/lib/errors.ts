/**
 * Centralized error types for HRHub services.
 * Use ServiceError instead of raw Error so error handlers get typed status codes.
 */

export class ServiceError extends Error {
    readonly statusCode: number
    readonly code: string

    constructor(statusCode: number, code: string, message: string) {
        super(message)
        this.name = 'ServiceError'
        this.statusCode = statusCode
        this.code = code
        // Capture stack trace (V8-specific)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ServiceError)
        }
    }
}

// Convenience factories
export const NotFound = (resource: string) =>
    new ServiceError(404, 'NOT_FOUND', `${resource} not found`)

export const Forbidden = (msg = 'Forbidden') =>
    new ServiceError(403, 'FORBIDDEN', msg)

export const Conflict = (msg: string) =>
    new ServiceError(409, 'CONFLICT', msg)

export const BadRequest = (msg: string) =>
    new ServiceError(400, 'BAD_REQUEST', msg)

export const Locked = (msg: string) =>
    new ServiceError(423, 'ACCOUNT_LOCKED', msg)
