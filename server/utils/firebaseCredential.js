import fs from 'fs';

/**
 * Where Firebase Admin's service-account credential comes from.
 *
 * Kept apart from `utils/fcm.js`, which initialises firebase-admin the moment it
 * is imported, so the resolution order can be tested without a Firebase app.
 *
 * Order, first usable wins:
 *   1. FIREBASE_SERVICE_ACCOUNT       — the JSON itself (raw or base64), for hosts
 *                                       that inject secrets as env vars
 *   2. FIREBASE_SERVICE_ACCOUNT_FILE  — a path to the JSON, for a key kept
 *                                       outside the source tree (plan.md §4.13)
 *   3. GOOGLE_APPLICATION_CREDENTIALS — Google's application default credentials
 */

export const parseServiceAccount = (raw) => {
    if (!raw || !String(raw).trim()) return { error: null, serviceAccount: null };
    try {
        // Support both a raw JSON string and a base64-encoded one, since many
        // hosts mangle multi-line values.
        const text = String(raw).trim().startsWith('{')
            ? String(raw)
            : Buffer.from(String(raw), 'base64').toString('utf8');

        const parsed = JSON.parse(text);
        if (!parsed?.private_key || !parsed?.client_email) {
            return { error: 'missing private_key or client_email', serviceAccount: null };
        }
        // Env vars frequently arrive with the newlines in the private key escaped.
        parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
        return { error: null, serviceAccount: parsed };
    } catch (err) {
        return { error: err.message, serviceAccount: null };
    }
};

/**
 * @returns {{ source: 'env'|'file'|'adc'|'none', serviceAccount?: object, errors: string[] }}
 *   `errors` names every configured source that could not be used, so a typo in
 *   one variable is reported even when a later source succeeds.
 */
export const resolveFirebaseCredential = (env = process.env, { readFile = fs.readFileSync } = {}) => {
    const errors = [];

    const inline = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT);
    if (inline.serviceAccount) return { source: 'env', serviceAccount: inline.serviceAccount, errors };
    if (inline.error) errors.push(`FIREBASE_SERVICE_ACCOUNT could not be parsed: ${inline.error}`);

    const file = env.FIREBASE_SERVICE_ACCOUNT_FILE;
    if (file) {
        let contents = null;
        try {
            contents = readFile(file, 'utf8');
        } catch (err) {
            errors.push(`FIREBASE_SERVICE_ACCOUNT_FILE could not be read: ${err.code || err.message}`);
        }
        if (contents !== null) {
            const fromFile = parseServiceAccount(contents);
            if (fromFile.serviceAccount) return { source: 'file', serviceAccount: fromFile.serviceAccount, errors };
            errors.push(`FIREBASE_SERVICE_ACCOUNT_FILE could not be parsed: ${fromFile.error ?? 'empty file'}`);
        }
    }

    if (env.GOOGLE_APPLICATION_CREDENTIALS) return { source: 'adc', errors };

    return { source: 'none', errors };
};
