/**
 * Email service — supports SMTP (Mailpit in dev, real SMTP in prod) and Resend.
 * Provider is selected by EMAIL_PROVIDER env var (smtp | resend).
 *
 * Production checklist:
 *   • EMAIL_PROVIDER=resend  + RESEND_API_KEY=re_...      (recommended)
 *   • EMAIL_PROVIDER=smtp    + SMTP_HOST/PORT/USER/PASS   (Gmail, SES, etc.)
 *   • EMAIL_FROM must match a verified sender on your provider.
 *   • Run verifyEmailConfig() at boot to fail fast on misconfig.
 */
import nodemailer from 'nodemailer'
import { loadEnv } from '../config/env.js'

let transporter: nodemailer.Transporter | null = null
let configWarned = false

function getTransporter(): nodemailer.Transporter {
    if (transporter) return transporter
    const env = loadEnv()
    if (env.EMAIL_PROVIDER === 'resend') {
        if (!env.RESEND_API_KEY) {
            throw new Error('EMAIL_PROVIDER=resend but RESEND_API_KEY is not set')
        }
        transporter = nodemailer.createTransport({
            host: 'smtp.resend.com',
            port: 465,
            secure: true,
            auth: { user: 'resend', pass: env.RESEND_API_KEY },
        })
    } else {
        // In production, refuse to start with default Mailpit settings
        if (env.NODE_ENV === 'production' && env.SMTP_HOST === 'localhost' && !configWarned) {
            console.warn('[email] WARNING: SMTP_HOST=localhost in production — emails will silently fail.')
            configWarned = true
        }
        transporter = nodemailer.createTransport({
            host: env.SMTP_HOST,
            port: env.SMTP_PORT,
            secure: env.SMTP_PORT === 465,
            auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
            tls: { rejectUnauthorized: env.NODE_ENV === 'production' },
        })
    }
    return transporter
}

export interface EmailOptions {
    to: string
    subject: string
    html: string
    text?: string
    cc?: string | string[]
    bcc?: string | string[]
    replyTo?: string
}

export interface SendResult {
    ok: boolean
    messageId?: string
    error?: string
}

/**
 * Send an email. Returns a structured result so callers can surface
 * delivery status to the user (UI banner / toast).
 */
export async function sendEmail(opts: EmailOptions): Promise<SendResult> {
    const env = loadEnv()
    if (!opts.to) return { ok: false, error: 'No recipient' }
    try {
        const t = getTransporter()
        const info = await t.sendMail({
            from: `"${env.EMAIL_FROM_NAME}" <${env.EMAIL_FROM}>`,
            to: opts.to,
            cc: opts.cc,
            bcc: opts.bcc,
            replyTo: opts.replyTo,
            subject: opts.subject,
            html: opts.html,
            text: opts.text ?? opts.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
        })
        if (env.NODE_ENV !== 'production') {
            console.log(`[email] Sent to ${opts.to} subject="${opts.subject}" id=${info.messageId}`)
        }
        return { ok: true, messageId: info.messageId }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[email] Failed to send to ${opts.to}:`, msg)
        return { ok: false, error: msg }
    }
}

/**
 * Verify email transport is reachable. Run at boot to fail fast.
 * Returns { ok, provider, host, error? }.
 */
export async function verifyEmailConfig(): Promise<{ ok: boolean; provider: string; host: string; from: string; error?: string }> {
    const env = loadEnv()
    const provider = env.EMAIL_PROVIDER
    const host = provider === 'resend' ? 'smtp.resend.com' : `${env.SMTP_HOST}:${env.SMTP_PORT}`
    try {
        const t = getTransporter()
        await t.verify()
        return { ok: true, provider, host, from: env.EMAIL_FROM }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { ok: false, provider, host, from: env.EMAIL_FROM, error: msg }
    }
}

// --- Email templates ---

export function passwordResetEmail(params: { name: string; resetUrl: string; expiresInMinutes: number }): EmailOptions {
    const { name, resetUrl, expiresInMinutes } = params
    return {
        to: '',
        subject: 'Reset your HRHub password',
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;padding:32px;">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
  <h2 style="color:#111827;margin-top:0;">Reset your password</h2>
  <p style="color:#6b7280;">Hi ${name},</p>
  <p style="color:#6b7280;">We received a request to reset your HRHub password. Click the button below to set a new password. This link expires in <strong>${expiresInMinutes} minutes</strong>.</p>
  <a href="${resetUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0;">Reset Password</a>
  <p style="color:#9ca3af;font-size:12px;">If you didn't request this, you can safely ignore this email. Your password won't change.</p>
  <p style="color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb;margin-top:24px;padding-top:16px;">HRHub &mdash; UAE HR & PRO Platform</p>
</div>
</body>
</html>`,
    }
}

