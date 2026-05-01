import { Queue, Worker } from 'bullmq'
import { log } from '../lib/logger.js'
import { db } from '../db/index.js'
import { employees, notifications, documents, users, onboardingSteps } from '../db/schema/index.js'
import { and, eq, lt, lte, gte, ne, inArray } from 'drizzle-orm'
import { loadEnv } from '../config/env.js'
import { sendEmail, visaExpiryAlertEmail, documentExpiryAlertEmail } from '../plugins/email.js'
import { sendSubscriptionExpiryReminders } from '../modules/subscription/subscription.service.js'

function getRedisConnection() {
    const env = loadEnv()
    const url = new URL(env.REDIS_URL)
    return {
        host: url.hostname,
        port: Number(url.port ?? 6379),
        password: url.password || undefined,
        enableReadyCheck: false,
        maxRetriesPerRequest: null,
    }
}

const connection = getRedisConnection()

// ─── Queue definitions (lazy — created inside startExpiryWorkers) ─────────────
export let visaExpiryQueue: Queue | null = null
export let documentExpiryQueue: Queue | null = null
export let contractExpiryQueue: Queue | null = null
export let passportExpiryQueue: Queue | null = null
export let subscriptionExpiryQueue: Queue | null = null
export let onboardingOverdueQueue: Queue | null = null

// ─── Helpers ──────────────────────────────────────────────────────────────────
function daysFromNow(days: number): Date {
    const d = new Date()
    d.setDate(d.getDate() + days)
    return d
}

/**
 * Create a notification for every HR manager and PRO officer in the tenant.
 * Uses a daily deduplication check so re-running the worker doesn't create duplicates.
 */
async function notifyHrManagers(tenantId: string, entityId: string, notifType: string, title: string, message: string) {
    try {
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)

        // Deduplication: skip if we already sent this notification today
        const [existing] = await db.select({ id: notifications.id }).from(notifications)
            .where(and(
                eq(notifications.tenantId, tenantId),
                eq(notifications.title, title),
                eq(notifications.message, message),
                gte(notifications.createdAt, todayStart),
            ))
            .limit(1)
        if (existing) return

        // Find all HR managers and PRO officers for this tenant
        const hrUsers = await db.select({ id: users.id }).from(users)
            .where(and(
                eq(users.tenantId, tenantId),
                eq(users.isActive, true),
                inArray(users.role, ['hr_manager', 'pro_officer', 'super_admin'] as never[]),
            ))
            .limit(10)

        if (hrUsers.length === 0) {
            // Fall back to a tenant-wide broadcast (userId = null)
            await db.insert(notifications).values({
                tenantId,
                type: notifType as 'info' | 'warning' | 'error' | 'success',
                title,
                message,
                isRead: false,
            })
            return
        }

        for (const hrUser of hrUsers) {
            await db.insert(notifications).values({
                tenantId,
                userId: hrUser.id,
                type: notifType as 'info' | 'warning' | 'error' | 'success',
                title,
                message,
                isRead: false,
            })
        }
    } catch { /* non-fatal */ }
}

