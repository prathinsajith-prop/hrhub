import nodemailer, { type Transporter } from 'nodemailer'
import { loadEnv } from '../env.js'

let transporter: Transporter | null = null

// Aggressive timeouts so a stuck SMTP server (e.g. Railway egress unable to
// complete TLS to smtp.gmail.com) fails fast instead of leaving the HTTP
// request hanging until Railway's 30s LB timeout kills it.
const SMTP_TIMEOUTS = {
    connectionTimeout: 10_000, // ms to wait for TCP/TLS handshake
    greetingTimeout: 10_000,   // ms to wait for the server greeting
    socketTimeout: 15_000,     // ms of idle on the established socket
} as const

function getTransporter(): Transporter {
    if (transporter) return transporter
    const env = loadEnv()
    if (env.EMAIL_PROVIDER === 'resend') {
        if (!env.RESEND_API_KEY) throw new Error('EMAIL_PROVIDER=resend but RESEND_API_KEY is not set')
        transporter = nodemailer.createTransport({
            host: 'smtp.resend.com',
            port: 465,
            secure: true,
            auth: { user: 'resend', pass: env.RESEND_API_KEY },
            ...SMTP_TIMEOUTS,
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
            ...SMTP_TIMEOUTS,
        })
    } else {
        transporter = nodemailer.createTransport({
            host: env.SMTP_HOST,
            port: env.SMTP_PORT,
            secure: env.SMTP_PORT === 465,
            auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
            tls: { rejectUnauthorized: env.NODE_ENV === 'production' },
            ...SMTP_TIMEOUTS,
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

export interface SendResult {
    ok: boolean
    messageId?: string
    error?: string
}

export async function sendEmail(opts: EmailOptions): Promise<SendResult> {
    const env = loadEnv()
    if (!opts.to) return { ok: false, error: 'No recipient' }
    try {
        const t = getTransporter()
        const info = await t.sendMail({
            from: `"${env.EMAIL_FROM_NAME}" <${env.EMAIL_FROM}>`,
            to: opts.to,
            subject: opts.subject,
            html: opts.html,
            text: opts.text ?? opts.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
        })
        return { ok: true, messageId: info.messageId }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[email] send failed:', msg)
        if (env.NODE_ENV !== 'production' && env.EMAIL_DEV_FALLBACK) {
            return { ok: true, messageId: 'dev-fallback' }
        }
        return { ok: false, error: msg }
    }
}

function escape(str: string): string {
    return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

export function passwordResetEmail(params: { name: string; resetUrl: string; expiresInMinutes: number }): EmailOptions {
    const { name, resetUrl, expiresInMinutes } = params
    const safeName = escape(name)
    const safeUrl = escape(resetUrl)
    const html = `
<!DOCTYPE html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#f7f8fb; padding:32px 16px; color:#0f172a;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="100%" style="max-width:560px; background:#ffffff; border-radius:16px; box-shadow:0 4px 16px rgba(99,102,241,0.08); overflow:hidden;">
    <tr>
      <td style="padding:32px 36px 0;">
        <div style="display:inline-block; padding:6px 10px; border-radius:999px; background:linear-gradient(135deg,#6366f1,#0ea5e9); color:#fff; font-size:12px; font-weight:700; letter-spacing:0.04em;">HRHUB PORTAL</div>
      </td>
    </tr>
    <tr>
      <td style="padding:18px 36px 24px;">
        <h1 style="margin:0 0 12px; font-size:22px; font-weight:700; color:#0f172a;">Reset your password</h1>
        <p style="margin:0 0 14px; line-height:1.6; color:#334155;">Hi ${safeName},</p>
        <p style="margin:0 0 18px; line-height:1.6; color:#334155;">
          We received a request to reset your HRHub Portal password. Click the button below to choose a new one.
          This link will expire in <strong>${expiresInMinutes} minutes</strong>.
        </p>
        <p style="margin:24px 0; text-align:center;">
          <a href="${safeUrl}" style="display:inline-block; padding:12px 28px; border-radius:12px; background:linear-gradient(135deg,#6366f1,#0ea5e9); color:#ffffff; text-decoration:none; font-weight:600;">Reset password</a>
        </p>
        <p style="margin:0 0 8px; line-height:1.6; color:#64748b; font-size:13px;">
          If the button doesn't work, paste this URL into your browser:
        </p>
        <p style="margin:0 0 18px; word-break:break-all; color:#475569; font-size:12px; font-family:ui-monospace, SFMono-Regular, Menlo, monospace;">${safeUrl}</p>
        <p style="margin:0; line-height:1.6; color:#64748b; font-size:13px;">
          Didn't request this? You can safely ignore this email — your password will remain unchanged.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:18px 36px 28px; border-top:1px solid #e2e8f0; color:#94a3b8; font-size:12px;">
        Sent by HRHub Portal · This is an automated message.
      </td>
    </tr>
  </table>
</body></html>`.trim()
    return { to: '', subject: 'Reset your HRHub Portal password', html }
}
