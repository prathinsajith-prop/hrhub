import { eq, and, count, inArray, desc, lte, gte, isNull } from 'drizzle-orm'
import { log } from '../../lib/logger.js'
import { db } from '../../db/index.js'
import { tenants, employees, subscriptionEvents, users } from '../../db/schema/index.js'
import { loadEnv } from '../../config/env.js'
import { sendEmail } from '../../plugins/email.js'
import Stripe from 'stripe'

// ─── Plan constants ───────────────────────────────────────────────────────────

export type PlanKey = 'starter' | 'growth' | 'enterprise'

export const PLAN_DISPLAY: Record<PlanKey, { name: string; description: string; color: string }> = {
    starter:    { name: 'Free',         description: 'Up to 5 employees, core HR features.',          color: '#6b7280' },
    growth:     { name: 'Professional', description: 'Scalable employee capacity, full feature set.',  color: '#2563eb' },
    enterprise: { name: 'Enterprise',   description: 'Unlimited employees, dedicated support.',        color: '#7c3aed' },
}

export const PROFESSIONAL_PRICE_PER_5 = 10
export const FREE_PLAN_QUOTA = 5

// ─── Event logging ────────────────────────────────────────────────────────────

interface LogEventParams {
    tenantId: string
    userId?: string | null
    eventType: 'upgrade_request' | 'enterprise_contact' | 'plan_activated' | 'quota_updated' | 'checkout_created'
    planFrom?: string
    planTo?: string
    employeeQuota?: number
    monthlyCost?: number
    stripeSessionId?: string
    contactName?: string
    contactEmail?: string
    metadata?: Record<string, unknown>
}

export async function logSubscriptionEvent(params: LogEventParams): Promise<void> {
    await db.insert(subscriptionEvents).values({
        tenantId: params.tenantId,
        userId: params.userId ?? null,
        eventType: params.eventType,
        planFrom: params.planFrom ?? null,
        planTo: params.planTo ?? null,
        employeeQuota: params.employeeQuota ?? null,
        monthlyCost: params.monthlyCost ?? null,
        stripeSessionId: params.stripeSessionId ?? null,
        contactName: params.contactName ?? null,
        contactEmail: params.contactEmail ?? null,
        metadata: params.metadata ?? {},
    })
}

export async function getSubscriptionEvents(tenantId: string, limit = 50) {
    return db
        .select()
        .from(subscriptionEvents)
        .where(eq(subscriptionEvents.tenantId, tenantId))
        .orderBy(desc(subscriptionEvents.createdAt))
        .limit(limit)
}

// ─── Email helper: send and log failure without throwing ─────────────────────

async function sendEmailLogged(opts: Parameters<typeof sendEmail>[0], context: string): Promise<void> {
    const result = await sendEmail(opts)
    if (!result.ok) {
        log.error({ context, to: opts.to, err: result.error }, 'subscription: email send failed')
    }
}

// ─── Stripe client (lazy-init, null if key not configured) ───────────────────

let _stripe: Stripe | null = null

function getStripe(): Stripe | null {
    const env = loadEnv()
    if (!env.STRIPE_SECRET_KEY) return null
    if (!_stripe) _stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2026-04-22.dahlia' })
    return _stripe
}

export function isStripeEnabled(): boolean {
    return !!loadEnv().STRIPE_SECRET_KEY
}

// ─── Quota helpers ────────────────────────────────────────────────────────────

export async function countActiveEmployees(tenantId: string): Promise<number> {
    const [{ total }] = await db
        .select({ total: count() })
        .from(employees)
        .where(and(
            eq(employees.tenantId, tenantId),
            eq(employees.isArchived, false),
            inArray(employees.status, ['active', 'probation', 'onboarding', 'suspended', 'visa_expired']),
        ))
    return Number(total)
}

export async function getQuotaInfo(tenantId: string) {
    const [tenant] = await db
        .select({
            subscriptionPlan: tenants.subscriptionPlan,
            employeeQuota: tenants.employeeQuota,
        })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1)

    if (!tenant) throw Object.assign(new Error('Tenant not found'), { statusCode: 404 })

    const plan = tenant.subscriptionPlan as PlanKey
    const quota: number | null = plan === 'enterprise' ? null : (tenant.employeeQuota ?? FREE_PLAN_QUOTA)
    const current = await countActiveEmployees(tenantId)
    const canAdd = quota === null || current < quota

    return { plan, quota, current, canAdd }
}

export async function enforceEmployeeQuota(tenantId: string): Promise<void> {
    const info = await getQuotaInfo(tenantId)
    if (!info.canAdd) {
        const planName = PLAN_DISPLAY[info.plan]?.name ?? info.plan
        const err = Object.assign(
            new Error(
                `Employee limit reached. Your ${planName} plan allows up to ${info.quota} employees ` +
                `(currently ${info.current}). Please upgrade to add more.`,
            ),
            { statusCode: 402, code: 'QUOTA_EXCEEDED', quota: info.quota, current: info.current, plan: info.plan },
        )
        throw err
    }
}

// ─── Pricing helpers ──────────────────────────────────────────────────────────

