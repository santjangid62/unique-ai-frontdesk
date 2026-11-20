import { env } from '../config/env.js';

/**
 * Transactional email delivery.
 *
 * Uses the Resend HTTP API directly (no SDK, no extra dependency). When
 * RESEND_API_KEY is missing the message is logged to the server console in
 * development so the verification/reset flow stays testable offline, and the
 * caller is told delivery was skipped through `delivered: false`.
 */
export async function sendEmail({ to, subject, html, text }) {
  const recipient = String(to || '').trim();
  if (!recipient) return { delivered: false, reason: 'missing_recipient' };

  if (!env.resendApiKey) {
    if (!env.isProd) {
      console.info('[email] RESEND_API_KEY is not set — message not sent.');
      console.info(`[email] to=${recipient} subject=${subject}`);
      if (text) console.info(`[email] body:\n${text}`);
    }
    return { delivered: false, reason: 'not_configured' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.mailFrom,
        to: [recipient],
        subject,
        html,
        text,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error(`[email] Resend rejected the message (${response.status}): ${detail.slice(0, 300)}`);
      return { delivered: false, reason: 'provider_error', status: response.status };
    }

    return { delivered: true };
  } catch (error) {
    console.error('[email] delivery failed', error.message);
    return { delivered: false, reason: 'network_error' };
  }
}

const layout = (title, bodyLines) => `<!doctype html>
<html><body style="font-family:Segoe UI,Arial,sans-serif;background:#f8fafc;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#6366f1">Unique AI Frontdesk</p>
    <h1 style="margin:0 0 16px;font-size:20px;color:#0f172a">${title}</h1>
    ${bodyLines.join('\n')}
    <p style="margin-top:24px;font-size:12px;color:#94a3b8">If you did not request this, you can ignore this email.</p>
  </div>
</body></html>`;

export async function sendVerificationEmail({ to, name, businessName, code }) {
  const subject = `${code} is your Unique AI Frontdesk verification code`;
  const text = [
    `Namaste ${name},`,
    '',
    `Your verification code for ${businessName} is ${code}.`,
    'The code expires in 15 minutes.',
    '',
    'Enter it on the verification page to activate your business account.',
  ].join('\n');
  const html = layout('Verify your business email', [
    `<p style="color:#334155">Namaste ${name},</p>`,
    `<p style="color:#334155">Use this code to verify <strong>${businessName}</strong>:</p>`,
    `<p style="font-size:32px;letter-spacing:8px;font-weight:700;color:#4f46e5;margin:16px 0">${code}</p>`,
    '<p style="color:#64748b;font-size:14px">The code expires in 15 minutes.</p>',
  ]);
  return sendEmail({ to, subject, html, text });
}

export async function sendPasswordResetEmail({ to, name, resetUrl }) {
  const subject = 'Reset your Unique AI Frontdesk password';
  const text = [
    `Namaste ${name},`,
    '',
    'Open this link to choose a new password (valid for one hour):',
    resetUrl,
  ].join('\n');
  const html = layout('Reset your password', [
    `<p style="color:#334155">Namaste ${name},</p>`,
    '<p style="color:#334155">Open the link below to choose a new password. It is valid for one hour and can be used once.</p>',
    `<p><a href="${resetUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px">Reset password</a></p>`,
  ]);
  return sendEmail({ to, subject, html, text });
}
