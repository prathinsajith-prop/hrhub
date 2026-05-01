import {
    getQuotaInfo,
    sendUpgradeRequest,
    sendEnterpriseContact,
    calculateProfessionalCost,
    createCheckoutSession,
    activateProfessionalFromWebhook,
    verifyStripeWebhook,
    updateProfessionalQuota,
    getSubscriptionEvents,
    getSubscriptionEventById,
    isStripeEnabled,
    sendTestSubscriptionEmail,
    PLAN_DISPLAY,
    FREE_PLAN_QUOTA,
    PROFESSIONAL_PRICE_PER_5,
} from './subscription.service.js'
import { db } from '../../db/index.js'
import { tenants } from '../../db/schema/index.js'
import { eq } from 'drizzle-orm'

export default async function subscriptionRoutes(fastify: any): Promise<void> {
    const auth = { preHandler: [fastify.authenticate] }
    const adminAuth = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }

    // GET /api/v1/subscription — current plan + usage + pricing info
    fastify.get('/', { ...auth, schema: { tags: ['Subscription'] } }, async (request: any, reply: any) => {
        const info = await getQuotaInfo(request.user.tenantId)

        const plans = [
            {
                key: 'starter',
                name: 'Free',
                description: 'Core HR features for small teams.',
                quota: FREE_PLAN_QUOTA,
                priceMonthly: 0,
                priceLabel: 'Free',
                features: ['Up to 5 employees', 'Core HR modules', 'Leave & attendance', 'Document management'],
                isCurrent: info.plan === 'starter',
            },
            {
                key: 'growth',
                name: 'Professional',
                description: 'Scale your team with full HR capabilities.',
                quota: null as number | null,
                priceMonthly: null,
                priceLabel: `AED ${PROFESSIONAL_PRICE_PER_5} / 5 employees / month`,
                features: ['Custom employee capacity', 'All Free features', 'Payroll & WPS', 'Performance reviews', 'Asset management', 'Priority email support'],
                isCurrent: info.plan === 'growth',
            },
            {
                key: 'enterprise',
                name: 'Enterprise',
                description: 'Unlimited scale with dedicated support.',
                quota: null as number | null,
                priceMonthly: null,
                priceLabel: 'Custom pricing',
                features: ['Unlimited employees', 'All Professional features', 'Dedicated account manager', 'Custom integrations & SLA', 'Advanced audit & compliance'],
                isCurrent: info.plan === 'enterprise',
            },
        ]

        return reply.send({
            data: {
                current: {
                    plan: info.plan,
                    planName: PLAN_DISPLAY[info.plan]?.name ?? info.plan,
                    quota: info.quota,
                    employeeCount: info.current,
                    canAdd: info.canAdd,
                    usagePercent: info.quota ? Math.round((info.current / info.quota) * 100) : 0,
                },
                plans,
                pricing: {
                    pricePerFiveEmployees: PROFESSIONAL_PRICE_PER_5,
                    currency: 'AED',
                },
                // Tells the frontend whether to use Stripe checkout or the email-request fallback
                stripeEnabled: isStripeEnabled(),
            },
        })
    })

    // POST /api/v1/subscription/checkout — create Stripe Checkout session (self-service upgrade)
    fastify.post('/checkout', { ...adminAuth, schema: { tags: ['Subscription'] } }, async (request: any, reply: any) => {
        const { desiredQuota, action } = request.body as { desiredQuota?: number; action?: string }

        if (!desiredQuota || typeof desiredQuota !== 'number' || desiredQuota < 5 || desiredQuota > 10000) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'desiredQuota must be between 5 and 10000' })
        }
        const resolvedAction: 'upgrade' | 'quota_update' = action === 'quota_update' ? 'quota_update' : 'upgrade'

        const [tenant] = await db
            .select({ name: tenants.name })
            .from(tenants)
            .where(eq(tenants.id, request.user.tenantId))
            .limit(1)

        if (!tenant) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Tenant not found' })

        const result = await createCheckoutSession({
            tenantId: request.user.tenantId,
            tenantName: tenant.name,
            userEmail: request.user.email,
            userId: request.user.id,
            desiredQuota,
            action: resolvedAction,
        })

        return reply.send({ data: result })
    })

    // POST /api/v1/subscription/webhook — Stripe webhook (no JWT auth, raw body required)
    fastify.post('/webhook', {
        config: { rawBody: true },
        schema: { tags: ['Subscription'] },
    }, async (request: any, reply: any) => {
        const sig = (request.headers as any)['stripe-signature']
        if (!sig) return reply.code(400).send({ error: 'Missing stripe-signature header' })

        let event
        try {
            // Fastify with rawBody plugin exposes request.rawBody
            const body = (request as any).rawBody as Buffer
            event = await verifyStripeWebhook(body, sig)
        } catch (err: any) {
            return reply.code(400).send({ error: `Webhook signature verification failed: ${err.message}` })
        }

        if (event.type === 'checkout.session.completed') {
            const session = event.data.object as any
            const { tenantId, tenantName, desiredQuota, userEmail, action } = session.metadata ?? {}

            if (tenantId && desiredQuota) {
                await activateProfessionalFromWebhook(
                    tenantId,
                    Number(desiredQuota),
                    tenantName ?? '',
                    userEmail ?? session.customer_email ?? '',
                    session.id,
                    action === 'quota_update' ? 'quota_update' : 'upgrade',
                )
            }
        }

        return reply.send({ received: true })
    })

    // PATCH /api/v1/subscription/quota — existing Professional tenants update employee capacity
    fastify.patch('/quota', { ...adminAuth, schema: { tags: ['Subscription'] } }, async (request: any, reply: any) => {
        const { newQuota } = request.body as { newQuota?: number }

        if (!newQuota || typeof newQuota !== 'number' || newQuota < 5 || newQuota > 10000) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'newQuota must be between 5 and 10000' })
        }

        const [tenant] = await db
            .select({ name: tenants.name })
            .from(tenants)
            .where(eq(tenants.id, request.user.tenantId))
            .limit(1)

        if (!tenant) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Tenant not found' })

        await updateProfessionalQuota({
            tenantId: request.user.tenantId,
            tenantName: tenant.name,
            newQuota,
            requestorName: request.user.name,
            requestorEmail: request.user.email,
            userId: request.user.id,
        })

        return reply.send({
            data: {
                message: 'Employee capacity updated successfully.',
                newQuota,
                monthlyCost: calculateProfessionalCost(newQuota),
                currency: 'AED',
            },
        })
    })

    // POST /api/v1/subscription/upgrade — email-based upgrade request (fallback when Stripe not configured)
    fastify.post('/upgrade', { ...adminAuth, schema: { tags: ['Subscription'] } }, async (request: any, reply: any) => {
        const { desiredQuota } = request.body as { desiredQuota?: number }

        if (!desiredQuota || typeof desiredQuota !== 'number' || desiredQuota < 1 || desiredQuota > 10000) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'desiredQuota must be a number between 1 and 10000' })
        }

        const [tenant] = await db
            .select({ name: tenants.name })
            .from(tenants)
            .where(eq(tenants.id, request.user.tenantId))
            .limit(1)

        if (!tenant) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Tenant not found' })

        const result = await sendUpgradeRequest({
            tenantId: request.user.tenantId,
            tenantName: tenant.name,
            requestorName: request.user.name,
            requestorEmail: request.user.email,
            userId: request.user.id,
            desiredQuota,
        })

        return reply.send({
            data: {
                message: 'Upgrade request submitted. Our team will contact you within 1 business day.',
                desiredQuota: result.desiredQuota,
                monthlyCost: result.monthlyCost,
                currency: 'AED',
            },
        })
    })

    // POST /api/v1/subscription/enterprise-contact — enterprise inquiry
    fastify.post('/enterprise-contact', { ...adminAuth, schema: { tags: ['Subscription'] } }, async (request: any, reply: any) => {
        const { contactName, contactEmail, companySize, message } = request.body as {
            contactName?: string
            contactEmail?: string
            companySize?: string
            message?: string
        }

        if (!contactName || !contactEmail || !companySize || !message) {
            return reply.code(400).send({
                statusCode: 400, error: 'Bad Request',
                message: 'contactName, contactEmail, companySize, and message are required',
            })
        }

        const [tenant] = await db
            .select({ name: tenants.name })
            .from(tenants)
            .where(eq(tenants.id, request.user.tenantId))
            .limit(1)

        if (!tenant) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Tenant not found' })

        await sendEnterpriseContact({
            tenantId: request.user.tenantId,
            tenantName: tenant.name,
            contactName,
            contactEmail,
            companySize,
            message,
            userId: request.user.id,
        })

        return reply.send({
            data: {
                message: 'Thank you for your interest! Our enterprise team will reach out within 1 business day.',
            },
        })
    })

    // GET /api/v1/subscription/events — subscription event log for this tenant
    fastify.get('/events', { ...adminAuth, schema: { tags: ['Subscription'] } }, async (request: any, reply: any) => {
        const { limit } = request.query as { limit?: string }
        const events = await getSubscriptionEvents(request.user.tenantId, Math.min(100, Math.max(1, Number(limit ?? 50))))
        return reply.send({ data: events })
    })

    // GET /api/v1/subscription/events/:id/invoice — download invoice PDF for a billing event
    fastify.get('/events/:id/invoice', { ...adminAuth, schema: { tags: ['Subscription'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const event = await getSubscriptionEventById(request.user.tenantId, id)
        if (!event) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Invoice not found' })

        const meta = (event.metadata ?? {}) as Record<string, unknown>
        const invoiceRef = (meta.invoiceRef as string) ?? `INV-${event.id.slice(0, 8).toUpperCase()}`
        const [tenantRow] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, request.user.tenantId)).limit(1)
        const tenantName = tenantRow?.name ?? 'Organisation'

        const eventLabel: Record<string, string> = {
            plan_activated: 'Professional Plan Activation',
            quota_updated: 'Employee Capacity Update',
            upgrade_request: 'Upgrade Request',
            enterprise_contact: 'Enterprise Enquiry',
            checkout_created: 'Checkout Initiated',
        }
        const description = eventLabel[event.eventType] ?? event.eventType

        const PAID_EVENT_TYPES = ['plan_activated', 'quota_updated']
        const { generateInvoicePdf } = await import('../../lib/pdf.js')
        const pdf = await generateInvoicePdf({
            invoiceRef,
            companyName: tenantName,
            description,
            plan: event.planTo ?? event.planFrom ?? '—',
            quota: event.employeeQuota ? `${event.employeeQuota} employees` : '—',
            amount: event.monthlyCost ? `AED ${event.monthlyCost.toLocaleString()}` : '—',
            paymentMethod: (meta.paymentMethod as string) ?? '—',
            date: new Date(event.createdAt).toLocaleDateString('en-AE', { day: 'numeric', month: 'long', year: 'numeric' }),
            issuedTo: tenantName,
            isPaid: PAID_EVENT_TYPES.includes(event.eventType),
        })

        reply.header('Content-Type', 'application/pdf')
        reply.header('Content-Disposition', `attachment; filename="invoice-${invoiceRef}.pdf"`)
        return reply.send(pdf)
    })

    // POST /api/v1/subscription/test-email — send a test invoice or expiry reminder to the logged-in user
    fastify.post('/test-email', { ...adminAuth, schema: { tags: ['Subscription'] } }, async (request: any, reply: any) => {
        const { type } = (request.body ?? {}) as { type?: string }
        const emailType = type === 'expiry_reminder' ? 'expiry_reminder' : 'invoice'

        const [tenant] = await db
            .select({ name: tenants.name })
            .from(tenants)
            .where(eq(tenants.id, request.user.tenantId))
            .limit(1)

        const result = await sendTestSubscriptionEmail(
            request.user.email,
            emailType,
            request.user.name ?? 'Account Owner',
            tenant?.name ?? request.user.tenantId,
        )

        if (!result.ok) {
            return reply.code(502).send({
                statusCode: 502,
                error: 'Bad Gateway',
                message: `Email delivery failed: ${result.error ?? 'unknown error'}`,
            })
        }

        return reply.send({
            data: {
                message: `Test ${emailType === 'invoice' ? 'invoice' : 'expiry reminder'} email sent to ${request.user.email}`,
            },
        })
    })

    // GET /api/v1/subscription/pricing — pricing calculator
    fastify.get('/pricing', { ...auth, schema: { tags: ['Subscription'] } }, async (request: any, reply: any) => {
        const { employees: empCount } = request.query as { employees?: string }
        const n = Math.max(1, Number(empCount ?? 5))
        return reply.send({
            data: {
                employeeCount: n,
                monthlyCost: calculateProfessionalCost(n),
                currency: 'AED',
                pricePerFiveEmployees: PROFESSIONAL_PRICE_PER_5,
            },
        })
    })
}