export function calculateProfessionalCost(employeeCount: number): number {
    return Math.ceil(employeeCount / 5) * PROFESSIONAL_PRICE_PER_5
}

// ─── Stripe Checkout ──────────────────────────────────────────────────────────

export interface CheckoutParams {
    tenantId: string
    tenantName: string
    userEmail: string
    userId?: string
    desiredQuota: number
    /** 'upgrade' = Free→Professional, 'quota_update' = change capacity on existing Professional plan */
    action: 'upgrade' | 'quota_update'
}

export async function createCheckoutSession(params: CheckoutParams): Promise<{ url: string }> {
    const stripe = getStripe()
    if (!stripe) {
        const err = new Error('Online payment is not available. Please use the upgrade request form or contact support.') as any
        err.statusCode = 400; err.name = 'Bad Request'; throw err
    }

    const env = loadEnv()
    const monthlyCost = calculateProfessionalCost(params.desiredQuota)
    const amountFils = monthlyCost * 100

    const productName = params.action === 'quota_update'
        ? 'HRHub Professional — Capacity Update'
        : 'HRHub Professional Plan'
    const productDesc = `${params.desiredQuota} employee capacity — 1 month`

    const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        customer_email: params.userEmail,
        line_items: [
            {
                price_data: {
                    currency: 'aed',
                    unit_amount: amountFils,
                    product_data: { name: productName, description: productDesc },
                },
                quantity: 1,
            },
        ],
        metadata: {
            tenantId: params.tenantId,
            tenantName: params.tenantName,
            desiredQuota: String(params.desiredQuota),
            userEmail: params.userEmail,
            action: params.action,
        },
        success_url: `${env.APP_URL}/settings/organization?tab=subscription&checkout=${params.action === 'quota_update' ? 'quota' : 'upgraded'}`,
        cancel_url: `${env.APP_URL}/settings/organization?tab=subscription`,
    })

    if (!session.url) throw Object.assign(new Error('Failed to create checkout session'), { statusCode: 502 })

    await logSubscriptionEvent({
        tenantId: params.tenantId,
        userId: params.userId,
        eventType: 'checkout_created',
        planFrom: params.action === 'quota_update' ? 'growth' : 'starter',
        planTo: 'growth',
        employeeQuota: params.desiredQuota,
        monthlyCost,
        stripeSessionId: session.id,
        contactEmail: params.userEmail,
        metadata: { sessionId: session.id, tenantName: params.tenantName, action: params.action },
    })

    return { url: session.url }
}

// ─── Webhook activation ───────────────────────────────────────────────────────

export async function activateProfessionalFromWebhook(
    tenantId: string,
    desiredQuota: number,
    tenantName: string,
    userEmail: string,
    stripeSessionId?: string,
    action: 'upgrade' | 'quota_update' = 'upgrade',
): Promise<void> {
    const [tenant] = await db
        .select({ subscriptionPlan: tenants.subscriptionPlan })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1)

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30)

    await db
        .update(tenants)
        .set({
            subscriptionPlan: 'growth',
            employeeQuota: desiredQuota,
            subscriptionExpiresAt: expiresAt,
            updatedAt: new Date(),
        })
        .where(eq(tenants.id, tenantId))

    const monthlyCost = calculateProfessionalCost(desiredQuota)
    const invoiceRef = generateInvoiceRef(stripeSessionId)
    const eventType = action === 'quota_update' ? 'quota_updated' : 'plan_activated'

    await logSubscriptionEvent({
        tenantId,
        eventType,
        planFrom: tenant?.subscriptionPlan ?? 'starter',
        planTo: 'growth',
        employeeQuota: desiredQuota,
        monthlyCost,
        stripeSessionId,
        contactEmail: userEmail,
        metadata: { tenantName, activatedVia: 'stripe_webhook', action, invoiceRef },
    })

    if (userEmail) {
        const subject = action === 'quota_update'
            ? `Invoice ${invoiceRef} — HRHub capacity update`
            : `Invoice ${invoiceRef} — HRHub Professional plan activated`
        await sendEmailLogged({
            to: userEmail,
            subject,
            html: subscriptionInvoiceEmail({
                tenantName,
                ownerEmail: userEmail,
                invoiceRef,
                paidOn: new Date(),
                expiresAt,
                desiredQuota,
                monthlyCost,
                action,
                paymentMethod: 'Card (Stripe)',
            }),
        }, `invoice_${action}`)
    }
}

export async function verifyStripeWebhook(payload: Buffer, signature: string): Promise<Stripe.Event> {
    const stripe = getStripe()
    if (!stripe) {
        const err = new Error('Stripe webhook not configured') as any
        err.statusCode = 400; err.name = 'Bad Request'; throw err
    }
    const env = loadEnv()
    return stripe.webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET)
}

// ─── Quota update (existing Professional tenants) ────────────────────────────

export interface QuotaUpdateParams {
    tenantId: string
    tenantName: string
    newQuota: number
    requestorName: string
    requestorEmail: string
    userId?: string
}

