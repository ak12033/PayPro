import dotenv from 'dotenv';
dotenv.config();

const config = {
    JWT_SECRET: process.env.JWT_SECRET,
    NODE_ENV: process.env.NODE_ENV || 'development',
    EMAIL_USER: process.env.EMAIL_USER,
    EMAIL_PASS: process.env.EMAIL_PASS,
    RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
    FIREBASE_SERVICE_ACCOUNT: process.env.FIREBASE_SERVICE_ACCOUNT,
    FASTAPI_URL: process.env.FASTAPI_URL,
    FASTAPI_API_KEY: process.env.FASTAPI_API_KEY,
    CORS_ORIGIN: process.env.CORS_ORIGIN,
    PORT: process.env.PORT,
    RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET,
    MONGO_URI: process.env.MONGO_URI
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
};

export default config;
