import { eq, and, count, inArray, desc } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { tenants, employees, subscriptionEvents } from '../../db/schema/index.js'
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
        console.error(`[subscription] Email failed (${context}) to=${opts.to}: ${result.error}`)
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

    await db
        .update(tenants)
        .set({
            subscriptionPlan: 'growth',
            employeeQuota: desiredQuota,
            updatedAt: new Date(),
        })
        .where(eq(tenants.id, tenantId))

    const eventType = action === 'quota_update' ? 'quota_updated' : 'plan_activated'
    await logSubscriptionEvent({
        tenantId,
        eventType,
        planFrom: tenant?.subscriptionPlan ?? 'starter',
        planTo: 'growth',
        employeeQuota: desiredQuota,
        monthlyCost: calculateProfessionalCost(desiredQuota),
        stripeSessionId,
        contactEmail: userEmail,
        metadata: { tenantName, activatedVia: 'stripe_webhook', action },
    })

    if (userEmail) {
        if (action === 'quota_update') {
            await sendEmailLogged({
                to: userEmail,
                subject: 'Your HRHub employee capacity has been updated',
                html: quotaUpdatedViaStripeEmail({ tenantName, desiredQuota, monthlyCost: calculateProfessionalCost(desiredQuota) }),
            }, 'quota_update_confirmation')
        } else {
            await sendEmailLogged({
                to: userEmail,
                subject: 'Your HRHub Professional plan is now active',
                html: activationConfirmationEmail({ tenantName, desiredQuota, monthlyCost: calculateProfessionalCost(desiredQuota) }),
            }, 'plan_activation_confirmation')
        }
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

    await db
        .update(tenants)
        .set({ employeeQuota: params.newQuota, updatedAt: new Date() })
        .where(eq(tenants.id, params.tenantId))

    await logSubscriptionEvent({
        tenantId: params.tenantId,
        userId: params.userId,
        eventType: 'quota_updated',
        planFrom: 'growth',
        planTo: 'growth',
        employeeQuota: params.newQuota,
        monthlyCost: calculateProfessionalCost(params.newQuota),
        contactEmail: params.requestorEmail,
        contactName: params.requestorName,
        metadata: { previousQuota: tenant.employeeQuota, tenantName: params.tenantName },
    })

    await sendEmailLogged({
        to: params.requestorEmail,
        subject: 'Your HRHub employee capacity has been updated',
        html: quotaUpdatedEmail(params),
    }, 'quota_updated_confirmation')
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
        console.error(`[subscription] Confirmation email failed for upgrade request tenant=${params.tenantId}: ${confirmResult.error}`)
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
        console.error(`[subscription] Enterprise contact confirmation email failed tenant=${params.tenantId}: ${confirmResult.error}`)
    }
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