export function inviteUserEmail(params: { inviteeName: string; workspaceName: string; role: string; inviteUrl: string }): EmailOptions {
    const { inviteeName, workspaceName, role, inviteUrl } = params
    return {
        to: '',
        subject: `You're invited to ${workspaceName} on HRHub`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;padding:32px;">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
  <h2 style="color:#111827;margin-top:0;">You're invited!</h2>
  <p style="color:#6b7280;">Hi ${inviteeName},</p>
  <p style="color:#6b7280;">You've been invited to join <strong>${workspaceName}</strong> on HRHub as <strong>${role}</strong>.</p>
  <a href="${inviteUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0;">Accept Invitation</a>
  <p style="color:#9ca3af;font-size:12px;">This invitation link expires in 48 hours.</p>
  <p style="color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb;margin-top:24px;padding-top:16px;">HRHub &mdash; UAE HR & PRO Platform</p>
</div>
</body>
</html>`,
    }
}

export function leaveNotificationEmail(params: { managerName: string; employeeName: string; leaveType: string; startDate: string; endDate: string; approveUrl: string }): EmailOptions {
    const { managerName, employeeName, leaveType, startDate, endDate, approveUrl } = params
    return {
        to: '',
        subject: `Leave Request from ${employeeName}`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;padding:32px;">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
  <h2 style="color:#111827;margin-top:0;">Leave Request</h2>
  <p style="color:#6b7280;">Hi ${managerName},</p>
  <p style="color:#6b7280;"><strong>${employeeName}</strong> has submitted a leave request:</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;">
    <tr><td style="padding:8px 0;color:#9ca3af;font-size:13px;">Type</td><td style="padding:8px 0;font-weight:600;color:#111827;">${leaveType}</td></tr>
    <tr><td style="padding:8px 0;color:#9ca3af;font-size:13px;">From</td><td style="padding:8px 0;font-weight:600;color:#111827;">${startDate}</td></tr>
    <tr><td style="padding:8px 0;color:#9ca3af;font-size:13px;">To</td><td style="padding:8px 0;font-weight:600;color:#111827;">${endDate}</td></tr>
  </table>
  <a href="${approveUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0;">Review Request</a>
  <p style="color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb;margin-top:24px;padding-top:16px;">HRHub &mdash; UAE HR & PRO Platform</p>
</div>
</body>
</html>`,
    }
}