// ─── Visa Expiry Worker ───────────────────────────────────────────────────────
async function runVisaExpiryCheck() {
    log.info('worker: running visa expiry check')
    const thresholds = [90, 60, 30, 14, 7]

    for (const days of thresholds) {
        const target = daysFromNow(days)
        const startOfDay = new Date(target); startOfDay.setHours(0, 0, 0, 0)
        const endOfDay = new Date(target); endOfDay.setHours(23, 59, 59, 999)

        const expiringEmployees = await db.select({
            id: employees.id,
            tenantId: employees.tenantId,
            firstName: employees.firstName,
            lastName: employees.lastName,
            visaExpiry: employees.visaExpiry,
            visaType: employees.visaType,
        }).from(employees)
            .where(and(
                ne(employees.status, 'terminated'),
                eq(employees.isArchived, false),
                gte(employees.visaExpiry, startOfDay.toISOString().split('T')[0]),
                lte(employees.visaExpiry, endOfDay.toISOString().split('T')[0]),
            ))

        for (const emp of expiringEmployees) {
            const name = `${emp.firstName} ${emp.lastName}`
            const visaType = emp.visaType ?? 'Employment Visa'
            const expiryDate = emp.visaExpiry ?? ''
            const notifType = days <= 7 ? 'error' : days <= 30 ? 'warning' : 'info'
            const env = loadEnv()
            const frontendUrl = (env as any).APP_URL ?? ''

            await notifyHrManagers(
                emp.tenantId,
                emp.id,
                notifType,
                `Visa Expiring in ${days} Days`,
                `${name}'s ${visaType} expires on ${expiryDate}`,
            )

            // Send email to HR managers and PRO officers
            try {
                const hrManagers = await db.select({ name: users.name, email: users.email }).from(users)
                    .where(and(
                        eq(users.tenantId, emp.tenantId),
                        eq(users.isActive, true),
                        inArray(users.role, ['hr_manager', 'pro_officer']),
                    ))
                    .limit(5)

                for (const manager of hrManagers) {
                    if (manager.email) {
                        const emailOpts = visaExpiryAlertEmail({
                            recipientName: manager.name ?? 'HR Manager',
                            employeeName: name,
                            visaType,
                            expiryDate,
                            daysRemaining: days,
                            actionUrl: `${frontendUrl}/visas?employee=${emp.id}`,
                        })
                        await sendEmail({ ...emailOpts, to: manager.email })
                    }
                }
            } catch (err) { log.warn({ err }, 'worker: visa expiry email delivery failed') }
        }
    }
    log.info('worker: visa expiry check complete')
}

// ─── Document Expiry Worker ───────────────────────────────────────────────────
async function runDocumentExpiryCheck() {
    log.info('worker: running document expiry check')
    const thresholds = [90, 60, 30]

    for (const days of thresholds) {
        const target = daysFromNow(days)
        const startOfDay = new Date(target); startOfDay.setHours(0, 0, 0, 0)
        const endOfDay = new Date(target); endOfDay.setHours(23, 59, 59, 999)

        const expiringDocs = await db.select({
            id: documents.id,
            tenantId: documents.tenantId,
            employeeId: documents.employeeId,
            docType: documents.docType,
            fileName: documents.fileName,
            expiryDate: documents.expiryDate,
        }).from(documents)
            .where(and(
                gte(documents.expiryDate, startOfDay.toISOString().split('T')[0]),
                lte(documents.expiryDate, endOfDay.toISOString().split('T')[0]),
            ))

        for (const doc of expiringDocs) {
            await notifyHrManagers(
                doc.tenantId,
                doc.id,
                days <= 30 ? 'warning' : 'info',
                `Document Expiring in ${days} Days`,
                `${doc.docType}: ${doc.fileName} expires on ${doc.expiryDate}`,
            )

            // Email HR managers / PRO officers
            try {
                const env = loadEnv()
                const frontendUrl = (env as any).APP_URL ?? ''
                const actionUrl = frontendUrl ? `${frontendUrl}/documents/${doc.id}` : ''

                let employeeName = 'Unknown employee'
                if (doc.employeeId) {
                    const [emp] = await db.select({ firstName: employees.firstName, lastName: employees.lastName })
                        .from(employees).where(eq(employees.id, doc.employeeId)).limit(1)
                    if (emp) employeeName = `${emp.firstName} ${emp.lastName}`
                }

                const hrUsers = await db.select({ email: users.email, name: users.name })
                    .from(users)
                    .where(and(
                        eq(users.tenantId, doc.tenantId),
                        eq(users.isActive, true),
                        inArray(users.role, ['hr_manager', 'pro_officer', 'super_admin'] as never[]),
                    ))
                    .limit(10)

                for (const u of hrUsers) {
                    if (!u.email) continue
                    const opts = documentExpiryAlertEmail({
                        recipientName: u.name ?? 'HR',
                        employeeName,
                        docType: doc.docType ?? doc.fileName ?? 'Document',
                        expiryDate: doc.expiryDate ?? '',
                        daysRemaining: days,
                        actionUrl,
                    })
                    opts.to = u.email
                    sendEmail(opts).catch((err: unknown) => log.warn({ err }, 'worker: document expiry email delivery failed'))
                }
            } catch (err) { log.warn({ err }, 'worker: document expiry email setup failed') }

            // Update document status to expiring_soon
            await db.update(documents)
                .set({ status: 'expiring_soon' as any })
                .where(eq(documents.id, doc.id))
        }
    }

    // Mark expired documents
    await db.update(documents)
        .set({ status: 'expired' as any })
        .where(lt(documents.expiryDate, new Date().toISOString().split('T')[0]))

    log.info('worker: document expiry check complete')
}

