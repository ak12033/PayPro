import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { auditSecretLocations, projectRootFor } from '../utils/secretHygiene.js';

/**
 * `DOTENV_CONFIG_PATH` lets the env file live outside the source tree (plan.md
 * §4.13). It is dotenv's own variable, so the `import 'dotenv/config'` in
 * scripts/*.js honours the same setting with no extra code. Unset, this reads
 * `./.env` exactly as before.
 */
dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || undefined });

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const config = {
    JWT_SECRET: process.env.JWT_SECRET,
    NODE_ENV: process.env.NODE_ENV || 'development',
    EMAIL_USER: process.env.EMAIL_USER,
    EMAIL_PASS: process.env.EMAIL_PASS,
    RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
    FIREBASE_SERVICE_ACCOUNT: process.env.FIREBASE_SERVICE_ACCOUNT,
    // A path to the service-account JSON, kept outside the repository.
    FIREBASE_SERVICE_ACCOUNT_FILE: process.env.FIREBASE_SERVICE_ACCOUNT_FILE,
    FASTAPI_URL: process.env.FASTAPI_URL,
    FASTAPI_API_KEY: process.env.FASTAPI_API_KEY,
    CORS_ORIGIN: process.env.CORS_ORIGIN,
    PORT: process.env.PORT,
    RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET,
    MONGO_URI: process.env.MONGO_URI,
    /**
     * The single definition of "a day"/"a month" for this product — see
     * utils/period.js. Previously three different values were in play:
     * `$dateTrunc` in UTC (analytics), server-local midnight (the transfer 2FA
     * velocity check), and a hardcoded 'Asia/Kolkata' (the cron job). For an
     * India-first product this must be IST everywhere a boundary is computed.
     */
    APP_TIMEZONE: process.env.APP_TIMEZONE || 'Asia/Kolkata',
    /**
     * 32 bytes (64 hex chars or base64) that encrypt authenticator secrets at
     * rest (services/totpService.js). Separate from JWT_SECRET so rotating the
     * token key does not silently lock every TOTP user out. Outside production,
     * a key derived from JWT_SECRET is used when this is unset.
     */
    TOTP_ENCRYPTION_KEY: process.env.TOTP_ENCRYPTION_KEY,
    /**
     * 32 bytes (64 hex chars or base64) that encrypt identity data at rest
     * (utils/fieldEncryption.js): PAN numbers, bank account numbers and every
     * KYC / bank-proof document (plan.md §0.20.2). Its own key, not the TOTP
     * one, so the two can be rotated or scoped separately. Outside production a
     * key derived from JWT_SECRET is used when this is unset. **Changing it
     * makes every stored document and identifier unreadable** — rotation needs a
     * re-encryption pass, which does not exist yet.
     */
    PII_ENCRYPTION_KEY: process.env.PII_ENCRYPTION_KEY,
    /**
     * The demo bill-payment provider (plan.md §19.3). When 'true', bills can be
     * "paid" to a mock biller: the wallet is really debited and nothing is really
     * paid. Refused in production by validateConfig, because there it would take
     * a customer's money and send it nowhere.
     */
    ENABLE_DEMO_BILL_PAYMENTS: process.env.ENABLE_DEMO_BILL_PAYMENTS === 'true',
};

/**
 * Fail fast on missing configuration.
 *
 * Previously every value was read with no validation, so a missing JWT_SECRET
 * booted a server that signed tokens with `undefined` — which jsonwebtoken then
 * rejects at verification time, making every authenticated request fail with an
 * opaque 401 and no clue why. A missing MONGO_URI produced a connection string
 * of the literal text "undefined/PayPro".
 *
 * (STRIPE_SECRET_KEY was also read here but never used anywhere; the dead
 * config/stripe.js that consumed it imported a package that isn't even in
 * package.json, so any accidental import of it crashed the process.)
 */
const REQUIRED = ['JWT_SECRET', 'MONGO_URI'];

const REQUIRED_IN_PRODUCTION = [
    'CORS_ORIGIN',
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
    'RAZORPAY_WEBHOOK_SECRET',
    'TOTP_ENCRYPTION_KEY',
    'PII_ENCRYPTION_KEY',
];

export const validateConfig = () => {
    const missing = REQUIRED.filter((key) => !config[key]);

    if (config.NODE_ENV === 'production') {
        missing.push(...REQUIRED_IN_PRODUCTION.filter((key) => !config[key]));
    }

    if (missing.length) {
        console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
        process.exit(1);
    }

    // A demo biller that takes real money and pays nobody must never run live.
    if (config.NODE_ENV === 'production' && config.ENABLE_DEMO_BILL_PAYMENTS) {
        console.error('❌ ENABLE_DEMO_BILL_PAYMENTS=true is not allowed in production: the demo biller debits real wallets and pays nobody.');
        process.exit(1);
    }

    // A short secret makes offline brute force of the HMAC realistic.
    if (config.JWT_SECRET.length < 32) {
        const message = 'JWT_SECRET should be at least 32 characters of high-entropy random data.';
        if (config.NODE_ENV === 'production') {
            console.error(`❌ ${message}`);
            process.exit(1);
        }
        console.warn(`⚠️  ${message}`);
    }

    const soft = ['EMAIL_USER', 'EMAIL_PASS', 'FASTAPI_URL']
        .filter((key) => !config[key]);
    if (soft.length) {
        console.warn(`⚠️  Optional env vars not set (those features will degrade): ${soft.join(', ')}`);
    }

    // Where the secrets are, not just whether they are set (plan.md §4.13).
    // Fatal only for a production process configured to read a key from inside
    // its own deploy tree; everything else is reported and the server starts.
    const findings = auditSecretLocations({
        serverRoot: SERVER_ROOT,
        projectRoot: projectRootFor(SERVER_ROOT),
        env: { ...process.env, NODE_ENV: config.NODE_ENV },
    });
    for (const finding of findings) {
        const log = finding.level === 'warn' ? console.warn : console.error;
        log(`${finding.level === 'warn' ? '⚠️ ' : '❌'} [${finding.code}] ${finding.message}`);
    }
    if (findings.some((finding) => finding.level === 'fatal')) {
        process.exit(1);
    }
};

export default config;
