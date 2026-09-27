import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MONGO_PORT, API_PORT, WEB_URL, MONGO_URI } from './ports.js';

/**
 * The back half of the E2E stack: a one-node MongoDB replica set in memory
 * (the ledger uses multi-document transactions, which need a replica set),
 * then the real API (`server/server.js`) against it.
 *
 * One process owns both so Playwright's `webServer` can start and stop them
 * together, and so the API never boots before its database exists.
 *
 * The API runs with:
 *   NODE_ENV=test          rate limiters and the email-verification gate are
 *                          skipped, exactly as in the server's own suite; the
 *                          flows here sign up and move money back to back.
 *   DOTENV_CONFIG_PATH     an empty file, so server/.env is never read.
 *   FASTAPI_URL            an address nothing listens on: the AI service is not
 *                          part of this stack, and both calls to it fail open
 *                          (categorisation → "Others", fraud score → 0).
 *   no EMAIL_* / FIREBASE_*  mail is printed, never sent; push is mocked.
 *   RAZORPAY_*             placeholders only (see below).
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '../../server');

const replSet = await MongoMemoryReplSet.create({
    replSet: { name: 'e2e', count: 1, storageEngine: 'wiredTiger' },
    instanceOpts: [{ port: MONGO_PORT }],
});
console.log(`[e2e] MongoDB replica set on ${MONGO_PORT}`);

const api = spawn(process.execPath, ['server.js'], {
    cwd: serverDir,
    stdio: 'inherit',
    env: {
        ...process.env,
        // Blank rather than absent, so nothing inherited from the shell leaks in.
        EMAIL_USER: '', EMAIL_PASS: '',
        // Placeholders: the SDK refuses to load without a key id. No spec tops up,
        // so nothing is ever sent to Razorpay with them.
        RAZORPAY_KEY_ID: 'rzp_test_e2e_placeholder', RAZORPAY_KEY_SECRET: 'e2e-placeholder', RAZORPAY_WEBHOOK_SECRET: 'e2e-placeholder',
        FIREBASE_SERVICE_ACCOUNT: '', FIREBASE_SERVICE_ACCOUNT_FILE: '',
        SENTRY_DSN: '',
        NODE_ENV: 'test',
        DOTENV_CONFIG_PATH: path.join(here, 'env.e2e'),
        PORT: String(API_PORT),
        MONGO_URI,
        JWT_SECRET: 'e2e-secret-that-is-at-least-32-characters-long',
        TOTP_ENCRYPTION_KEY: 'a'.repeat(64),
        CORS_ORIGIN: WEB_URL,
        FASTAPI_URL: 'http://127.0.0.1:9',
        LOG_LEVEL: process.env.E2E_API_LOG_LEVEL || 'warn',
    },
});

const shutdown = async (code = 0) => {
    api.kill();
    await replSet.stop().catch(() => {});
    process.exit(code);
};

api.on('exit', (code) => {
    console.error(`[e2e] API exited with code ${code}`);
    shutdown(code ?? 1);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => shutdown(0));