// ─── Contract Expiry Worker ───────────────────────────────────────────────────
async function runContractExpiryCheck() {
    log.info('worker: running contract expiry check')
    const thresholds = [90, 30]

    for (const days of thresholds) {
        const target = daysFromNow(days)
        const startOfDay = new Date(target); startOfDay.setHours(0, 0, 0, 0)
        const endOfDay = new Date(target); endOfDay.setHours(23, 59, 59, 999)

        const expiring = await db.select({
            id: employees.id,
            tenantId: employees.tenantId,
            firstName: employees.firstName,
            lastName: employees.lastName,
            contractEndDate: employees.contractEndDate,
            designation: employees.designation,
        }).from(employees)
            .where(and(
                ne(employees.status, 'terminated'),
                eq(employees.isArchived, false),
                gte(employees.contractEndDate, startOfDay.toISOString().split('T')[0]),
                lte(employees.contractEndDate, endOfDay.toISOString().split('T')[0]),
            ))

        for (const emp of expiring) {
            await notifyHrManagers(
                emp.tenantId,
                emp.id,
                days <= 30 ? 'warning' : 'info',
                `Contract Expiring in ${days} Days`,
                `${emp.firstName} ${emp.lastName}'s contract (${emp.designation ?? 'Employee'}) expires on ${emp.contractEndDate}`,
            )
        }
    }
    log.info('worker: contract expiry check complete')
}

// ─── Passport Expiry Worker ───────────────────────────────────────────────────
async function runPassportExpiryCheck() {
    log.info('worker: running passport expiry check')
    const thresholds = [180, 90, 30]

    for (const days of thresholds) {
        const target = daysFromNow(days)
        const startOfDay = new Date(target); startOfDay.setHours(0, 0, 0, 0)
        const endOfDay = new Date(target); endOfDay.setHours(23, 59, 59, 999)

        const expiring = await db.select({
            id: employees.id,
            tenantId: employees.tenantId,
            firstName: employees.firstName,
            lastName: employees.lastName,
            passportExpiry: employees.passportExpiry,
        }).from(employees)
            .where(and(
                ne(employees.status, 'terminated'),
                eq(employees.isArchived, false),
                gte(employees.passportExpiry, startOfDay.toISOString().split('T')[0]),
                lte(employees.passportExpiry, endOfDay.toISOString().split('T')[0]),
            ))

        for (const emp of expiring) {
            await notifyHrManagers(
                emp.tenantId,
                emp.id,
                'warning',
                `Passport Expiring in ${days} Days`,
                `${emp.firstName} ${emp.lastName}'s passport expires on ${emp.passportExpiry}`,
            )
        }
    }
    log.info('worker: passport expiry check complete')
}

// ─── Subscription Expiry Worker ──────────────────────────────────────────────
async function runSubscriptionExpiryCheck() {
    log.info('worker: running subscription expiry check')
    // Send reminders at 7 days and 1 day before expiry
    await sendSubscriptionExpiryReminders(7)
    await sendSubscriptionExpiryReminders(1)
    log.info('worker: subscription expiry check complete')
}

