/**
 * Email service — supports SMTP (Mailpit in dev, real SMTP in prod), Resend, and Gmail.
 * Provider is selected by EMAIL_PROVIDER env var (smtp | resend | gmail).
 *
 * Production checklist:
 *   • EMAIL_PROVIDER=resend  + RESEND_API_KEY=re_...                    (recommended)
 *   • EMAIL_PROVIDER=gmail   + GMAIL_USER + GMAIL_APP_PASSWORD            (Google App Password)
 *   • EMAIL_PROVIDER=smtp    + SMTP_HOST/PORT/USER/PASS                   (SES, Mailpit, etc.)
 *   • EMAIL_FROM must match a verified sender on your provider.
 *   • Run verifyEmailConfig() at boot to fail fast on misconfig.
 */
import nodemailer from 'nodemailer'
import { loadEnv } from '../config/env.js'
import { log } from '../lib/logger.js'

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
    } else if (env.EMAIL_PROVIDER === 'gmail') {
        if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) {
            throw new Error('EMAIL_PROVIDER=gmail but GMAIL_USER or GMAIL_APP_PASSWORD is not set')
        }
        transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD },
        })
    } else {
        // In production, refuse to start with default Mailpit settings
        if (env.NODE_ENV === 'production' && env.SMTP_HOST === 'localhost' && !configWarned) {
            log.warn('SMTP_HOST=localhost in production — emails will silently fail')
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
            log.info({ to: opts.to, subject: opts.subject, messageId: info.messageId }, 'email sent')
        }
        return { ok: true, messageId: info.messageId }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log.error({ to: opts.to, err: msg }, 'email send failed')
        if (env.NODE_ENV !== 'production' && env.EMAIL_DEV_FALLBACK) {
            log.warn({ subject: opts.subject }, 'email DEV_FALLBACK active — returning ok despite transport failure')
            return { ok: true, messageId: 'dev-fallback' }
        }
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
    const host = provider === 'resend'
        ? 'smtp.resend.com'
        : provider === 'gmail'
            ? 'smtp.gmail.com'
            : `${env.SMTP_HOST}:${env.SMTP_PORT}`
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

function h(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

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
  <p style="color:#6b7280;">Hi ${h(name)},</p>
  <p style="color:#6b7280;">We received a request to reset your HRHub password. Click the button below to set a new password. This link expires in <strong>${h(String(expiresInMinutes))} minutes</strong>.</p>
  <a href="${h(resetUrl)}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0;">Reset Password</a>
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
        subject: `You're invited to ${h(workspaceName)} on HRHub`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;padding:32px;">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
  <h2 style="color:#111827;margin-top:0;">You're invited!</h2>
  <p style="color:#6b7280;">Hi ${h(inviteeName)},</p>
  <p style="color:#6b7280;">You've been invited to join <strong>${h(workspaceName)}</strong> on HRHub as <strong>${h(role)}</strong>.</p>
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
        subject: `Leave Request from ${h(employeeName)}`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;padding:32px;">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
  <h2 style="color:#111827;margin-top:0;">Leave Request</h2>
  <p style="color:#6b7280;">Hi ${h(managerName)},</p>
  <p style="color:#6b7280;"><strong>${h(employeeName)}</strong> has submitted a leave request:</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;">
    <tr><td style="padding:8px 0;color:#9ca3af;font-size:13px;">Type</td><td style="padding:8px 0;font-weight:600;color:#111827;">${h(leaveType)}</td></tr>
    <tr><td style="padding:8px 0;color:#9ca3af;font-size:13px;">From</td><td style="padding:8px 0;font-weight:600;color:#111827;">${h(startDate)}</td></tr>
    <tr><td style="padding:8px 0;color:#9ca3af;font-size:13px;">To</td><td style="padding:8px 0;font-weight:600;color:#111827;">${h(endDate)}</td></tr>
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
        subject: `Action required: Please upload your onboarding documents — ${h(companyName)}`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;padding:32px;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
  <div style="background:#eff6ff;border-left:4px solid #2563eb;padding:12px 16px;border-radius:4px;margin-bottom:24px;">
    <strong style="color:#1d4ed8;">Document Upload Required</strong>
  </div>
  <h2 style="color:#111827;margin-top:0;">Welcome, ${h(employeeName)}!</h2>
  <p style="color:#6b7280;">As part of your onboarding at <strong>${h(companyName)}</strong>, we need you to upload a few documents. Please click the link below to access your secure upload portal.</p>
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
        subject: `[Action Required] Visa Expiry Alert: ${h(employeeName)} (${h(String(daysRemaining))} days)`,
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
  <p style="color:#6b7280;">Hi ${h(recipientName)},</p>
  <p style="color:#6b7280;">The visa for <strong>${h(employeeName)}</strong> is expiring soon:</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;">
    <tr><td style="padding:8px 0;color:#9ca3af;font-size:13px;">Visa Type</td><td style="padding:8px 0;font-weight:600;color:#111827;">${h(visaType)}</td></tr>
    <tr><td style="padding:8px 0;color:#9ca3af;font-size:13px;">Expiry Date</td><td style="padding:8px 0;font-weight:600;color:${urgency};">${h(expiryDate)}</td></tr>
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
        subject: `Your ${h(docType)} has been verified — ${h(companyName)}`,
        html: `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;padding:32px;">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
  <div style="background:#ecfdf5;border-left:4px solid #10b981;padding:12px 16px;border-radius:4px;margin-bottom:16px;">
    <strong style="color:#047857;">Document Verified</strong>
  </div>
  <h2 style="color:#111827;margin-top:0;">Hi ${h(employeeName)},</h2>
  <p style="color:#6b7280;">Good news — your <strong>${h(docType)}</strong> has been reviewed and verified by ${h(verifiedBy)} at <strong>${h(companyName)}</strong>.</p>
  <p style="color:#6b7280;">No further action is required from you for this document.</p>
  <p style="color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb;margin-top:24px;padding-top:16px;">HRHub &mdash; UAE HR & PRO Platform</p>
</div></body></html>`,
    }
}