export function onboardingUploadLinkEmail(params: { employeeName: string; companyName: string; uploadUrl: string; expiresInDays: number }): EmailOptions {
    const { employeeName, companyName, uploadUrl, expiresInDays } = params
    return {
        to: '',
        subject: `Action required: Please upload your onboarding documents — ${companyName}`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;padding:32px;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
  <div style="background:#eff6ff;border-left:4px solid #2563eb;padding:12px 16px;border-radius:4px;margin-bottom:24px;">
    <strong style="color:#1d4ed8;">Document Upload Required</strong>
  </div>
  <h2 style="color:#111827;margin-top:0;">Welcome, ${employeeName}!</h2>
  <p style="color:#6b7280;">As part of your onboarding at <strong>${companyName}</strong>, we need you to upload a few documents. Please click the link below to access your secure upload portal.</p>
  <p style="color:#6b7280;">For each onboarding step, you'll see which documents are required. Simply upload the files and we'll review them.</p>
  <a href="${uploadUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:20px 0;font-size:15px;">Upload My Documents</a>
  <p style="color:#9ca3af;font-size:12px;">This link is valid for <strong>${expiresInDays} days</strong>. It is unique to you — please do not share it with others.</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
  <p style="color:#9ca3af;font-size:11px;">If you did not expect this email or have questions, please contact your HR team directly.</p>
  <p style="color:#9ca3af;font-size:12px;">HRHub &mdash; UAE HR &amp; PRO Platform</p>
</div>
</body>
</html>`,
    }
}

export function visaExpiryAlertEmail(params: { recipientName: string; employeeName: string; visaType: string; expiryDate: string; daysRemaining: number; actionUrl: string }): EmailOptions {
    const { recipientName, employeeName, visaType, expiryDate, daysRemaining, actionUrl } = params
    const urgency = daysRemaining <= 30 ? '#dc2626' : daysRemaining <= 60 ? '#d97706' : '#2563eb'
    return {
        to: '',
        subject: `⚠️ Visa Expiry Alert: ${employeeName} (${daysRemaining} days)`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;padding:32px;">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
  <div style="background:${urgency}15;border-left:4px solid ${urgency};padding:12px 16px;border-radius:4px;margin-bottom:16px;">
    <strong style="color:${urgency};">${daysRemaining} days remaining</strong>
  </div>
  <h2 style="color:#111827;margin-top:0;">Visa Expiry Alert</h2>
  <p style="color:#6b7280;">Hi ${recipientName},</p>
  <p style="color:#6b7280;">The visa for <strong>${employeeName}</strong> is expiring soon:</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;">
    <tr><td style="padding:8px 0;color:#9ca3af;font-size:13px;">Visa Type</td><td style="padding:8px 0;font-weight:600;color:#111827;">${visaType}</td></tr>
    <tr><td style="padding:8px 0;color:#9ca3af;font-size:13px;">Expiry Date</td><td style="padding:8px 0;font-weight:600;color:${urgency};">${expiryDate}</td></tr>
  </table>
  <a href="${actionUrl}" style="display:inline-block;background:${urgency};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0;">Take Action</a>
  <p style="color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb;margin-top:24px;padding-top:16px;">HRHub &mdash; UAE HR & PRO Platform</p>
</div>
</body>
</html>`,
    }
}

// ─── Document lifecycle templates ────────────────────────────────────────────

export function documentVerifiedEmail(params: { employeeName: string; docType: string; verifiedBy: string; companyName: string }): EmailOptions {
    const { employeeName, docType, verifiedBy, companyName } = params
    return {
        to: '',
        subject: `✅ Your ${docType} has been verified — ${companyName}`,
        html: `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;padding:32px;">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
  <div style="background:#ecfdf5;border-left:4px solid #10b981;padding:12px 16px;border-radius:4px;margin-bottom:16px;">
    <strong style="color:#047857;">Document Verified</strong>
  </div>
  <h2 style="color:#111827;margin-top:0;">Hi ${employeeName},</h2>
  <p style="color:#6b7280;">Good news — your <strong>${docType}</strong> has been reviewed and verified by ${verifiedBy} at <strong>${companyName}</strong>.</p>
  <p style="color:#6b7280;">No further action is required from you for this document.</p>
  <p style="color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb;margin-top:24px;padding-top:16px;">HRHub &mdash; UAE HR & PRO Platform</p>
</div></body></html>`,
    }
}