export async function updateProfessionalQuota(params: QuotaUpdateParams): Promise<void> {
    const [tenant] = await db
        .select({ subscriptionPlan: tenants.subscriptionPlan, employeeQuota: tenants.employeeQuota })
        .from(tenants)
        .where(eq(tenants.id, params.tenantId))
        .limit(1)

    if (!tenant) throw Object.assign(new Error('Tenant not found'), { statusCode: 404 })
    if (tenant.subscriptionPlan !== 'growth') {
        const err = new Error('Quota updates are only available on the Professional plan') as any
        err.statusCode = 400
        err.name = 'Bad Request'
        throw err
    }

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30)

    const monthlyCost = calculateProfessionalCost(params.newQuota)
    const invoiceRef = generateInvoiceRef()

    await db
        .update(tenants)
        .set({ employeeQuota: params.newQuota, subscriptionExpiresAt: expiresAt, updatedAt: new Date() })
        .where(eq(tenants.id, params.tenantId))

    await logSubscriptionEvent({
        tenantId: params.tenantId,
        userId: params.userId,
        eventType: 'quota_updated',
        planFrom: 'growth',
        planTo: 'growth',
        employeeQuota: params.newQuota,
        monthlyCost,
        contactEmail: params.requestorEmail,
        contactName: params.requestorName,
        metadata: { previousQuota: tenant.employeeQuota, tenantName: params.tenantName, invoiceRef },
    })

    await sendEmailLogged({
        to: params.requestorEmail,
        subject: `Invoice ${invoiceRef} — HRHub capacity updated`,
        html: subscriptionInvoiceEmail({
            tenantName: params.tenantName,
            ownerEmail: params.requestorEmail,
            invoiceRef,
            paidOn: new Date(),
            expiresAt,
            desiredQuota: params.newQuota,
            monthlyCost,
            action: 'quota_update',
            paymentMethod: 'Manual / Admin',
        }),
    }, 'quota_update_invoice')
}

// ─── Upgrade request (fallback when Stripe not configured) ───────────────────

export interface UpgradeRequestParams {
    tenantId: string
    tenantName: string
    requestorName: string
    requestorEmail: string
    desiredQuota: number
    userId?: string
}

export interface EnterpriseContactParams {
    tenantId: string
    tenantName: string
    contactName: string
    contactEmail: string
    companySize: string
    message: string
    userId?: string
}

export async function sendUpgradeRequest(params: UpgradeRequestParams) {
    const env = loadEnv()
    const salesEmail = env.SALES_EMAIL
    const monthlyCost = calculateProfessionalCost(params.desiredQuota)

    // Save to DB first — this is the authoritative record regardless of email outcome
    await logSubscriptionEvent({
        tenantId: params.tenantId,
        userId: params.userId,
        eventType: 'upgrade_request',
        planFrom: 'starter',
        planTo: 'growth',
        employeeQuota: params.desiredQuota,
        monthlyCost,
        contactEmail: params.requestorEmail,
        contactName: params.requestorName,
        metadata: { tenantName: params.tenantName },
    })

    // Notify sales team
    if (salesEmail) {
        await sendEmailLogged({
            to: salesEmail,
            subject: `[HRHub] Upgrade Request — ${params.tenantName}`,
            html: upgradeRequestSalesEmail({ ...params, monthlyCost }),
        }, 'upgrade_request_sales')
    }

    // Confirmation to the requestor — this is what the user sees, so throw if it fails
    const confirmResult = await sendEmail({
        to: params.requestorEmail,
        subject: 'Your Professional plan upgrade request has been received',
        html: upgradeRequestConfirmationEmail({ ...params, monthlyCost }),
    })
    if (!confirmResult.ok) {
        log.error({ tenantId: params.tenantId, err: confirmResult.error }, 'subscription: upgrade confirmation email failed')
    }

    return { monthlyCost, desiredQuota: params.desiredQuota }
}

export async function sendEnterpriseContact(params: EnterpriseContactParams) {
    const env = loadEnv()
    const salesEmail = env.SALES_EMAIL

    // Save to DB first
    await logSubscriptionEvent({
        tenantId: params.tenantId,
        userId: params.userId,
        eventType: 'enterprise_contact',
        planFrom: undefined,
        planTo: 'enterprise',
        contactEmail: params.contactEmail,
        contactName: params.contactName,
        metadata: {
            tenantName: params.tenantName,
            companySize: params.companySize,
            message: params.message,
        },
    })

    if (salesEmail) {
        await sendEmailLogged({
            to: salesEmail,
            subject: `[HRHub] Enterprise Inquiry — ${params.tenantName}`,
            html: enterpriseContactSalesEmail(params),
        }, 'enterprise_contact_sales')
    }

    const confirmResult = await sendEmail({
        to: params.contactEmail,
        subject: 'Thanks for your interest in HRHub Enterprise',
        html: enterpriseContactConfirmationEmail(params),
    })
    if (!confirmResult.ok) {
        log.error({ tenantId: params.tenantId, err: confirmResult.error }, 'subscription: enterprise contact email failed')
    }
}

// ─── Subscription expiry reminders ───────────────────────────────────────────

