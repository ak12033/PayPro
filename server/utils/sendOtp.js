import nodemailer from 'nodemailer';
import config from '../config/env.js';

/**
 * A single pooled transport for the process.
 *
 * The previous version constructed a brand new transporter — and therefore a
 * fresh TLS handshake and SMTP login — for every single OTP. Under load that is
 * both slow and a reliable way to trip Gmail's connection-rate limits.
 */
let transporter = null;

const getTransporter = () => {
    if (transporter) return transporter;

    if (!config.EMAIL_USER || !config.EMAIL_PASS) return null;

    transporter = nodemailer.createTransport({
        service: 'gmail',
        pool: true,
        maxConnections: 3,
        maxMessages: 50,
        auth: {
            user: config.EMAIL_USER,
            pass: config.EMAIL_PASS,
        },
        // Never let a hung SMTP server hold a request open indefinitely.
        connectionTimeout: 10000,
        greetingTimeout: 8000,
        socketTimeout: 15000,
    });

    return transporter;
};

const COPY = {
    login: {
        subject: '🔐 Verify Your Login - OTP Code',
        heading: 'Verify Your Login',
        intro: "We detected a login attempt to your PayPro account. To verify it's you, please use the following One-Time Password (OTP):",
        warning: 'If you did not request this login, we strongly recommend updating your password and securing your account immediately.',
    },
    transfer: {
        subject: '🔐 Authorize Your Transfer - OTP Code',
        heading: 'Authorize Your Transfer',
        intro: 'You requested a money transfer from your PayPro wallet. To authorize it, please use the following One-Time Password (OTP):',
        warning: 'If you did not request this transfer, do NOT share this code, and change your password immediately.',
    },
};

/**
 * Send an OTP email.
 *
 * Callers treat this as best-effort and do not await it inside a request: an
 * SMTP outage must not turn a valid login into a 500, and SMTP latency must not
 * be added to the user-visible response time.
 */
const sendOtp = async (email, otp, purpose = 'login') => {
    const mailer = getTransporter();
    const copy = COPY[purpose] || COPY.login;

    if (!mailer) {
        // Without this branch, a missing EMAIL_USER threw from deep inside
        // nodemailer with an unhelpful message.
        if (config.NODE_ENV !== 'production') {
            console.log(`[DEV OTP] ${purpose} code for ${email}: ${otp}`);
            return;
        }
        throw new Error('Email transport is not configured');
    }

    await mailer.sendMail({
        from: `"PayPro Security" <${config.EMAIL_USER}>`,
        to: email,
        subject: copy.subject,
        text: `Hello,

${copy.intro}

${otp}

This code will expire in 10 minutes.

${copy.warning}

Stay safe,
PayPro Security Team`,
        /*
         * Inline literals, and they have to be: mail clients strip <style>
         * blocks and none of them can resolve a CSS custom property, so the
         * app's tokens cannot reach here. The values below are the light-mode
         * values of `--color-accent` (#0e7490), `--color-text` (#0d1117),
         * `--color-text-secondary` (#465561) and `--color-accent-soft`
         * (#cffafe) from client/src/styles/tokens.css, copied deliberately.
         *
         * They were `#007bff` and `#333` — Bootstrap's default blue on a
         * generic grey, which belonged to no palette the product has ever
         * had. A verification code is the first thing a new user sees with
         * the product's name on it, and it was arriving in a different brand
         * than the app it unlocks.
         */
        html: `
      <div style="font-family: Arial, Helvetica, sans-serif; color: #465561; line-height: 1.5;">
        <h2 style="color: #0d1117; margin: 0 0 16px;">🔐 ${copy.heading}</h2>
        <p style="margin: 0 0 12px;">Hello,</p>
        <p style="margin: 0 0 20px;">${copy.intro}</p>
        <p style="margin: 0 0 20px;">
          <span style="display: inline-block; background: #cffafe; color: #0e7490; font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 14px 24px; border-radius: 10px;">${otp}</span>
        </p>
        <p style="margin: 0 0 12px;">This code will expire in <strong style="color: #0d1117;">10 minutes</strong>.</p>
        <p style="margin: 0 0 12px;">${copy.warning}</p>
        <br/>
        <p style="margin: 0;">Stay safe,<br/><strong style="color: #0d1117;">PayPro Security Team</strong></p>
      </div>
    `,
    });
};

export default sendOtp;
