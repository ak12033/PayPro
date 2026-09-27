import admin from "firebase-admin";
import config from "../config/env.js";
import { resolveFirebaseCredential } from "./firebaseCredential.js";
import logger from './logger.js';

/**
 * Firebase Admin initialisation.
 *
 * The previous version read the service-account JSON from a hardcoded path
 * (`../config/paypro-...-firebase-adminsdk-....json`). That file is gitignored
 * and is not present in any deployment, so on every hosted environment the
 * initialisation threw, `isFirebaseInitialized` stayed false, and every push
 * notification was silently swallowed by the "[MOCK PUSH]" branch. Meanwhile
 * `FIREBASE_SERVICE_ACCOUNT` was defined in env.js and never read.
 *
 * Credentials now come from the environment (inline JSON/base64), from a file
 * kept outside the source tree, or from Google's Application Default
 * Credentials — in that order; see `utils/firebaseCredential.js`.
 */
let isFirebaseInitialized = false;

if (!admin.apps.length) {
    const credential = resolveFirebaseCredential({
        FIREBASE_SERVICE_ACCOUNT: config.FIREBASE_SERVICE_ACCOUNT,
        FIREBASE_SERVICE_ACCOUNT_FILE: config.FIREBASE_SERVICE_ACCOUNT_FILE,
        GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    });
    for (const error of credential.errors) logger.error('Firebase credential problem', { error });

    try {
        if (credential.serviceAccount) {
            admin.initializeApp({ credential: admin.credential.cert(credential.serviceAccount) });
            isFirebaseInitialized = true;
            logger.info('Firebase Admin initialized', { from: credential.source === 'file' ? 'FIREBASE_SERVICE_ACCOUNT_FILE' : 'FIREBASE_SERVICE_ACCOUNT' });
        } else if (credential.source === 'adc') {
            admin.initializeApp({ credential: admin.credential.applicationDefault() });
            isFirebaseInitialized = true;
            logger.info('Firebase Admin initialized', { from: 'application default credentials' });
        } else {
            logger.warn('Firebase Admin not configured; push notifications will be mocked');
        }
    } catch (error) {
        logger.error('Firebase Admin initialization error', { error: error.message });
    }
} else {
    isFirebaseInitialized = true;
}

/**
 * FCM token registrations that mean "this device is gone". These are reported
 * back so the caller can prune them; anything else (a transient 503, a quota
 * error) must NOT cause a token to be deleted.
 */
const PERMANENT_FAILURES = new Set([
    'messaging/registration-token-not-registered',
    'messaging/invalid-registration-token',
    'messaging/invalid-argument',
]);

/**
 * Send a push to a user's devices.
 *
 * `payload` is `{ title, body, data }`.
 *
 * ── Why these are data-only messages ──────────────────────────────────────
 *
 * The message used to carry a top-level `notification` block. On the web that
 * hands display to the browser: Chrome renders the notification itself *and*
 * still wakes the service worker's `onBackgroundMessage`, which rendered a
 * second one — so a single received transfer could raise two notifications on
 * a closed tab, and neither of them could be given a click target, an icon, or
 * a tag, because the auto-rendered one ignores all of that.
 *
 * A data-only message wakes only the service worker, which builds the
 * notification itself. It is the shape the web actually wants: one
 * notification, our icon, and a click that opens the right screen.
 */
export const sendPushNotification = async (tokens, payload) => {
    if (!tokens || tokens.length === 0) return { success: true, failedTokens: [] };

    if (!isFirebaseInitialized) {
        logger.debug('Mock push', { devices: tokens.length, title: payload?.title });
        return { success: true, mock: true, failedTokens: [] };
    }

    try {
        /**
         * FCM requires every value in `data` to be a string. The caller spreads
         * arbitrary metadata in here (amounts are numbers, ids are ObjectIds),
         * and a non-string value makes the whole multicast fail with
         * "data must only contain string values" — which previously killed the
         * notification for every device at once.
         */
        const data = {
            title: String(payload.title ?? 'PayPro'),
            body: String(payload.body ?? ''),
        };
        for (const [key, value] of Object.entries(payload.data || {})) {
            if (value === null || value === undefined) continue;
            data[key] = typeof value === 'string' ? value : String(value);
        }

        const response = await admin.messaging().sendEachForMulticast({
            data,
            tokens,
            webpush: {
                headers: {
                    // Deliver now rather than batching with the next wake-up:
                    // money movement is the definition of a time-sensitive
                    // notification. TTL keeps a push queued for a device that
                    // is offline, so it arrives when the phone comes back
                    // instead of being dropped.
                    Urgency: 'high',
                    TTL: '86400',
                },
            },
            android: { priority: 'high' },
        });

        const failedTokens = [];
        if (response.failureCount > 0) {
            response.responses.forEach((resp, idx) => {
                if (resp.success) return;
                const code = resp.error?.code;
                // Only prune tokens that are permanently dead.
                if (PERMANENT_FAILURES.has(code)) {
                    failedTokens.push(tokens[idx]);
                } else {
                    logger.warn('FCM transient error', { code, error: resp.error?.message });
                }
            });
        }

        return {
            success: true,
            successCount: response.successCount,
            failureCount: response.failureCount,
            failedTokens,
        };
    } catch (error) {
        logger.error('Error sending push notification', { error: error.message });
        return { success: false, error: error.message, failedTokens: [] };
    }
};

export default admin;