/**
 * Query all Professional tenants expiring in exactly `daysAhead` days and
 * send an expiry reminder email to the tenant's super_admin owner.
 * Called by the BullMQ subscription expiry worker.
 */
export async function sendSubscriptionExpiryReminders(daysAhead: number): Promise<void> {
    const env = loadEnv()
    const target = new Date()
    target.setDate(target.getDate() + daysAhead)
    const startOfDay = new Date(target); startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(target); endOfDay.setHours(23, 59, 59, 999)

    const expiring = await db
        .select({
            id: tenants.id,
            name: tenants.name,
            employeeQuota: tenants.employeeQuota,
            subscriptionExpiresAt: tenants.subscriptionExpiresAt,
        })
        .from(tenants)
        .where(and(
            eq(tenants.subscriptionPlan, 'growth'),
            gte(tenants.subscriptionExpiresAt, startOfDay),
            lte(tenants.subscriptionExpiresAt, endOfDay),
        ))

    for (const tenant of expiring) {
        const [owner] = await db
            .select({ name: users.name, email: users.email })
            .from(users)
            .where(and(
                eq(users.tenantId, tenant.id),
                eq(users.role, 'super_admin'),
                eq(users.isActive, true),
            ))
            .limit(1)

        if (!owner?.email) continue

        const expiryDateStr = tenant.subscriptionExpiresAt
            ? new Date(tenant.subscriptionExpiresAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
            : ''

        const monthlyCost = calculateProfessionalCost(tenant.employeeQuota ?? FREE_PLAN_QUOTA)
        const renewUrl = `${env.APP_URL}/settings/organization?tab=subscription`

        await sendEmailLogged({
            to: owner.email,
            subject: daysAhead <= 1
                ? `Action required: Your HRHub subscription expires tomorrow`
                : `Reminder: Your HRHub subscription expires in ${daysAhead} days`,
            html: subscriptionExpiryReminderEmail({
                ownerName: owner.name ?? 'Account Owner',
                tenantName: tenant.name,
                daysRemaining: daysAhead,
                expiryDate: expiryDateStr,
                quota: tenant.employeeQuota ?? FREE_PLAN_QUOTA,
                monthlyCost,
                renewUrl,
            }),
        }, `subscription_expiry_${daysAhead}d`)
    }

    log.info({ count: expiring.length, daysAhead }, 'subscription: expiry reminders sent')
}

// ─── Invoice ref generator ────────────────────────────────────────────────────

function generateInvoiceRef(stripeSessionId?: string): string {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const suffix = stripeSessionId
        ? stripeSessionId.slice(-6).toUpperCase()
        : Math.random().toString(36).slice(2, 8).toUpperCase()
    return `INV-${datePart}-${suffix}`
}

// ─── Test email sender (for admin verification) ───────────────────────────────

export async function sendTestSubscriptionEmail(
    to: string,
    type: 'invoice' | 'expiry_reminder',
    ownerName: string,
    tenantName: string,
): Promise<{ ok: boolean; error?: string }> {
    const env = loadEnv()
    if (type === 'invoice') {
        const invoiceRef = generateInvoiceRef()
        const expiresAt = new Date(); expiresAt.setDate(expiresAt.getDate() + 30)
        return sendEmail({
            to,
            subject: `[TEST] Invoice ${invoiceRef} — HRHub Professional plan`,
            html: subscriptionInvoiceEmail({
                tenantName,
                ownerEmail: to,
                invoiceRef,
                paidOn: new Date(),
                expiresAt,
                desiredQuota: 25,
                monthlyCost: 50,
                action: 'upgrade',
                paymentMethod: 'Card (Test)',
            }),
        })
    }
    // expiry_reminder
    const expiryDate = new Date(); expiryDate.setDate(expiryDate.getDate() + 7)
    const expiryDateStr = expiryDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    return sendEmail({
        to,
        subject: `[TEST] Reminder: Your HRHub subscription expires in 7 days`,
        html: subscriptionExpiryReminderEmail({
            ownerName,
            tenantName,
            daysRemaining: 7,
            expiryDate: expiryDateStr,
            quota: 25,
            monthlyCost: 50,
            renewUrl: `${env.APP_URL}/settings/organization?tab=subscription`,
        }),
    })
}

// ─── Email templates ──────────────────────────────────────────────────────────

function activationConfirmationEmail(p: { tenantName: string; desiredQuota: number; monthlyCost: number }): string {
    return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;padding:32px;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
  <div style="background:#ecfdf5;border-left:4px solid #10b981;padding:12px 16px;border-radius:4px;margin-bottom:20px;">
    <strong style="color:#047857;">Professional plan activated</strong>
  </div>
  <h2 style="color:#111827;margin-top:0;">Your Professional plan is live!</h2>
  <p style="color:#6b7280;"><strong>${p.tenantName}</strong> is now on the <strong>Professional plan</strong> with capacity for <strong>${p.desiredQuota} employees</strong>.</p>
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:20px;margin:20px 0;">
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">Plan</td><td style="padding:6px 0;font-weight:600;color:#2563eb;">Professional</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">Employee capacity</td><td style="padding:6px 0;font-weight:600;color:#111827;">${p.desiredQuota} employees</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">Monthly billing</td><td style="padding:6px 0;font-weight:700;color:#111827;font-size:16px;">AED ${p.monthlyCost}</td></tr>
    </table>
  </div>
  <p style="color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb;margin-top:24px;padding-top:16px;">HRHub &mdash; UAE HR & PRO Platform</p>
</div>
</body></html>`
}

function quotaUpdatedViaStripeEmail(p: { tenantName: string; desiredQuota: number; monthlyCost: number }): string {
    return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;padding:32px;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
  <div style="background:#eff6ff;border-left:4px solid #2563eb;padding:12px 16px;border-radius:4px;margin-bottom:20px;">
    <strong style="color:#1d4ed8;">Employee capacity updated</strong>
  </div>
  <h2 style="color:#111827;margin-top:0;">Capacity updated for ${p.tenantName}</h2>
  <p style="color:#6b7280;">Your payment was successful. Your Professional plan has been updated with the new employee capacity.</p>
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:20px;margin:20px 0;">
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">New capacity</td><td style="padding:6px 0;font-weight:600;color:#111827;">${p.desiredQuota} employees</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">Monthly billing</td><td style="padding:6px 0;font-weight:700;color:#111827;font-size:16px;">AED ${p.monthlyCost}</td></tr>
    </table>
  </div>
  <p style="color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb;margin-top:24px;padding-top:16px;">HRHub &mdash; UAE HR & PRO Platform</p>
</div>
</body></html>`
}

function quotaUpdatedEmail(p: QuotaUpdateParams): string {
    const monthlyCost = calculateProfessionalCost(p.newQuota)
    return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;padding:32px;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
  <div style="background:#eff6ff;border-left:4px solid #2563eb;padding:12px 16px;border-radius:4px;margin-bottom:20px;">
    <strong style="color:#1d4ed8;">Employee capacity updated</strong>
  </div>
  <h2 style="color:#111827;margin-top:0;">Hi ${p.requestorName},</h2>
  <p style="color:#6b7280;">Your employee capacity for <strong>${p.tenantName}</strong> has been updated successfully.</p>
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:20px;margin:20px 0;">
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">New capacity</td><td style="padding:6px 0;font-weight:600;color:#111827;">${p.newQuota} employees</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">New monthly cost</td><td style="padding:6px 0;font-weight:700;color:#111827;font-size:16px;">AED ${monthlyCost}</td></tr>
    </table>
  </div>
  <p style="color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb;margin-top:24px;padding-top:16px;">HRHub &mdash; UAE HR & PRO Platform</p>
</div>
</body></html>`
}

function upgradeRequestSalesEmail(p: UpgradeRequestParams & { monthlyCost: number }): string {
    return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;padding:32px;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
  <div style="background:#eff6ff;border-left:4px solid #2563eb;padding:12px 16px;border-radius:4px;margin-bottom:20px;">
    <strong style="color:#1d4ed8;">New Professional Plan Upgrade Request</strong>
  </div>
  <h2 style="color:#111827;margin-top:0;">Upgrade Request from ${p.tenantName}</h2>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;">
    <tr><td style="padding:8px 0;color:#9ca3af;font-size:13px;width:140px;">Company</td><td style="padding:8px 0;font-weight:600;color:#111827;">${p.tenantName}</td></tr>
    <tr><td style="padding:8px 0;color:#9ca3af;font-size:13px;">Tenant ID</td><td style="padding:8px 0;color:#374151;font-size:12px;font-family:monospace;">${p.tenantId}</td></tr>
    <tr><td style="padding:8px 0;color:#9ca3af;font-size:13px;">Requestor</td><td style="padding:8px 0;font-weight:600;color:#111827;">${p.requestorName}</td></tr>
    <tr><td style="padding:8px 0;color:#9ca3af;font-size:13px;">Email</td><td style="padding:8px 0;color:#2563eb;">${p.requestorEmail}</td></tr>
    <tr><td style="padding:8px 0;color:#9ca3af;font-size:13px;">Desired Employees</td><td style="padding:8px 0;font-weight:700;color:#111827;font-size:16px;">${p.desiredQuota} employees</td></tr>
    <tr><td style="padding:8px 0;color:#9ca3af;font-size:13px;">Monthly Cost</td><td style="padding:8px 0;font-weight:700;color:#2563eb;font-size:16px;">AED ${p.monthlyCost} / month</td></tr>
  </table>
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin:16px 0;">
    <p style="margin:0;color:#6b7280;font-size:13px;">Action required: Update this tenant's <code style="background:#e5e7eb;padding:2px 4px;border-radius:3px;">subscription_plan</code> to <strong>growth</strong> and set <code style="background:#e5e7eb;padding:2px 4px;border-radius:3px;">employee_quota</code> to <strong>${p.desiredQuota}</strong> once payment is confirmed.</p>
  </div>
  <p style="color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb;margin-top:24px;padding-top:16px;">HRHub &mdash; UAE HR & PRO Platform</p>
</div>
</body></html>`
}

function upgradeRequestConfirmationEmail(p: UpgradeRequestParams & { monthlyCost: number }): string {
    return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;padding:32px;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
  <div style="background:#ecfdf5;border-left:4px solid #10b981;padding:12px 16px;border-radius:4px;margin-bottom:20px;">
    <strong style="color:#047857;">Upgrade request received</strong>
  </div>
  <h2 style="color:#111827;margin-top:0;">Hi ${p.requestorName},</h2>
  <p style="color:#6b7280;">Thank you for your interest in upgrading <strong>${p.tenantName}</strong> to the <strong>Professional plan</strong>. Our team has received your request and will be in touch within 1 business day.</p>
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:20px;margin:20px 0;">
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">Plan</td><td style="padding:6px 0;font-weight:600;color:#2563eb;">Professional</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">Employee capacity</td><td style="padding:6px 0;font-weight:600;color:#111827;">${p.desiredQuota} employees</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">Monthly cost</td><td style="padding:6px 0;font-weight:700;color:#111827;font-size:16px;">AED ${p.monthlyCost}</td></tr>
    </table>
  </div>
  <p style="color:#6b7280;font-size:13px;">Pricing is AED 10 per 5 employees per month. Your capacity will be activated once payment is confirmed.</p>
  <p style="color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb;margin-top:24px;padding-top:16px;">HRHub &mdash; UAE HR & PRO Platform</p>
</div>
</body></html>`
}

function enterpriseContactSalesEmail(p: EnterpriseContactParams): string {
    return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;padding:32px;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
  <div style="background:#f5f3ff;border-left:4px solid #7c3aed;padding:12px 16px;border-radius:4px;margin-bottom:20px;">
    <strong style="color:#5b21b6;">New Enterprise Inquiry</strong>
  </div>
  <h2 style="color:#111827;margin-top:0;">Enterprise Inquiry from ${p.tenantName}</h2>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;">
    <tr><td style="padding:8px 0;color:#9ca3af;font-size:13px;width:140px;">Company</td><td style="padding:8px 0;font-weight:600;color:#111827;">${p.tenantName}</td></tr>
    <tr><td style="padding:8px 0;color:#9ca3af;font-size:13px;">Tenant ID</td><td style="padding:8px 0;color:#374151;font-size:12px;font-family:monospace;">${p.tenantId}</td></tr>
    <tr><td style="padding:8px 0;color:#9ca3af;font-size:13px;">Contact</td><td style="padding:8px 0;font-weight:600;color:#111827;">${p.contactName}</td></tr>
    <tr><td style="padding:8px 0;color:#9ca3af;font-size:13px;">Email</td><td style="padding:8px 0;color:#2563eb;">${p.contactEmail}</td></tr>
    <tr><td style="padding:8px 0;color:#9ca3af;font-size:13px;">Company Size</td><td style="padding:8px 0;font-weight:600;color:#111827;">${p.companySize}</td></tr>
  </table>
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin:16px 0;">
    <p style="margin:0 0 8px;color:#9ca3af;font-size:11px;text-transform:uppercase;font-weight:600;">Message</p>
    <p style="margin:0;color:#111827;font-size:14px;line-height:1.6;">${p.message}</p>
  </div>
  <p style="color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb;margin-top:24px;padding-top:16px;">HRHub &mdash; UAE HR & PRO Platform</p>
</div>
</body></html>`
}

function enterpriseContactConfirmationEmail(p: EnterpriseContactParams): string {
    return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;padding:32px;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
  <div style="background:#f5f3ff;border-left:4px solid #7c3aed;padding:12px 16px;border-radius:4px;margin-bottom:20px;">
    <strong style="color:#5b21b6;">Enterprise inquiry received</strong>
  </div>
  <h2 style="color:#111827;margin-top:0;">Hi ${p.contactName},</h2>
  <p style="color:#6b7280;">Thank you for reaching out about <strong>HRHub Enterprise</strong> for <strong>${p.tenantName}</strong>. A member of our sales team will contact you within 1 business day to discuss your requirements and provide a tailored quote.</p>
  <div style="background:#f5f3ff;border-radius:10px;padding:20px;margin:20px 0;">
    <p style="margin:0 0 10px;font-size:13px;color:#5b21b6;font-weight:600;">Enterprise plan includes:</p>
    <ul style="margin:0;padding-left:20px;color:#374151;font-size:13px;line-height:2;">
      <li>Unlimited employees</li>
      <li>Dedicated account manager</li>
      <li>Custom integrations & SLA</li>
      <li>Advanced compliance & audit tools</li>
      <li>Priority support</li>
    </ul>
  </div>
  <p style="color:#6b7280;font-size:13px;">If you have urgent questions, feel free to reply to this email.</p>
  <p style="color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb;margin-top:24px;padding-top:16px;">HRHub &mdash; UAE HR & PRO Platform</p>
</div>
</body></html>`
}

// ─── Invoice email ────────────────────────────────────────────────────────────

interface InvoiceEmailParams {
    tenantName: string
    ownerEmail: string
    invoiceRef: string
    paidOn: Date
    expiresAt: Date
    desiredQuota: number
    monthlyCost: number
    action: 'upgrade' | 'quota_update'
    paymentMethod: string
}

function subscriptionInvoiceEmail(p: InvoiceEmailParams): string {
    const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    const isUpgrade = p.action === 'upgrade'
    const lineDesc = isUpgrade
        ? `HRHub Professional Plan — ${p.desiredQuota} employees`
        : `HRHub Professional — Capacity update to ${p.desiredQuota} employees`
    const pricePerBlock = (p.monthlyCost / p.desiredQuota * 5).toFixed(0)
    return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;padding:32px;margin:0;">
<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">

  <!-- Header -->
  <tr>
    <td style="background:#1e40af;padding:28px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td>
            <p style="margin:0;color:#93c5fd;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">HRHub UAE</p>
            <p style="margin:6px 0 0;color:#fff;font-size:20px;font-weight:700;line-height:1.2;">Payment Receipt</p>
          </td>
          <td align="right" valign="top">
            <p style="margin:0;color:#93c5fd;font-size:11px;">Invoice</p>
            <p style="margin:4px 0 0;color:#fff;font-size:13px;font-weight:600;font-family:monospace;">${p.invoiceRef}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:28px 32px;">

      <!-- PAID badge -->
      <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
        <tr>
          <td style="background:#ecfdf5;border:1px solid #6ee7b7;border-radius:20px;padding:5px 16px;">
            <span style="color:#047857;font-size:12px;font-weight:600;">&#10003; PAID</span>
          </td>
        </tr>
      </table>

      <!-- Billed to / Payment date (2 columns via table) -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
        <tr>
          <td width="50%" valign="top" style="padding-right:12px;">
            <p style="margin:0 0 4px;font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">Billed To</p>
            <p style="margin:0;font-size:14px;font-weight:600;color:#111827;">${p.tenantName}</p>
            <p style="margin:2px 0 0;font-size:12px;color:#6b7280;">${p.ownerEmail}</p>
          </td>
          <td width="50%" valign="top" style="padding-left:12px;">
            <p style="margin:0 0 4px;font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">Payment Date</p>
            <p style="margin:0;font-size:14px;font-weight:600;color:#111827;">${fmt(p.paidOn)}</p>
            <p style="margin:2px 0 0;font-size:12px;color:#6b7280;">${p.paymentMethod}</p>
          </td>
        </tr>
      </table>

      <!-- Line items -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;border-collapse:collapse;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid #e5e7eb;">Description</th>
            <th style="padding:10px 12px;text-align:center;font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid #e5e7eb;width:40px;">Qty</th>
            <th style="padding:10px 12px;text-align:right;font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid #e5e7eb;width:90px;">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:14px 12px;border-bottom:1px solid #f3f4f6;">
              <p style="margin:0;font-size:14px;color:#111827;font-weight:500;">${lineDesc}</p>
              <p style="margin:3px 0 0;font-size:12px;color:#6b7280;">1-month subscription &bull; AED ${pricePerBlock} per 5 employees</p>
            </td>
            <td style="padding:14px 12px;text-align:center;font-size:14px;color:#374151;border-bottom:1px solid #f3f4f6;">1</td>
            <td style="padding:14px 12px;text-align:right;font-size:14px;font-weight:600;color:#111827;border-bottom:1px solid #f3f4f6;">AED ${p.monthlyCost}</td>
          </tr>
        </tbody>
      </table>

      <!-- Total -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border-radius:8px;margin-bottom:24px;">
        <tr>
          <td style="padding:14px 16px;">
            <span style="font-size:14px;color:#6b7280;font-weight:500;">Total Paid</span>
          </td>
          <td style="padding:14px 16px;" align="right">
            <span style="font-size:22px;font-weight:700;color:#111827;">AED ${p.monthlyCost}</span>
          </td>
        </tr>
      </table>

      <!-- Subscription period -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eff6ff;border-radius:8px;margin-bottom:24px;">
        <tr>
          <td style="padding:14px 16px;">
            <p style="margin:0;font-size:12px;color:#1d4ed8;font-weight:600;">Subscription period</p>
            <p style="margin:4px 0 0;font-size:13px;color:#1e40af;">${fmt(p.paidOn)} &rarr; ${fmt(p.expiresAt)}</p>
            <p style="margin:4px 0 0;font-size:11px;color:#3b82f6;">Next renewal: ${fmt(p.expiresAt)}</p>
          </td>
        </tr>
      </table>

      <!-- Plan summary -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:24px;">
        <tr>
          <td style="padding:14px 16px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:5px 0;font-size:12px;color:#9ca3af;width:140px;">Plan</td>
                <td style="padding:5px 0;font-size:13px;font-weight:600;color:#2563eb;">Professional</td>
              </tr>
              <tr>
                <td style="padding:5px 0;font-size:12px;color:#9ca3af;">Employee capacity</td>
                <td style="padding:5px 0;font-size:13px;font-weight:600;color:#111827;">${p.desiredQuota} employees</td>
              </tr>
              <tr>
                <td style="padding:5px 0;font-size:12px;color:#9ca3af;">Monthly cost</td>
                <td style="padding:5px 0;font-size:13px;font-weight:600;color:#111827;">AED ${p.monthlyCost}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <p style="font-size:11px;color:#9ca3af;line-height:1.6;margin:0;">Please keep this receipt for your records. For billing inquiries, reply to this email or contact <a href="mailto:support@hrhub.ae" style="color:#2563eb;">support@hrhub.ae</a>.</p>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;text-align:center;">
      <p style="margin:0;font-size:11px;color:#9ca3af;">HRHub &mdash; UAE HR &amp; PRO Platform &bull; hrhub.ae</p>
    </td>
  </tr>

</table>
</td></tr></table>
</body></html>`
}

// ─── Subscription expiry reminder email ───────────────────────────────────────

interface ExpiryReminderParams {
    ownerName: string
    tenantName: string
    daysRemaining: number
    expiryDate: string
    quota: number
    monthlyCost: number
    renewUrl: string
}

function subscriptionExpiryReminderEmail(p: ExpiryReminderParams): string {
    const urgencyColor = p.daysRemaining <= 1 ? '#dc2626' : p.daysRemaining <= 3 ? '#d97706' : '#2563eb'
    const urgencyBg   = p.daysRemaining <= 1 ? '#fef2f2' : p.daysRemaining <= 3 ? '#fffbeb' : '#eff6ff'
    const urgencyText = p.daysRemaining <= 1
        ? 'Your subscription expires <strong>tomorrow</strong>. Renew now to avoid any service disruption.'
        : `Your subscription expires in <strong>${p.daysRemaining} days</strong> on <strong>${p.expiryDate}</strong>.`

    return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;padding:32px;margin:0;">
<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">

  <!-- Header -->
  <tr>
    <td style="background:#1e40af;padding:24px 32px;">
      <p style="margin:0;color:#93c5fd;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">HRHub UAE</p>
      <p style="margin:6px 0 0;color:#fff;font-size:18px;font-weight:700;line-height:1.2;">Subscription Renewal Reminder</p>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:28px 32px;">

      <!-- Urgency banner -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
        <tr>
          <td style="background:${urgencyBg};border-left:4px solid ${urgencyColor};border-radius:4px;padding:14px 16px;">
            <p style="margin:0;color:${urgencyColor};font-size:13px;">${urgencyText}</p>
          </td>
        </tr>
      </table>

      <p style="color:#374151;font-size:14px;margin:0 0 16px;">Hi ${p.ownerName},</p>
      <p style="color:#6b7280;font-size:14px;margin:0 0 24px;">Your <strong>HRHub Professional</strong> subscription for <strong>${p.tenantName}</strong> is coming up for renewal. Renew before the expiry date to keep your team running without interruption.</p>

      <!-- Plan details -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:24px;">
        <tr>
          <td style="padding:16px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:6px 0;font-size:12px;color:#9ca3af;width:140px;">Plan</td>
                <td style="padding:6px 0;font-size:13px;font-weight:600;color:#2563eb;">Professional</td>
              </tr>
              <tr>
                <td style="padding:6px 0;font-size:12px;color:#9ca3af;">Employee capacity</td>
                <td style="padding:6px 0;font-size:13px;font-weight:600;color:#111827;">${p.quota} employees</td>
              </tr>
              <tr>
                <td style="padding:6px 0;font-size:12px;color:#9ca3af;">Monthly cost</td>
                <td style="padding:6px 0;font-size:13px;font-weight:600;color:#111827;">AED ${p.monthlyCost}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;font-size:12px;color:#9ca3af;">Expires on</td>
                <td style="padding:6px 0;font-size:13px;font-weight:700;color:${urgencyColor};">${p.expiryDate}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- CTA -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
        <tr>
          <td align="center">
            <a href="${p.renewUrl}" style="display:inline-block;background:${urgencyColor};color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">Renew Subscription</a>
          </td>
        </tr>
      </table>

      <!-- What happens if not renewed -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border-radius:8px;">
        <tr>
          <td style="padding:14px 16px;">
            <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#374151;">What happens if I don't renew?</p>
            <p style="margin:0 0 4px;font-size:12px;color:#6b7280;">&bull; Adding new employees will be restricted</p>
            <p style="margin:0 0 4px;font-size:12px;color:#6b7280;">&bull; Your existing data remains safe and accessible</p>
            <p style="margin:0;font-size:12px;color:#6b7280;">&bull; You can renew at any time to restore full access</p>
          </td>
        </tr>
      </table>

    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;text-align:center;">
      <p style="margin:0;font-size:11px;color:#9ca3af;">HRHub &mdash; UAE HR &amp; PRO Platform &bull; hrhub.ae</p>
      <p style="margin:4px 0 0;font-size:11px;color:#9ca3af;">Questions? Reply to this email or contact <a href="mailto:support@hrhub.ae" style="color:#2563eb;">support@hrhub.ae</a></p>
    </td>
  </tr>

</table>
</td></tr></table>
</body></html>`
}
