/**
 * Unit tests for the centralized error helpers in lib/errors.ts.
 * These guard the wire format that clients depend on.
 */
import { describe, it, expect } from 'vitest'
import {
    httpErrorBody,
    e400, e401, e403, e404, e409,
    ServiceError,
    NotFound, Forbidden, Conflict, BadRequest, Locked,
} from '../lib/errors.js'

describe('httpErrorBody', () => {
    it('produces the standard { statusCode, error, message } shape', () => {
        const body = httpErrorBody(400, 'Something is wrong')
        expect(body).toEqual({ statusCode: 400, error: 'Bad Request', message: 'Something is wrong' })
    })

    it('maps 401 to Unauthorized', () => {
        expect(httpErrorBody(401, 'x').error).toBe('Unauthorized')
    })

    it('maps 403 to Forbidden', () => {
        expect(httpErrorBody(403, 'x').error).toBe('Forbidden')
    })

    it('maps 404 to Not Found', () => {
        expect(httpErrorBody(404, 'x').error).toBe('Not Found')
    })

    it('maps 409 to Conflict', () => {
        expect(httpErrorBody(409, 'x').error).toBe('Conflict')
    })

    it('maps 500 to Internal Server Error', () => {
        expect(httpErrorBody(500, 'x').error).toBe('Internal Server Error')
    })

    it('falls back to "Error" for unknown status codes', () => {
        expect(httpErrorBody(418, 'teapot').error).toBe('Error')
    })

    it('preserves the message verbatim', () => {
        const msg = 'Employee ID is required'
        expect(httpErrorBody(400, msg).message).toBe(msg)
    })
})

describe('inline error shorthand helpers', () => {
    it('e400 produces statusCode 400 with Bad Request', () => {
        expect(e400('bad')).toEqual({ statusCode: 400, error: 'Bad Request', message: 'bad' })
    })

    it('e401 produces statusCode 401 with Unauthorized', () => {
        expect(e401('unauth')).toEqual({ statusCode: 401, error: 'Unauthorized', message: 'unauth' })
    })

    it('e403 produces statusCode 403 with Forbidden', () => {
        expect(e403('no access')).toEqual({ statusCode: 403, error: 'Forbidden', message: 'no access' })
    })

    it('e404 produces statusCode 404 with Not Found', () => {
        expect(e404('employee not found')).toEqual({ statusCode: 404, error: 'Not Found', message: 'employee not found' })
    })

    it('e409 produces statusCode 409 with Conflict', () => {
        expect(e409('duplicate email')).toEqual({ statusCode: 409, error: 'Conflict', message: 'duplicate email' })
    })
})

describe('ServiceError', () => {
    it('is an instance of Error', () => {
        const err = new ServiceError(404, 'NOT_FOUND', 'Employee not found')
        expect(err).toBeInstanceOf(Error)
    })

    it('has name ServiceError', () => {
        expect(new ServiceError(400, 'BAD', 'bad').name).toBe('ServiceError')
    })

    it('exposes statusCode, code, and message', () => {
        const err = new ServiceError(409, 'CONFLICT', 'already exists')
        expect(err.statusCode).toBe(409)
        expect(err.code).toBe('CONFLICT')
        expect(err.message).toBe('already exists')
    })

    it('can be caught as a generic Error', () => {
        expect(() => { throw new ServiceError(500, 'ERR', 'fail') }).toThrow(Error)
    })
})

describe('ServiceError factory functions', () => {
    it('NotFound returns a 404 ServiceError with the resource name in the message', () => {
        const err = NotFound('Employee')
        expect(err.statusCode).toBe(404)
        expect(err.code).toBe('NOT_FOUND')
        expect(err.message).toContain('Employee')
    })

    it('Forbidden returns a 403 ServiceError', () => {
        const err = Forbidden()
        expect(err.statusCode).toBe(403)
        expect(err.code).toBe('FORBIDDEN')
    })

    it('Forbidden accepts a custom message', () => {
        const err = Forbidden('Insufficient permissions')
        expect(err.message).toBe('Insufficient permissions')
    })

    it('Conflict returns a 409 ServiceError', () => {
        const err = Conflict('Email already in use')
        expect(err.statusCode).toBe(409)
        expect(err.code).toBe('CONFLICT')
        expect(err.message).toBe('Email already in use')
    })

    it('BadRequest returns a 400 ServiceError', () => {
        const err = BadRequest('Missing required field')
        expect(err.statusCode).toBe(400)
        expect(err.code).toBe('BAD_REQUEST')
    })

    it('Locked returns a 423 ServiceError with ACCOUNT_LOCKED code', () => {
        const err = Locked('Account is locked for 15 minutes')
        expect(err.statusCode).toBe(423)
        expect(err.code).toBe('ACCOUNT_LOCKED')
    })
})