export function documentRejectedEmail(params: { employeeName: string; docType: string; reason: string; uploadUrl?: string; companyName: string }): EmailOptions {
    const { employeeName, docType, reason, uploadUrl, companyName } = params
    return {
        to: '',
        subject: `Action required: Re-upload your ${h(docType)} — ${h(companyName)}`,
        html: `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;padding:32px;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
  <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;border-radius:4px;margin-bottom:16px;">
    <strong style="color:#b91c1c;">Document Rejected — Resubmission Needed</strong>
  </div>
  <h2 style="color:#111827;margin-top:0;">Hi ${h(employeeName)},</h2>
  <p style="color:#6b7280;">Your <strong>${h(docType)}</strong> submission to <strong>${h(companyName)}</strong> could not be accepted.</p>
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin:16px 0;">
    <p style="margin:0;color:#9ca3af;font-size:11px;text-transform:uppercase;font-weight:600;letter-spacing:0.05em;">Reason</p>
    <p style="margin:4px 0 0;color:#111827;font-size:14px;">${h(reason)}</p>
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
        subject: `[Reminder] Document Expiring: ${h(docType)} for ${h(employeeName)} (${h(String(daysRemaining))} days)`,
        html: `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;padding:32px;">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
  <div style="background:${urgency}15;border-left:4px solid ${urgency};padding:12px 16px;border-radius:4px;margin-bottom:16px;">
    <strong style="color:${urgency};">${daysRemaining} days remaining</strong>
  </div>
  <h2 style="color:#111827;margin-top:0;">Document Expiring Soon</h2>
  <p style="color:#6b7280;">Hi ${h(recipientName)},</p>
  <p style="color:#6b7280;">A document on file is approaching expiry:</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;">
    <tr><td style="padding:8px 0;color:#9ca3af;font-size:13px;">Employee</td><td style="padding:8px 0;font-weight:600;color:#111827;">${h(employeeName)}</td></tr>
    <tr><td style="padding:8px 0;color:#9ca3af;font-size:13px;">Document</td><td style="padding:8px 0;font-weight:600;color:#111827;">${h(docType)}</td></tr>
    <tr><td style="padding:8px 0;color:#9ca3af;font-size:13px;">Expiry Date</td><td style="padding:8px 0;font-weight:600;color:${urgency};">${h(expiryDate)}</td></tr>
  </table>
  <a href="${actionUrl}" style="display:inline-block;background:${urgency};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0;">Review Document</a>
  <p style="color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb;margin-top:24px;padding-top:16px;">HRHub &mdash; UAE HR & PRO Platform</p>
</div></body></html>`,
    }
}

export function payslipEmail(params: {
    employeeName: string
    month: string
    basicSalary: string
    grossSalary: string
    deductions: string
    netSalary: string
    companyName: string
    appUrl: string
}): EmailOptions {
    const { employeeName, month, basicSalary, grossSalary, deductions, netSalary, companyName, appUrl } = params
    return {
        subject: `Your Payslip for ${h(month)} is Ready`,
        html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto">
            <h2 style="color:#1e293b">Payslip Ready — ${h(month)}</h2>
            <p>Hi ${h(employeeName)},</p>
            <p>Your payslip for <strong>${h(month)}</strong> has been processed by <strong>${h(companyName)}</strong>.</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0">
                <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b">Basic Salary</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right">AED ${h(basicSalary)}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b">Gross Salary</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right">AED ${h(grossSalary)}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b">Deductions</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right">AED ${h(deductions)}</td></tr>
                <tr style="font-weight:700"><td style="padding:8px;color:#1e293b">Net Salary</td><td style="padding:8px;text-align:right;color:#059669">AED ${h(netSalary)}</td></tr>
            </table>
            <a href="${appUrl}/my/payslips" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;margin-top:8px">View Payslip</a>
            <p style="color:#94a3b8;font-size:12px;margin-top:24px">This is an automated message from HRHub.</p>
        </div>`,
        to: '',
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
  <p style="color:#6b7280;">Hi ${h(params.recipientName)}, this is a test email from your HRHub deployment. If you can read this, SMTP / Resend is configured correctly.</p>
  <p style="color:#9ca3af;font-size:12px;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:16px;">HRHub &mdash; UAE HR & PRO Platform</p>
</div></body></html>`,
    }
}
