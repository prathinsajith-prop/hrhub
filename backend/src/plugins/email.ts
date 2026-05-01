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

// ─── Email templates ──────────────────────────────────────────────────────────

function h(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/**
 * Shared layout wrapper — produces a consistent branded email shell.
 *
 * @param content   Inner HTML (body copy, tables, CTA button)
 * @param accent    Top-border accent colour (defaults to HRHub blue)
 * @param orgName   Organisation name shown in the header (optional)
 * @param preheader Hidden preview text shown in inbox before email is opened
 */
function layout(content: string, accent = '#2563eb', orgName?: string, preheader = ''): string {
    const orgBadge = orgName
        ? `<td align="right" valign="middle"><span style="color:#94a3b8;font-size:12px;font-family:Arial,Helvetica,sans-serif;">${h(orgName)}</span></td>`
        : ''
    return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <title>HRHub</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style>
    @media only screen and (max-width:600px){
      .email-card{width:100%!important;border-radius:0!important;}
      .email-body{padding:24px 20px!important;}
      .btn{width:100%!important;text-align:center!important;display:block!important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  ${preheader ? `<div style="display:none;font-size:1px;color:#f1f5f9;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${h(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>` : ''}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f1f5f9;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" class="email-card" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;width:100%;">

          <!-- ── Header ─────────────────────────────────────────────── -->
          <tr>
            <td style="background-color:#0f172a;border-radius:10px 10px 0 0;padding:20px 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td valign="middle">
                    <span style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">HR<span style="color:#60a5fa;">Hub</span></span>
                  </td>
                  ${orgBadge}
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── Accent stripe ──────────────────────────────────────── -->
          <tr><td style="background-color:${accent};height:3px;font-size:0;line-height:0;">&nbsp;</td></tr>

          <!-- ── Body ──────────────────────────────────────────────── -->
          <tr>
            <td class="email-body" style="background-color:#ffffff;padding:36px 32px 28px;border-radius:0 0 10px 10px;">
              ${content}

              <!-- Footer -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:32px;border-top:1px solid #e2e8f0;">
                <tr>
                  <td align="center" style="padding-top:20px;">
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#94a3b8;">&copy; HRHub.ae &mdash; UAE HR &amp; PRO Platform</p>
                    <p style="margin:5px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#cbd5e1;">This is an automated message. Please do not reply to this email.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/** Renders a coloured alert banner (info, success, warning, danger). */
function banner(text: string, bg: string, border: string, fg: string): string {
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:24px;">
      <tr><td style="background-color:${bg};border-left:4px solid ${border};border-radius:4px;padding:12px 16px;">
        <span style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:${fg};">${text}</span>
      </td></tr>
    </table>`
}

/** Renders a labeled data row table (e.g. leave details, visa info). */
function dataTable(rows: Array<[string, string, string?]>): string {
    const trs = rows.map(([label, value, valColor]) => `
      <tr>
        <td style="font-family:Arial,Helvetica,sans-serif;padding:10px 12px;font-size:13px;color:#64748b;white-space:nowrap;width:40%;">${h(label)}</td>
        <td style="font-family:Arial,Helvetica,sans-serif;padding:10px 12px;font-size:13px;font-weight:600;color:${valColor ?? '#0f172a'};">${h(value)}</td>
      </tr>`).join('')
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
        style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin:20px 0;">
      <tbody>${trs}</tbody>
    </table>`
}

/** Renders a primary CTA button. */
function btn(label: string, url: string, color = '#2563eb'): string {
    return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;">
      <tr>
        <td style="border-radius:8px;background-color:${color};">
          <a href="${h(url)}" class="btn" style="display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:8px;mso-padding-alt:0;text-underline-color:${color};">
            <!--[if mso]><i style="letter-spacing:28px;mso-font-width:-100%;mso-text-raise:30pt">&nbsp;</i><![endif]-->${h(label)}<!--[if mso]><i style="letter-spacing:28px;mso-font-width:-100%">&nbsp;</i><![endif]-->
          </a>
        </td>
      </tr>
    </table>`
}

/** Standard body paragraph. */
function p(text: string, muted = false): string {
    const color = muted ? '#64748b' : '#374151'
    return `<p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:${color};margin:0 0 14px;">${text}</p>`
}

/** Section heading inside the card. */
function heading(text: string): string {
    return `<h2 style="font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:700;color:#0f172a;margin:0 0 20px;">${h(text)}</h2>`
}

// ─── Individual templates ─────────────────────────────────────────────────────

export function passwordResetEmail(params: { name: string; resetUrl: string; expiresInMinutes: number }): EmailOptions {
    const { name, resetUrl, expiresInMinutes } = params
    const content = `
      ${heading('Reset Your Password')}
      ${p(`Hi ${h(name)},`)}
      ${p(`We received a request to reset your HRHub password. Click the button below to choose a new password. This link expires in <strong>${h(String(expiresInMinutes))} minutes</strong>.`, true)}
      ${btn('Reset Password', resetUrl)}
      ${p(`If you didn't request a password reset you can safely ignore this email — your password will remain unchanged.`, true)}
    `
    return { to: '', subject: 'Reset your HRHub password', html: layout(content, '#2563eb', undefined, 'Reset your HRHub password') }
}

export function inviteUserEmail(params: { inviteeName: string; workspaceName: string; role: string; inviteUrl: string }): EmailOptions {
    const { inviteeName, workspaceName, role, inviteUrl } = params
    const content = `
      ${heading(`You're Invited to ${h(workspaceName)}`)}
      ${p(`Hi ${h(inviteeName)},`)}
      ${p(`You've been invited to join <strong>${h(workspaceName)}</strong> on HRHub as <strong>${h(role)}</strong>.`, true)}
      ${btn('Accept Invitation', inviteUrl)}
      ${p('This invitation link expires in 48 hours. If you were not expecting this invitation, please disregard this email.', true)}
    `
    return { to: '', subject: `You're invited to ${h(workspaceName)} on HRHub`, html: layout(content, '#2563eb', workspaceName, `You're invited to join ${workspaceName}`) }
}

export function leaveNotificationEmail(params: { managerName: string; employeeName: string; leaveType: string; startDate: string; endDate: string; approveUrl: string; companyName?: string }): EmailOptions {
    const { managerName, employeeName, leaveType, startDate, endDate, approveUrl, companyName } = params
    const content = `
      ${banner('Leave Request Pending Approval', '#eff6ff', '#2563eb', '#1d4ed8')}
      ${heading('New Leave Request')}
      ${p(`Hi ${h(managerName)},`)}
      ${p(`<strong>${h(employeeName)}</strong> has submitted a leave request that requires your review.`, true)}
      ${dataTable([
          ['Employee', employeeName],
          ['Leave Type', leaveType],
          ['From', startDate],
          ['To', endDate],
      ])}
      ${btn('Review Request', approveUrl)}
    `
    return { to: '', subject: `Leave Request — ${h(employeeName)}`, html: layout(content, '#2563eb', companyName, `${employeeName} has submitted a leave request`) }
}

export function onboardingUploadLinkEmail(params: { employeeName: string; companyName: string; uploadUrl: string; expiresInDays: number }): EmailOptions {
    const { employeeName, companyName, uploadUrl, expiresInDays } = params
    const content = `
      ${banner('Action Required — Document Upload', '#eff6ff', '#2563eb', '#1d4ed8')}
      ${heading(`Welcome, ${h(employeeName)}!`)}
      ${p(`As part of your onboarding at <strong>${h(companyName)}</strong>, we need a few documents from you. Please use the secure link below to upload them at your convenience.`, true)}
      ${p('For each onboarding step you will see exactly which documents are required. Simply upload the files and the HR team will review them.', true)}
      ${btn('Upload My Documents', uploadUrl)}
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr><td style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px 16px;">
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#64748b;">
            This link is personal to you and valid for <strong>${expiresInDays} days</strong>. Please do not share it with others.
          </p>
        </td></tr>
      </table>
    `
    return { to: '', subject: `Action required: Upload your onboarding documents — ${h(companyName)}`, html: layout(content, '#2563eb', companyName, `Upload your onboarding documents for ${companyName}`) }
}

export function visaExpiryAlertEmail(params: { recipientName: string; employeeName: string; visaType: string; expiryDate: string; daysRemaining: number; actionUrl: string; companyName?: string }): EmailOptions {
    const { recipientName, employeeName, visaType, expiryDate, daysRemaining, actionUrl, companyName } = params
    const accent = daysRemaining <= 30 ? '#dc2626' : daysRemaining <= 60 ? '#d97706' : '#2563eb'
    const bannerBg = daysRemaining <= 30 ? '#fef2f2' : daysRemaining <= 60 ? '#fffbeb' : '#eff6ff'
    const bannerBorder = accent
    const bannerFg = daysRemaining <= 30 ? '#b91c1c' : daysRemaining <= 60 ? '#92400e' : '#1d4ed8'
    const urgencyLabel = daysRemaining <= 30 ? 'Urgent' : daysRemaining <= 60 ? 'Attention Required' : 'Upcoming Expiry'
    const content = `
      ${banner(`${urgencyLabel} — ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining`, bannerBg, bannerBorder, bannerFg)}
      ${heading('Visa Expiry Alert')}
      ${p(`Hi ${h(recipientName)},`)}
      ${p(`The visa for <strong>${h(employeeName)}</strong> is approaching its expiry date. Please take action to ensure continuity of their work authorisation.`, true)}
      ${dataTable([
          ['Employee', employeeName],
          ['Visa Type', visaType],
          ['Expiry Date', expiryDate, accent],
          ['Days Remaining', String(daysRemaining), accent],
      ])}
      ${btn('Take Action Now', actionUrl, accent)}
    `
    return { to: '', subject: `Visa Expiry Alert: ${h(employeeName)} — ${daysRemaining} days remaining`, html: layout(content, accent, companyName, `${employeeName}'s visa expires in ${daysRemaining} days`) }
}

// ─── Document lifecycle ───────────────────────────────────────────────────────

export function documentVerifiedEmail(params: { employeeName: string; docType: string; verifiedBy: string; companyName: string }): EmailOptions {
    const { employeeName, docType, verifiedBy, companyName } = params
    const content = `
      ${banner('Document Successfully Verified', '#ecfdf5', '#10b981', '#047857')}
      ${heading(`Hi ${h(employeeName)},`)}
      ${p(`Great news — your <strong>${h(docType)}</strong> has been reviewed and verified by <strong>${h(verifiedBy)}</strong> at <strong>${h(companyName)}</strong>.`, true)}
      ${p('No further action is required from you for this document. It is now part of your official HR record.', true)}
    `
    return { to: '', subject: `Your ${h(docType)} has been verified — ${h(companyName)}`, html: layout(content, '#10b981', companyName, `Your ${docType} has been verified`) }
}

export function documentRejectedEmail(params: { employeeName: string; docType: string; reason: string; uploadUrl?: string; companyName: string }): EmailOptions {
    const { employeeName, docType, reason, uploadUrl, companyName } = params
    const content = `
      ${banner('Document Rejected — Resubmission Required', '#fef2f2', '#dc2626', '#b91c1c')}
      ${heading(`Hi ${h(employeeName)},`)}
      ${p(`Your <strong>${h(docType)}</strong> submitted to <strong>${h(companyName)}</strong> could not be accepted. Please review the reason below and re-upload a corrected version.`, true)}
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0;">
        <tr><td style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;">
          <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">Reason for Rejection</p>
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#0f172a;">${h(reason)}</p>
        </td></tr>
      </table>
      ${uploadUrl ? btn('Re-upload Document', uploadUrl, '#dc2626') : ''}
      ${p('If you have questions about the rejection or need assistance, please contact your HR team directly.', true)}
    `
    return { to: '', subject: `Action required: Re-upload your ${h(docType)} — ${h(companyName)}`, html: layout(content, '#dc2626', companyName, `Your ${docType} requires resubmission`) }
}

export function documentExpiryAlertEmail(params: { recipientName: string; employeeName: string; docType: string; expiryDate: string; daysRemaining: number; actionUrl: string; companyName?: string }): EmailOptions {
    const { recipientName, employeeName, docType, expiryDate, daysRemaining, actionUrl, companyName } = params
    const accent = daysRemaining <= 14 ? '#dc2626' : daysRemaining <= 30 ? '#d97706' : '#2563eb'
    const bannerBg = daysRemaining <= 14 ? '#fef2f2' : daysRemaining <= 30 ? '#fffbeb' : '#eff6ff'
    const bannerFg = daysRemaining <= 14 ? '#b91c1c' : daysRemaining <= 30 ? '#92400e' : '#1d4ed8'
    const content = `
      ${banner(`Document Expiring in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`, bannerBg, accent, bannerFg)}
      ${heading('Document Expiry Reminder')}
      ${p(`Hi ${h(recipientName)},`)}
      ${p('The following document is approaching its expiry date. Please take the necessary steps to renew or update it.', true)}
      ${dataTable([
          ['Employee', employeeName],
          ['Document', docType],
          ['Expiry Date', expiryDate, accent],
          ['Days Remaining', String(daysRemaining), accent],
      ])}
      ${btn('Review Document', actionUrl, accent)}
    `
    return { to: '', subject: `Document Expiry Reminder: ${h(docType)} for ${h(employeeName)} — ${daysRemaining} days`, html: layout(content, accent, companyName, `${docType} for ${employeeName} expires in ${daysRemaining} days`) }
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
    const content = `
      ${heading(`Payslip for ${h(month)}`)}
      ${p(`Hi ${h(employeeName)},`)}
      ${p(`Your payslip for <strong>${h(month)}</strong> has been processed by <strong>${h(companyName)}</strong> and is now available to view.`, true)}
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin:20px 0;">
        <tr style="background-color:#f8fafc;">
          <td style="font-family:Arial,Helvetica,sans-serif;padding:10px 16px;font-size:13px;color:#64748b;">Basic Salary</td>
          <td style="font-family:Arial,Helvetica,sans-serif;padding:10px 16px;font-size:13px;color:#0f172a;text-align:right;">AED ${h(basicSalary)}</td>
        </tr>
        <tr>
          <td style="font-family:Arial,Helvetica,sans-serif;padding:10px 16px;font-size:13px;color:#64748b;">Gross Salary</td>
          <td style="font-family:Arial,Helvetica,sans-serif;padding:10px 16px;font-size:13px;color:#0f172a;text-align:right;">AED ${h(grossSalary)}</td>
        </tr>
        <tr style="background-color:#f8fafc;">
          <td style="font-family:Arial,Helvetica,sans-serif;padding:10px 16px;font-size:13px;color:#64748b;">Deductions</td>
          <td style="font-family:Arial,Helvetica,sans-serif;padding:10px 16px;font-size:13px;color:#dc2626;text-align:right;">- AED ${h(deductions)}</td>
        </tr>
        <tr style="background-color:#f0fdf4;">
          <td style="font-family:Arial,Helvetica,sans-serif;padding:13px 16px;font-size:15px;font-weight:700;color:#0f172a;border-top:2px solid #e2e8f0;">Net Salary</td>
          <td style="font-family:Arial,Helvetica,sans-serif;padding:13px 16px;font-size:15px;font-weight:700;color:#059669;text-align:right;border-top:2px solid #e2e8f0;">AED ${h(netSalary)}</td>
        </tr>
      </table>
      ${btn('View Full Payslip', `${appUrl}/my/payslips`)}
    `
    return { to: '', subject: `Your Payslip for ${h(month)} — ${h(companyName)}`, html: layout(content, '#2563eb', companyName, `Your ${month} payslip from ${companyName} is ready`) }
}

export function mailTestEmail(params: { recipientName: string }): EmailOptions {
    const content = `
      ${banner('Mail Configuration Verified', '#ecfdf5', '#10b981', '#047857')}
      ${heading('Your email is working!')}
      ${p(`Hi ${h(params.recipientName)},`)}
      ${p('This is a test message from your HRHub deployment. If you can read this, your SMTP / Resend configuration is set up correctly and email delivery is functional.', true)}
    `
    return { to: '', subject: 'HRHub — Mail configuration test', html: layout(content, '#10b981', undefined, 'HRHub email test succeeded') }
}
