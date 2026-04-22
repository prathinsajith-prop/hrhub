/**
 * Email service — supports SMTP (Mailpit in dev, real SMTP in prod) and Resend.
 * Provider is selected by EMAIL_PROVIDER env var (smtp | resend).
 */
import nodemailer from 'nodemailer'
import { loadEnv } from '../config/env.js'

let transporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter {
    if (transporter) return transporter
    const env = loadEnv()
    if (env.EMAIL_PROVIDER === 'resend') {
        transporter = nodemailer.createTransport({
            host: 'smtp.resend.com',
            port: 465,
            secure: true,
            auth: { user: 'resend', pass: env.RESEND_API_KEY },
        })
    } else {
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
}

export async function sendEmail(opts: EmailOptions): Promise<boolean> {
    const env = loadEnv()
    try {
        const t = getTransporter()
        await t.sendMail({
            from: `"${env.EMAIL_FROM_NAME}" <${env.EMAIL_FROM}>`,
            to: opts.to,
            subject: opts.subject,
            html: opts.html,
            text: opts.text ?? opts.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
        })
        return true
    } catch (err) {
        console.error('[email] Failed to send email to', opts.to, err)
        return false
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