export function documentRejectedEmail(params: { employeeName: string; docType: string; reason: string; uploadUrl?: string; companyName: string }): EmailOptions {
    const { employeeName, docType, reason, uploadUrl, companyName } = params
    return {
        to: '',
        subject: `Action required: Re-upload your ${docType} — ${companyName}`,
        html: `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;padding:32px;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
  <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;border-radius:4px;margin-bottom:16px;">
    <strong style="color:#b91c1c;">Document Rejected — Resubmission Needed</strong>
  </div>
  <h2 style="color:#111827;margin-top:0;">Hi ${employeeName},</h2>
  <p style="color:#6b7280;">Your <strong>${docType}</strong> submission to <strong>${companyName}</strong> could not be accepted.</p>
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin:16px 0;">
    <p style="margin:0;color:#9ca3af;font-size:11px;text-transform:uppercase;font-weight:600;letter-spacing:0.05em;">Reason</p>
    <p style="margin:4px 0 0;color:#111827;font-size:14px;">${reason}</p>
  </div>
  ${uploadUrl ? `<a href="${uploadUrl}" style="display:inline-block;background:#dc2626;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:8px 0;">Re-upload Document</a>` : ''}
  <p style="color:#9ca3af;font-size:12px;">If you have questions, please contact your HR team.</p>
  <p style="color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb;margin-top:24px;padding-top:16px;">HRHub &mdash; UAE HR & PRO Platform</p>
</div></body></html>`,
    }
}

export function documentExpiryAlertEmail(params: { recipientName: string; employeeName: string; docType: string; expiryDate: string; daysRemaining: number; actionUrl: string }): EmailOptions {
    const { recipientName, employeeName, docType, expiryDate, daysRemaining, actionUrl } = params
    const urgency = daysRemaining <= 14 ? '#dc2626' : daysRemaining <= 30 ? '#d97706' : '#2563eb'
    return {
        to: '',
        subject: `📄 Document Expiring: ${docType} for ${employeeName} (${daysRemaining}d)`,
        html: `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;padding:32px;">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
  <div style="background:${urgency}15;border-left:4px solid ${urgency};padding:12px 16px;border-radius:4px;margin-bottom:16px;">
    <strong style="color:${urgency};">${daysRemaining} days remaining</strong>
  </div>
  <h2 style="color:#111827;margin-top:0;">Document Expiring Soon</h2>
  <p style="color:#6b7280;">Hi ${recipientName},</p>
  <p style="color:#6b7280;">A document on file is approaching expiry:</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;">
    <tr><td style="padding:8px 0;color:#9ca3af;font-size:13px;">Employee</td><td style="padding:8px 0;font-weight:600;color:#111827;">${employeeName}</td></tr>
    <tr><td style="padding:8px 0;color:#9ca3af;font-size:13px;">Document</td><td style="padding:8px 0;font-weight:600;color:#111827;">${docType}</td></tr>
    <tr><td style="padding:8px 0;color:#9ca3af;font-size:13px;">Expiry Date</td><td style="padding:8px 0;font-weight:600;color:${urgency};">${expiryDate}</td></tr>
  </table>
  <a href="${actionUrl}" style="display:inline-block;background:${urgency};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0;">Review Document</a>
  <p style="color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb;margin-top:24px;padding-top:16px;">HRHub &mdash; UAE HR & PRO Platform</p>
</div></body></html>`,
    }
}

export function mailTestEmail(params: { recipientName: string }): EmailOptions {
    return {
        to: '',
        subject: 'HRHub mail configuration test',
        html: `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;padding:32px;">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
  <h2 style="color:#111827;margin-top:0;">✅ Mail config is working</h2>
  <p style="color:#6b7280;">Hi ${params.recipientName}, this is a test email from your HRHub deployment. If you can read this, SMTP / Resend is configured correctly.</p>
  <p style="color:#9ca3af;font-size:12px;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:16px;">HRHub &mdash; UAE HR & PRO Platform</p>
</div></body></html>`,
    }
}
