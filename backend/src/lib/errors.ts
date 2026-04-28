/**
 * Centralized error types and HTTP response helpers for HRHub.
 *
 * Two layers:
 *  - ServiceError / factory functions (throw from service layer, caught by global error handler)
 *  - httpErrorBody / shorthand helpers (use in reply.code(N).send(...) for inline route errors)
 *
 * Both produce the same wire format: { statusCode, error, message }
 */

const HTTP_ERROR_NAMES: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    500: 'Internal Server Error',
}

/** Produces the standard `{ statusCode, error, message }` response body for inline route sends. */
export function httpErrorBody(statusCode: number, message: string) {
    return { statusCode, error: HTTP_ERROR_NAMES[statusCode] ?? 'Error', message }
}

export const e400 = (msg: string) => httpErrorBody(400, msg)
export const e401 = (msg: string) => httpErrorBody(401, msg)
export const e403 = (msg: string) => httpErrorBody(403, msg)
export const e404 = (msg: string) => httpErrorBody(404, msg)
export const e409 = (msg: string) => httpErrorBody(409, msg)

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
