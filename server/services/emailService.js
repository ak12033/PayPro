import nodemailer from 'nodemailer';
import config from '../config/env.js';
import logger from '../utils/logger.js';

/**
 * The one pooled SMTP transport for the process — moved here from
 * `utils/sendOtp.js` (which now imports it back via `getTransporter`) so
 * OTP mail and the new transactional templates below share a single
 * connection pool instead of each opening their own.
 */
let transporter = null;

export const getTransporter = () => {
    if (transporter) return transporter;
    if (!config.EMAIL_USER || !config.EMAIL_PASS) return null;

    transporter = nodemailer.createTransport({
        service: 'gmail',
        pool: true,
        maxConnections: 3,
        maxMessages: 50,
        auth: { user: config.EMAIL_USER, pass: config.EMAIL_PASS },
        connectionTimeout: 10000,
        greetingTimeout: 8000,
        socketTimeout: 15000,
    });

    return transporter;
};

/**
 * Same brand colours as `sendOtp.js` — the light-mode values of
 * `--color-accent`/`--color-text`/`--color-text-secondary`/`--color-accent-soft`
 * from `client/src/styles/tokens.css`, copied deliberately because mail
 * clients strip `<style>` blocks and cannot resolve a CSS custom property.
 */
const renderHtml = ({ heading, bodyLines, accentLine }) => `
  <div style="font-family: Arial, Helvetica, sans-serif; color: #465561; line-height: 1.5;">
    <h2 style="color: #0d1117; margin: 0 0 16px;">${heading}</h2>
    ${bodyLines.map((line) => `<p style="margin: 0 0 12px;">${line}</p>`).join('\n')}
    ${accentLine ? `<p style="margin: 0 0 20px;"><span style="display:inline-block;background:#cffafe;color:#0e7490;font-weight:bold;padding:10px 16px;border-radius:10px;">${accentLine}</span></p>` : ''}
    <br/>
    <p style="margin: 0;">Stay safe,<br/><strong style="color: #0d1117;">PayPro</strong></p>
  </div>
`;

/**
 * Generic templated send. Best-effort by design, same as `sendOtp` — an SMTP
 * outage must never turn a valid transaction into a 500, so every call site
 * in this codebase treats the returned promise as fire-and-forget.
 */
const sendTemplatedEmail = async ({ to, subject, heading, bodyLines, accentLine }) => {
    const mailer = getTransporter();

    if (!mailer) {
        if (config.NODE_ENV !== 'production') {
            console.log(`[DEV EMAIL] ${subject} -> ${to}`);
            return;
        }
        throw new Error('Email transport is not configured');
    }

    await mailer.sendMail({
        from: `"PayPro" <${config.EMAIL_USER}>`,
        to,
        subject,
        text: [heading, '', ...bodyLines, '', accentLine, '', 'Stay safe,\nPayPro'].filter(Boolean).join('\n'),
        html: renderHtml({ heading, bodyLines, accentLine }),
    });
};

const money = (amount) => `₹${Number(amount).toFixed(2)}`;

const TEMPLATES = {
    topupSuccess: (data) => ({
        subject: '✅ Wallet topped up',
        heading: 'Wallet Top-Up Successful',
        bodyLines: [`Your wallet has been credited with ${money(data.amount)}.`],
    }),
    topupFailed: (data) => ({
        subject: '⚠️ Top-up failed',
        heading: 'Wallet Top-Up Failed',
        bodyLines: [`Your top-up of ${money(data.amount)} could not be completed.`, data.reason ? `Reason: ${data.reason}` : ''].filter(Boolean),
    }),
    transferSent: (data) => ({
        subject: '💸 Money sent',
        heading: 'Transfer Successful',
        bodyLines: [`You sent ${money(data.amount)} to ${data.counterpartyName}.`],
    }),
    transferReceived: (data) => ({
        subject: '💰 Money received',
        heading: 'Money Received',
        bodyLines: [`You received ${money(data.amount)} from ${data.counterpartyName}.`],
    }),
    refundProcessed: (data) => ({
        subject: '↩️ Refund processed',
        heading: 'Refund Processed',
        bodyLines: [`A refund of ${money(data.amount)} has been processed to your wallet.`],
    }),
    highRiskTransaction: (data) => ({
        subject: '🔒 Unusual transaction flagged',
        heading: 'High-Risk Transaction Detected',
        bodyLines: [`A recent transaction of ${money(data.amount)} was flagged as unusual. Please review your account activity.`],
    }),
    newDeviceLogin: (data) => ({
        subject: '🔒 New sign-in detected',
        heading: 'New Device Sign-In',
        bodyLines: [`Your account was just accessed from a new device${data.location ? ` in ${data.location}` : ''}. If this wasn't you, secure your account immediately.`],
    }),
    /** Second-factor changes: enrolled, removed, codes re-issued, reset by staff. */
    securityChange: (data) => ({
        subject: `🔒 ${data.title}`,
        heading: data.title,
        bodyLines: [data.body],
    }),
    /**
     * Identity verification and bank-account outcomes (Phase 5). The body is
     * written by the caller and never carries an identifier, a document name or
     * a reviewer's internal notes — only the user-visible reason.
     */
    accountUpdate: (data) => ({
        subject: `🪪 ${data.title}`,
        heading: data.title,
        bodyLines: [data.body],
    }),
    /** Every withdrawal state change. Money leaving PayPro is always worth an email. */
    withdrawalUpdate: (data) => ({
        subject: `🏦 ${data.title}`,
        heading: data.title,
        bodyLines: [data.body],
    }),
};

/** Templates that ignore `preferences.emailAlerts` — security-relevant events a user cannot silence (plan.md §26.3). */
const ALWAYS_ON_TEMPLATES = new Set([
    'highRiskTransaction', 'newDeviceLogin', 'securityChange',
    /**
     * Money leaving to a bank account is the step an account takeover ends in,
     * and a verification outcome changes what the account can do. Neither can be
     * switched off (plan.md §26.3, §0.20.2).
     */
    'accountUpdate', 'withdrawalUpdate',
]);

/**
 * Send one of the templates above to `user`, honouring
 * `preferences.emailAlerts` except for the always-on security templates.
 * Never throws — a failed send is logged and swallowed, matching every other
 * best-effort notification path in this codebase.
 */
export const sendEmailAlert = async (user, template, data = {}) => {
    if (!user?.email) return;
    if (!ALWAYS_ON_TEMPLATES.has(template) && user.preferences?.emailAlerts === false) return;

    const build = TEMPLATES[template];
    if (!build) return;

    try {
        await sendTemplatedEmail({ to: user.email, ...build(data) });
    } catch (err) {
        // userId, not the address: the log sink is not a place for PII (plan.md §39.3).
        logger.error('Email alert failed', { template, targetUserId: String(user._id), error: err.message });
    }
};

export default { getTransporter, sendEmailAlert };
