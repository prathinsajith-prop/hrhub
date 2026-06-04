import { loginUser, refreshAccessToken, revokeRefreshToken, requestPasswordReset, resetPasswordWithToken, changePassword, completeMfaLogin, completeMfaLoginWithBackupCode, registerTenant } from './auth.service.js'
import { setupTotp, verifyAndEnableTotp, disableTotp, getTotpStatus, regenerateBackupCodes } from './twofa.service.js'
import { recordLoginEvent, recordActivity } from '../audit/audit.service.js'

/**
 * Fire-and-forget per-employee audit entry for auth/security events
 * (password change, 2FA toggle, profile self-update). Surfaces in the
 * employee detail Updates tab AND the employee portal's My Activity feed.
 * Silently no-ops when the user has no linked employee record.
 */
function auditSelfEvent(
    request: any,
    subKind: 'password-change' | '2fa-enable' | '2fa-disable' | '2fa-backup-regenerate' | 'profile-self-update',
    action: 'update' | 'create' | 'delete',
    entityName: string,
    extra: Record<string, unknown> = {},
) {
    const employeeId = request.user?.employeeId
    if (!employeeId) return
    recordActivity({
        tenantId: request.user.tenantId,
        userId: request.user.id,
        actorName: request.user.name,
        actorRole: request.user.role,
        entityType: 'employee',
        entityId: employeeId,
        entityName,
        action,
        metadata: { kind: 'security', subKind, ...extra },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
    }).catch(() => { })
}
import { validate, loginSchema, forgotPasswordSchema, resetPasswordSchema, changePasswordSchema } from '../../lib/validation.js'
import { db } from '../../db/index.js'
import { users, employees } from '../../db/schema/index.js'
import { eq, and } from 'drizzle-orm'
import { uploadObject, buildS3Key, generateDownloadUrl, resolveAvatarUrl } from '../../plugins/s3.js'
import { fileTypeFromBuffer } from 'file-type'
import { z } from 'zod'

// ── Local Zod schemas for routes lacking a shared schema ─────────────────────
const registerTenantSchema = z.object({
    firstName: z.string().min(1).max(60),
    lastName: z.string().min(1).max(60),
    email: z.string().email(),
    password: z.string().min(8).max(128),
    company: z.string().min(2).max(200),
    industry: z.string().max(100).optional(),
    jurisdiction: z.enum(['mainland', 'freezone']).optional(),
    businessType: z.enum(['mainland', 'freezone']).optional(),
    tradeLicenseNo: z.string().max(100).optional(),
    phone: z.string().max(30).optional(),
    companySize: z.string().max(50).optional(),
})

const refreshTokenSchema = z.object({
    refreshToken: z.string().min(1),
})

const logoutSchema = z.object({
    refreshToken: z.string().min(1).optional(),
}).optional()

const mfaChallengeSchema = z.object({
    mfaToken: z.string().min(1),
    code: z.string().min(6).max(6),
})

const mfaBackupChallengeSchema = z.object({
    mfaToken: z.string().min(1),
    code: z.string().min(8).max(32),
})

const totpTokenSchema = z.object({
    token: z.string().min(6).max(8),
})

const updateMeSchema = z.object({
    firstName: z.string().min(1).max(60).optional(),
    lastName: z.string().min(1).max(60).optional(),
    name: z.string().min(2).max(120).optional(),
    department: z.string().max(120).nullable().optional(),
}).strict()

