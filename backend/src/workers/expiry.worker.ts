import { Queue, Worker } from 'bullmq'
import { db } from '../db/index.js'
import { employees, notifications, documents } from '../db/schema/index.js'
import { and, eq, lt, lte, gte, ne } from 'drizzle-orm'
import { loadEnv } from '../config/env.js'
import { sendEmail, emailVisaExpiry } from '../lib/email.js'

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

// ─── Queue definitions ────────────────────────────────────────────────────────
export const visaExpiryQueue = new Queue('visa-expiry', { connection })
export const documentExpiryQueue = new Queue('document-expiry', { connection })
export const contractExpiryQueue = new Queue('contract-expiry', { connection })
export const passportExpiryQueue = new Queue('passport-expiry', { connection })

// ─── Helpers ──────────────────────────────────────────────────────────────────
function daysFromNow(days: number): Date {
    const d = new Date()
    d.setDate(d.getDate() + days)
    return d
}

async function createNotification(tenantId: string, _employeeId: string | null, type: string, title: string, message: string, _severity: string = 'warning') {
    try {
        await db.insert(notifications).values({
            tenantId,
            type: type as 'info' | 'warning' | 'error' | 'success',
            title,
            message,
            isRead: false,
        })
    } catch {
        // ignore duplicate notifications
    }
}

// ─── Visa Expiry Worker ───────────────────────────────────────────────────────
async function runVisaExpiryCheck() {
    console.log('[worker] Running visa expiry check...')
    const thresholds = [90, 60, 30, 14, 7]
    const today = new Date()

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
            const severity = days <= 7 ? 'critical' : days <= 30 ? 'warning' : 'info'

            await createNotification(
                emp.tenantId,
                emp.id,
                'warning',
                `Visa Expiring in ${days} days`,
                `${name}'s ${visaType} visa expires on ${expiryDate}`,
                severity,
            )

            // Send email to HR managers
            try {
                const hrManagers = await db.select({
                    name: employees.firstName,
                    email: employees.workEmail,
                }).from(employees)
                    .where(and(
                        eq(employees.tenantId, emp.tenantId),
                        eq(employees.status, 'active'),
                    ))
                    .limit(3)

                for (const manager of hrManagers) {
                    if (manager.email) {
                        await sendEmail({
                            to: manager.email,
                            subject: `⚠️ Visa Expiry Alert: ${name} — ${days} days`,
                            html: emailVisaExpiry(manager.name ?? 'HR Manager', name, visaType, expiryDate, days),
                        })
                    }
                }
            } catch { /* email errors non-fatal */ }
        }
    }
    console.log('[worker] Visa expiry check complete.')
}

// ─── Document Expiry Worker ───────────────────────────────────────────────────
async function runDocumentExpiryCheck() {
    console.log('[worker] Running document expiry check...')
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
            await createNotification(
                doc.tenantId,
                doc.employeeId,
                days <= 30 ? 'warning' : 'info',
                `Document Expiring in ${days} days`,
                `${doc.docType}: ${doc.fileName} expires on ${doc.expiryDate}`,
            )

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

    console.log('[worker] Document expiry check complete.')
}

// ─── Contract Expiry Worker ───────────────────────────────────────────────────
async function runContractExpiryCheck() {
    console.log('[worker] Running contract expiry check...')
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
            await createNotification(
                emp.tenantId,
                emp.id,
                days <= 30 ? 'warning' : 'info',
                `Contract Expiring in ${days} days`,
                `${emp.firstName} ${emp.lastName}'s contract (${emp.designation ?? 'Employee'}) expires on ${emp.contractEndDate}`,
            )
        }
    }
    console.log('[worker] Contract expiry check complete.')
}

// ─── Passport Expiry Worker ───────────────────────────────────────────────────
async function runPassportExpiryCheck() {
    console.log('[worker] Running passport expiry check...')
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
            await createNotification(
                emp.tenantId,
                emp.id,
                'warning',
                `Passport Expiring in ${days} days`,
                `${emp.firstName} ${emp.lastName}'s passport expires on ${emp.passportExpiry}`,
            )
        }
    }
    console.log('[worker] Passport expiry check complete.')
}

// ─── Scheduler: Register all daily workers ────────────────────────────────────
export async function startExpiryWorkers() {
    try {
        // Enqueue recurring daily jobs at 06:00 UAE time (UTC+4 = 02:00 UTC)
        await visaExpiryQueue.upsertJobScheduler('daily-visa-check', { pattern: '0 2 * * *' }, { name: 'visa-expiry' })
        await documentExpiryQueue.upsertJobScheduler('daily-doc-check', { pattern: '0 2 * * *' }, { name: 'document-expiry' })
        await contractExpiryQueue.upsertJobScheduler('daily-contract-check', { pattern: '0 2 * * *' }, { name: 'contract-expiry' })
        await passportExpiryQueue.upsertJobScheduler('daily-passport-check', { pattern: '0 2 * * *' }, { name: 'passport-expiry' })

        // Process workers
        new Worker('visa-expiry', runVisaExpiryCheck, { connection })
        new Worker('document-expiry', runDocumentExpiryCheck, { connection })
        new Worker('contract-expiry', runContractExpiryCheck, { connection })
        new Worker('passport-expiry', runPassportExpiryCheck, { connection })

        console.log('✅ Expiry alert workers started (daily @ 06:00 UAE)')
    } catch (err) {
        console.warn('⚠️  Could not start BullMQ workers (Redis unavailable):', (err as Error).message)
    }
}
