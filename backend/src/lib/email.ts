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
            ignoreTLS: env.SMTP_PORT === 1025, // Mailpit dev
        })
    }
    return transporter
}

interface EmailOptions {
    to: string
    subject: string
    html: string
    text?: string
}

export async function sendEmail(opts: EmailOptions): Promise<void> {
    const env = loadEnv()
    try {
        await getTransporter().sendMail({
            from: `"${env.EMAIL_FROM_NAME}" <${env.EMAIL_FROM}>`,
            ...opts,
        })
    } catch (err) {
        // Log but don't throw — email failures shouldn't break the API
        console.error('[email] Failed to send email:', err)
    }
}

// ─── Email Templates ──────────────────────────────────────────────────────────

export function emailPasswordReset(name: string, resetUrl: string): string {
    return `
<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
<div style="background:#1e293b;padding:24px;border-radius:8px 8px 0 0;text-align:center">
  <h1 style="color:#fff;margin:0;font-size:22px">HRHub.ae</h1>
</div>
<div style="background:#f8fafc;padding:32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
  <h2 style="color:#0f172a;margin-top:0">Password Reset Request</h2>
  <p style="color:#475569">Hi ${name},</p>
  <p style="color:#475569">You requested a password reset. Click the button below within 1 hour:</p>
  <div style="text-align:center;margin:32px 0">
    <a href="${resetUrl}" style="background:#3b82f6;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">Reset Password</a>
  </div>
  <p style="color:#94a3b8;font-size:13px">If you didn't request this, ignore this email. Link expires in 1 hour.</p>
  <p style="color:#94a3b8;font-size:12px">— HRHub.ae Team</p>
</div>
</body></html>`
}

export function emailUserInvite(name: string, workspaceName: string, role: string, setPasswordUrl: string): string {
    return `
<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
<div style="background:#1e293b;padding:24px;border-radius:8px 8px 0 0;text-align:center">
  <h1 style="color:#fff;margin:0;font-size:22px">HRHub.ae</h1>
</div>
<div style="background:#f8fafc;padding:32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
  <h2 style="color:#0f172a;margin-top:0">You've been invited!</h2>
  <p style="color:#475569">Hi ${name},</p>
  <p style="color:#475569">You've been invited to join <strong>${workspaceName}</strong> on HRHub.ae as <strong>${role.replace(/_/g, ' ')}</strong>.</p>
  <div style="text-align:center;margin:32px 0">
    <a href="${setPasswordUrl}" style="background:#10b981;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">Set Password & Join</a>
  </div>
  <p style="color:#94a3b8;font-size:13px">This invitation link expires in 48 hours.</p>
  <p style="color:#94a3b8;font-size:12px">— HRHub.ae Team</p>
</div>
</body></html>`
}

export function emailVisaExpiry(hrName: string, employeeName: string, visaType: string, expiryDate: string, daysLeft: number): string {
    const urgencyColor = daysLeft <= 7 ? '#ef4444' : daysLeft <= 30 ? '#f97316' : '#eab308'
    return `
<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
<div style="background:#1e293b;padding:24px;border-radius:8px 8px 0 0;text-align:center">
  <h1 style="color:#fff;margin:0;font-size:22px">HRHub.ae — Visa Expiry Alert</h1>
</div>
<div style="background:#f8fafc;padding:32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
  <p style="color:#475569">Hi ${hrName},</p>
  <div style="background:#fff;border:2px solid ${urgencyColor};border-radius:8px;padding:20px;margin:16px 0">
    <p style="margin:0;color:#0f172a"><strong>Employee:</strong> ${employeeName}</p>
    <p style="margin:8px 0;color:#0f172a"><strong>Visa Type:</strong> ${visaType}</p>
    <p style="margin:8px 0;color:#0f172a"><strong>Expiry Date:</strong> ${expiryDate}</p>
    <p style="margin:8px 0 0;color:${urgencyColor};font-weight:700;font-size:16px">⚠️ Expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}</p>
  </div>
  <p style="color:#475569">Please take action in the HRHub Visa Management module to renew or cancel this visa.</p>
  <p style="color:#94a3b8;font-size:12px">— HRHub.ae Automated Alerts</p>
</div>
</body></html>`
}

export function emailLeaveRequest(managerName: string, employeeName: string, leaveType: string, startDate: string, endDate: string, days: number, actionUrl: string): string {
    return `
<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
<div style="background:#1e293b;padding:24px;border-radius:8px 8px 0 0;text-align:center">
  <h1 style="color:#fff;margin:0;font-size:22px">HRHub.ae — Leave Request</h1>
</div>
<div style="background:#f8fafc;padding:32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
  <p style="color:#475569">Hi ${managerName},</p>
  <p style="color:#475569"><strong>${employeeName}</strong> has submitted a leave request that requires your approval:</p>
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:16px 0">
    <p style="margin:0;color:#0f172a"><strong>Type:</strong> ${leaveType.replace(/_/g, ' ')}</p>
    <p style="margin:8px 0;color:#0f172a"><strong>From:</strong> ${startDate} &nbsp;<strong>To:</strong> ${endDate}</p>
    <p style="margin:8px 0 0;color:#0f172a"><strong>Duration:</strong> ${days} day${days !== 1 ? 's' : ''}</p>
  </div>
  <div style="text-align:center;margin:24px 0">
    <a href="${actionUrl}" style="background:#3b82f6;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Review Request</a>
  </div>
  <p style="color:#94a3b8;font-size:12px">— HRHub.ae</p>
</div>
</body></html>`
}

export function emailPayrollReady(hrName: string, period: string, totalEmployees: number, netTotal: number, actionUrl: string): string {
    return `
<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
<div style="background:#1e293b;padding:24px;border-radius:8px 8px 0 0;text-align:center">
  <h1 style="color:#fff;margin:0;font-size:22px">HRHub.ae — Payroll Ready</h1>
</div>
<div style="background:#f8fafc;padding:32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
  <p style="color:#475569">Hi ${hrName},</p>
  <p style="color:#475569">The <strong>${period}</strong> payroll run has been processed and is ready for WPS submission:</p>
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:16px 0">
    <p style="margin:0;color:#0f172a"><strong>Period:</strong> ${period}</p>
    <p style="margin:8px 0;color:#0f172a"><strong>Employees Processed:</strong> ${totalEmployees}</p>
    <p style="margin:8px 0 0;color:#0f172a"><strong>Total Net Payroll:</strong> AED ${netTotal.toLocaleString('en-AE', { minimumFractionDigits: 2 })}</p>
  </div>
  <div style="text-align:center;margin:24px 0">
    <a href="${actionUrl}" style="background:#10b981;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Review & Submit WPS</a>
  </div>
  <p style="color:#94a3b8;font-size:12px">— HRHub.ae</p>
</div>
</body></html>`
}