export default async function (fastify: any): Promise<void> {
    // POST /api/v1/auth/login
    fastify.post('/login', {
        config: {
            rateLimit: {
                max: process.env.E2E_MODE === 'true' || process.env.NODE_ENV === 'test' ? 1000 : 10,
                timeWindow: '15 minutes',
                // Key on email (account) when provided, fall back to IP
                keyGenerator: (request: any) => {
                    const body = request.body as { email?: string } | null
                    const email = body?.email?.toLowerCase()?.trim()
                    return email ? `login:${email}` : request.ip
                },
                errorResponseBuilder: (_req: any, context: any) => ({
                    statusCode: 429,
                    error: 'Too Many Requests',
                    message: `Too many login attempts. Try again in ${Math.ceil(context.ttl / 60000)} minutes.`,
                }),
            },
        },
        schema: {
            tags: ['Auth'],
            body: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 6 },
                },
            },
        },
    }, async (request, reply) => {
        const { email, password } = validate(loginSchema, request.body)
        const ipAddress = (request as any).ip ?? request.headers['x-forwarded-for'] as string
        const userAgent = request.headers['user-agent']

        const result = await loginUser(fastify, { email, password, ipAddress, userAgent })
        if (!result) {
            return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid email or password' })
        }
        // 2FA required — send challenge token only
        if ('requiresMfa' in result) {
            return reply.send({ data: result })
        }
        return reply.send({ data: result })
    })

    // POST /api/v1/auth/register — create new tenant + super_admin
    fastify.post('/register', {
        config: {
            rateLimit: { max: 5, timeWindow: '15 minutes', keyGenerator: (r: any) => r.ip },
        },
        schema: {
            tags: ['Auth'],
            body: {
                type: 'object',
                required: ['firstName', 'lastName', 'email', 'password', 'company'],
                properties: {
                    firstName:     { type: 'string', minLength: 1 },
                    lastName:      { type: 'string', minLength: 1 },
                    email:         { type: 'string', format: 'email' },
                    password:      { type: 'string', minLength: 8 },
                    company:       { type: 'string', minLength: 2 },
                    industry:      { type: 'string' },
                    jurisdiction:  { type: 'string', enum: ['mainland', 'freezone'] },
                    tradeLicenseNo: { type: 'string' },
                    phone:         { type: 'string' },
                    companySize:   { type: 'string' },
                },
            },
        },
    }, async (request, reply) => {
        const { firstName, lastName, email, password, company, industry, jurisdiction, businessType, tradeLicenseNo, phone, companySize } = validate(registerTenantSchema, request.body)
        const result = await registerTenant({ firstName, lastName, email, password, company, industry, jurisdiction, businessType, tradeLicenseNo, phone, companySize })
        if (!result.ok) {
            const reason = (result as { ok: false; reason: string }).reason
            if (reason === 'email_taken') {
                return reply.code(409).send({ statusCode: 409, error: 'Conflict', message: 'An account with this email already exists.' })
            }
            return reply.code(500).send({ statusCode: 500, error: 'Internal Server Error', message: 'Registration failed.' })
        }
        return reply.code(201).send({ data: { ok: true } })
    })

    // POST /api/v1/auth/refresh
    fastify.post('/refresh', {
        schema: {
            tags: ['Auth'],
            body: {
                type: 'object',
                required: ['refreshToken'],
                properties: { refreshToken: { type: 'string' } },
            },
        },
    }, async (request, reply) => {
        const { refreshToken } = validate(refreshTokenSchema, request.body)

        const result = await refreshAccessToken(fastify, refreshToken)
        if (!result) {
            return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or expired refresh token' })
        }

        return reply.send({ data: result })
    })

    // POST /api/v1/auth/logout
    fastify.post('/logout', {
        schema: { tags: ['Auth'] },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const parsed = validate(logoutSchema, request.body ?? {})
        const refreshToken = parsed?.refreshToken
        if (refreshToken) await revokeRefreshToken(refreshToken)
        // Record logout
        const u = (request as any).user
        if (u?.sub) {
            recordLoginEvent({
                tenantId: u.tenantId,
                userId: u.sub,
                eventType: 'logout',
                success: true,
                ipAddress: (request as any).ip ?? request.headers['x-forwarded-for'] as string,
                userAgent: request.headers['user-agent'],
            }).catch(() => { })
        }
        return reply.code(204).send()
    })

    // GET /api/v1/auth/me
    //
    // Enrich the JWT-derived `request.user` with the small set of per-user
    // flags that aren't carried in the token (e.g. attendancePunchEnabled).
    // These flags change rarely but need to reflect HR overrides without
    // forcing a re-login, so we fetch fresh from the DB here.
    fastify.get('/me', {
        schema: { tags: ['Auth'] },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const [row] = await db
            .select({
                attendancePunchEnabled: users.attendancePunchEnabled,
                attendanceManualEntryEnabled: users.attendanceManualEntryEnabled,
                portalPostEnabled: users.portalPostEnabled,
            })
            .from(users)
            .where(eq(users.id, request.user.id))
            .limit(1)
        return reply.send({
            data: {
                ...request.user,
                attendancePunchEnabled: row?.attendancePunchEnabled ?? true,
                attendanceManualEntryEnabled: row?.attendanceManualEntryEnabled ?? true,
                portalPostEnabled: row?.portalPostEnabled ?? false,
            },
        })
    })

    // POST /api/v1/auth/forgot-password
    fastify.post('/forgot-password', {
        config: {
            rateLimit: { max: 5, timeWindow: '15 minutes', keyGenerator: (r: any) => r.ip },
        },
        schema: {
            tags: ['Auth'],
            body: {
                type: 'object',
                required: ['email'],
                properties: { email: { type: 'string', format: 'email' } },
            },
        },
    }, async (request, reply) => {
        const { email } = validate(forgotPasswordSchema, request.body)
        const result = await requestPasswordReset(email)
        // Always 200 to avoid email enumeration; expose dev token only outside production.
        return reply.send({
            data: {
                sent: result.sent,
                ...(result.devToken ? { devToken: result.devToken } : {}),
            },
        })
    })

    // POST /api/v1/auth/reset-password
    fastify.post('/reset-password', {
        config: {
            rateLimit: { max: 10, timeWindow: '15 minutes', keyGenerator: (r: any) => r.ip },
        },
        schema: {
            tags: ['Auth'],
            body: {
                type: 'object',
                required: ['token', 'password'],
                properties: {
                    token: { type: 'string', minLength: 32 },
                    password: { type: 'string', minLength: 8 },
                },
            },
        },
    }, async (request, reply) => {
        const { token, password } = validate(resetPasswordSchema, request.body)
        const result = await resetPasswordWithToken(token, password)
        if (!result.ok) {
            const message =
                result.reason === 'token_expired' ? 'This reset link has expired. Please request a new one.'
                    : result.reason === 'token_used' ? 'This reset link has already been used.'
                        : 'Invalid or expired token.'
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message })
        }
        return reply.send({ data: { ok: true } })
    })

    // POST /api/v1/auth/change-password
    fastify.post('/change-password', {
        schema: {
            tags: ['Auth'],
            body: {
                type: 'object',
                required: ['currentPassword', 'newPassword'],
                properties: {
                    currentPassword: { type: 'string', minLength: 6 },
                    newPassword: { type: 'string', minLength: 8 },
                },
            },
        },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const { currentPassword, newPassword } = validate(changePasswordSchema, request.body)
        const userId = request.user.id
        const result = await changePassword(userId, currentPassword, newPassword)
        if (!result.ok) {
            const message =
                result.reason === 'invalid_current' ? 'Current password is incorrect.'
                    : result.reason === 'weak_password' ? 'New password must be at least 8 characters.'
                        : 'Unable to change password.'
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message })
        }
        auditSelfEvent(request, 'password-change', 'update', 'Password')
        return reply.send({ data: { ok: true } })
    })

    // ── 2FA / TOTP routes ────────────────────────────────────────────────
    const auth = { preHandler: [fastify.authenticate] }

    // POST /api/v1/auth/2fa/challenge — complete login when 2FA is enabled (no auth required)
    fastify.post('/2fa/challenge', {
        config: {
            rateLimit: { max: 10, timeWindow: '15 minutes', keyGenerator: (r: any) => r.ip },
        },
        schema: {
            tags: ['Auth'],
            body: {
                type: 'object',
                required: ['mfaToken', 'code'],
                properties: {
                    mfaToken: { type: 'string' },
                    code: { type: 'string', minLength: 6, maxLength: 6 },
                },
            },
        },
    }, async (request: any, reply: any) => {
        const { mfaToken, code } = request.body as { mfaToken: string; code: string }
        let payload: any
        try {
            payload = fastify.jwt.verify(mfaToken)
        } catch {
            return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or expired MFA session.' })
        }
        if (payload?.purpose !== 'mfa-pending') {
            return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid MFA token.' })
        }
        const ipAddress = request.ip ?? request.headers['x-forwarded-for'] as string
        const userAgent = request.headers['user-agent']
        const result = await completeMfaLogin(fastify, payload.sub, code, { ipAddress, userAgent })
        if (!result) {
            return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or expired MFA code.' })
        }
        return reply.send({ data: result })
    })

    // GET /api/v1/auth/2fa/status
    fastify.get('/2fa/status', auth, async (request: any, reply: any) => {
        const status = await getTotpStatus(request.user.id)
        return reply.send({ data: status })
    })

    // POST /api/v1/auth/2fa/setup — generate secret + QR code
    fastify.post('/2fa/setup', auth, async (request: any, reply: any) => {
        const result = await setupTotp(request.user.id)
        return reply.send({ data: { qrDataUrl: result.qrDataUrl, secret: result.secret } })
    })

    // POST /api/v1/auth/2fa/verify — confirm token to activate 2FA
    fastify.post('/2fa/verify', auth, async (request: any, reply: any) => {
        const { token } = request.body as { token: string }
        if (!token) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'token is required' })
        const result = await verifyAndEnableTotp(request.user.id, token)
        if (!result.enabled) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid or expired token' })
        auditSelfEvent(request, '2fa-enable', 'update', 'Two-factor authentication')
        // Return plaintext backup codes ONCE — user must save them now
        return reply.send({ data: { enabled: true, backupCodes: result.backupCodes ?? [] } })
    })

    // POST /api/v1/auth/2fa/disable — disable 2FA (requires current TOTP token)
    fastify.post('/2fa/disable', auth, async (request: any, reply: any) => {
        const { token } = request.body as { token: string }
        if (!token) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'token is required' })
        const ok = await disableTotp(request.user.id, token)
        if (!ok) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid token or 2FA not enabled' })
        auditSelfEvent(request, '2fa-disable', 'update', 'Two-factor authentication')
        return reply.send({ data: { enabled: false } })
    })

    // POST /api/v1/auth/2fa/backup-codes/regenerate — issue a fresh set, invalidates old codes.
    // Requires a valid TOTP code as proof of identity.
    fastify.post('/2fa/backup-codes/regenerate', auth, async (request: any, reply: any) => {
        const { token } = request.body as { token: string }
        if (!token) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'token is required' })
        const codes = await regenerateBackupCodes(request.user.id, token)
        if (!codes) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid token or 2FA not enabled' })
        return reply.send({ data: { backupCodes: codes } })
    })

    // POST /api/v1/auth/2fa/backup-challenge — complete login using a single-use backup code
    fastify.post('/2fa/backup-challenge', {
        config: {
            rateLimit: { max: 10, timeWindow: '15 minutes', keyGenerator: (r: any) => r.ip },
        },
        schema: {
            tags: ['Auth'],
            body: {
                type: 'object',
                required: ['mfaToken', 'code'],
                properties: {
                    mfaToken: { type: 'string' },
                    code: { type: 'string', minLength: 8, maxLength: 32 },
                },
            },
        },
    }, async (request: any, reply: any) => {
        const { mfaToken, code } = request.body as { mfaToken: string; code: string }
        let payload: any
        try {
            payload = fastify.jwt.verify(mfaToken)
        } catch {
            return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or expired MFA session.' })
        }
        if (payload?.purpose !== 'mfa-pending') {
            return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid MFA token.' })
        }
        const ipAddress = request.ip ?? request.headers['x-forwarded-for'] as string
        const userAgent = request.headers['user-agent']
        const result = await completeMfaLoginWithBackupCode(fastify, payload.sub, code, { ipAddress, userAgent })
        if (!result) {
            return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid backup code or already used.' })
        }
        return reply.send({ data: result })
    })

    // PATCH /api/v1/auth/me — update own name / department
    fastify.patch('/me', {
        preHandler: [fastify.authenticate],
        schema: {
            tags: ['Auth'],
            body: {
                type: 'object',
                properties: {
                    firstName: { type: 'string', minLength: 1, maxLength: 60 },
                    lastName:  { type: 'string', minLength: 1, maxLength: 60 },
                    name: { type: 'string', minLength: 2, maxLength: 120 },
                    department: { type: 'string', maxLength: 120, nullable: true },
                },
                additionalProperties: false,
            },
        },
    }, async (request: any, reply: any) => {
        const body = request.body as { firstName?: string; lastName?: string; name?: string; department?: string | null }
        const patch: Record<string, unknown> = { updatedAt: new Date() }
        if (typeof body.firstName === 'string') patch.firstName = body.firstName.trim()
        if (typeof body.lastName === 'string')  patch.lastName  = body.lastName.trim()
        if (typeof body.firstName === 'string' || typeof body.lastName === 'string') {
            const fn = (body.firstName ?? (patch.firstName as string | undefined)) ?? ''
            const ln = (body.lastName  ?? (patch.lastName  as string | undefined)) ?? ''
            if (fn || ln) patch.name = `${fn} ${ln}`.trim()
        }
        if (typeof body.name === 'string' && !patch.name) patch.name = body.name.trim()
        if (body.department !== undefined) patch.department = body.department
        if (Object.keys(patch).length === 1) {
            return reply.code(400).send({ message: 'No fields to update' })
        }
        const [updated] = await db.update(users).set(patch as never).where(eq(users.id, request.user.id)).returning({
            id: users.id, firstName: users.firstName, lastName: users.lastName, name: users.name,
            email: users.email, role: users.role, tenantId: users.tenantId,
            department: users.department, avatarUrl: users.avatarUrl,
        })
        if (!updated) return reply.code(404).send({ message: 'User not found' })
        const avatarUrl = (await resolveAvatarUrl(updated.avatarUrl)) ?? updated.avatarUrl
        return reply.send({ data: { ...updated, avatarUrl } })
    })

    // POST /api/v1/auth/me/avatar — upload own profile image to S3
    fastify.post('/me/avatar', {
        preHandler: [fastify.authenticate],
        schema: { tags: ['Auth'] },
    }, async (request: any, reply: any) => {
        const part = await request.file()
        if (!part) return reply.code(400).send({ message: 'No file provided' })

        const chunks: Buffer[] = []
        for await (const chunk of part.file) chunks.push(chunk as Buffer)
        const buffer = Buffer.concat(chunks)

        const allowedMime: Record<string, string> = {
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/webp': '.webp',
            'image/gif': '.gif',
        }
        const detected = await fileTypeFromBuffer(buffer)
        if (!detected || !allowedMime[detected.mime]) {
            return reply.code(415).send({ message: 'Only JPEG, PNG, WEBP, or GIF images are allowed' })
        }

        const safeName = `avatar${allowedMime[detected.mime]}`
        const s3Key = buildS3Key(request.user.tenantId, `users/${request.user.id}/avatar`, safeName)

        try {
            await uploadObject(s3Key, buffer, detected.mime)
        } catch (err: any) {
            request.log.error({ err }, 'S3 user avatar upload failed')
            return reply.code(503).send({ message: 'File storage service is unavailable. Please try again later.' })
        }

        await db.update(users).set({ avatarUrl: s3Key, updatedAt: new Date() }).where(eq(users.id, request.user.id))

        // Sync avatar to the linked employee record
        if (request.user.employeeId) {
            await db.update(employees)
                .set({ avatarUrl: s3Key, updatedAt: new Date() })
                .where(and(eq(employees.id, request.user.employeeId), eq(employees.tenantId, request.user.tenantId)))
                .catch(() => { })
        }

        const presignedUrl = await generateDownloadUrl(s3Key, 86400)
        return reply.send({ data: { avatarUrl: presignedUrl } })
    })
}