// ─── Onboarding Overdue Worker ────────────────────────────────────────────────
async function runOnboardingOverdueCheck() {
    log.info('worker: marking overdue onboarding steps')
    const today = new Date().toISOString().split('T')[0]
    const { rowCount } = await db.update(onboardingSteps)
        .set({ status: 'overdue' as never })
        .where(and(
            eq(onboardingSteps.status, 'pending' as never),
            lt(onboardingSteps.dueDate, today),
        )) as unknown as { rowCount: number }
    log.info({ updated: rowCount ?? 0 }, 'worker: onboarding overdue check complete')
}

// ─── Scheduler: Register all daily workers ────────────────────────────────────
export async function startExpiryWorkers() {
    const env = loadEnv()
    if (!env.REDIS_URL) {
        log.warn('REDIS_URL not set — expiry alert workers disabled')
        return
    }

    // Test Redis availability first with a quick probe
    const { createConnection } = await import('net')
    const redisAvailable = await new Promise<boolean>((resolve) => {
        const url = new URL(env.REDIS_URL)
        const socket = createConnection({ host: url.hostname, port: Number(url.port ?? 6379) })
        socket.setTimeout(1000)
        socket.on('connect', () => { socket.destroy(); resolve(true) })
        socket.on('error', () => { socket.destroy(); resolve(false) })
        socket.on('timeout', () => { socket.destroy(); resolve(false) })
    })

    if (!redisAvailable) {
        log.warn('Redis unavailable — BullMQ workers disabled')
        return
    }

    try {
        // Lazily create queues so Redis connection errors are catchable
        visaExpiryQueue = new Queue('visa-expiry', { connection })
        documentExpiryQueue = new Queue('document-expiry', { connection })
        contractExpiryQueue = new Queue('contract-expiry', { connection })
        passportExpiryQueue = new Queue('passport-expiry', { connection })
        subscriptionExpiryQueue = new Queue('subscription-expiry', { connection })
        onboardingOverdueQueue = new Queue('onboarding-overdue', { connection })

        // Enqueue recurring daily jobs at 06:00 UAE time (UTC+4 = 02:00 UTC)
        await visaExpiryQueue.upsertJobScheduler('daily-visa-check', { pattern: '0 2 * * *' }, { name: 'visa-expiry' })
        await documentExpiryQueue.upsertJobScheduler('daily-doc-check', { pattern: '0 2 * * *' }, { name: 'document-expiry' })
        await contractExpiryQueue.upsertJobScheduler('daily-contract-check', { pattern: '0 2 * * *' }, { name: 'contract-expiry' })
        await passportExpiryQueue.upsertJobScheduler('daily-passport-check', { pattern: '0 2 * * *' }, { name: 'passport-expiry' })
        await subscriptionExpiryQueue.upsertJobScheduler('daily-subscription-check', { pattern: '0 2 * * *' }, { name: 'subscription-expiry' })
        await onboardingOverdueQueue.upsertJobScheduler('daily-onboarding-overdue', { pattern: '0 2 * * *' }, { name: 'onboarding-overdue' })

        // Process workers
        new Worker('visa-expiry', runVisaExpiryCheck, { connection })
        new Worker('document-expiry', runDocumentExpiryCheck, { connection })
        new Worker('contract-expiry', runContractExpiryCheck, { connection })
        new Worker('passport-expiry', runPassportExpiryCheck, { connection })
        new Worker('subscription-expiry', runSubscriptionExpiryCheck, { connection })
        new Worker('onboarding-overdue', runOnboardingOverdueCheck, { connection })

        log.info('expiry alert workers started (daily 06:00 UAE)')
    } catch (err) {
        log.warn({ err: (err as Error).message }, 'could not start BullMQ workers')
    }
}
