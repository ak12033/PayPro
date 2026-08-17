import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { firebaseApp } from './firebaseApp';
import { env } from '../../app/config/env';

let messaging;

// Messaging is only initialised in a browser that supports service workers,
// which FCM requires.
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    try {
        messaging = getMessaging(firebaseApp);
    } catch (error) {
        console.warn('Firebase messaging initialization failed:', error);
    }
}

/**
 * Current browser permission, without asking for it.
 *
 * `'unsupported'` is separated from `'denied'` on purpose: one is a decision
 * the user can change, the other is a browser that cannot do this at all, and
 * the UI should not offer a switch that can never turn on.
 */
export const getPushPermission = () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    if (!messaging) return 'unsupported';
    return Notification.permission; // 'default' | 'granted' | 'denied'
};

/**
 * Register the background handler explicitly.
 *
 * `getToken` will register `/firebase-messaging-sw.js` by itself, but only with
 * the default scope and only at the moment a token is requested. Registering it
 * ourselves means the worker that receives pushes while the app is closed is
 * installed on first load, we control its scope, and we can hand the exact
 * registration to `getToken` instead of hoping it finds the right one.
 */
let registrationPromise = null;

/**
 * The token this browser last obtained.
 *
 * Cached so sign-out can tell the server which device to detach without
 * re-entering the FCM SDK at the exact moment the session is being torn down.
 */
let issuedToken = null;

export const getIssuedPushToken = () => issuedToken;

const getServiceWorkerRegistration = () => {
    if (!('serviceWorker' in navigator)) return Promise.resolve(null);

    if (!registrationPromise) {
        registrationPromise = navigator.serviceWorker
            .register('/firebase-messaging-sw.js', { scope: '/' })
            .then((registration) => navigator.serviceWorker.ready.then(() => registration))
            .catch((error) => {
                console.warn('Push service worker registration failed:', error);
                registrationPromise = null;
                return null;
            });
    }

    return registrationPromise;
};

/**
 * Resolve this browser's FCM token.
 *
 * `prompt` controls whether we are allowed to show the browser's permission
 * dialog. It defaults to false, and that matters: the previous version asked
 * for permission automatically on every fresh login. A permission prompt that
 * appears unbidden, with no explanation and no relationship to anything the
 * user just did, is the one users dismiss — and a dismissed prompt in Chrome
 * blocks the origin for a long time, while Safari ignores an ungestured
 * request outright. So the automatic path only ever registers a token when
 * permission has *already* been granted, and the prompt itself comes from a
 * deliberate tap on the notifications switch.
 */
export const requestNotificationToken = async ({ prompt = false } = {}) => {
    if (!messaging) return null;

    // A browser can support service workers and still not support FCM (Safari
    // before 16.4, most in-app webviews).
    const supported = await isSupported().catch(() => false);
    if (!supported) return null;

    try {
        let permission = Notification.permission;

        if (permission === 'default') {
            if (!prompt) return null;
            permission = await Notification.requestPermission();
        }

        if (permission !== 'granted') return null;

        const registration = await getServiceWorkerRegistration();
        if (!registration) return null;

        const currentToken = await getToken(messaging, {
            vapidKey: env.firebase.vapidKey,
            serviceWorkerRegistration: registration,
        });

        if (!currentToken) {
            console.log('No registration token available.');
            return null;
        }

        issuedToken = currentToken;
        return currentToken;
    } catch (error) {
        console.error('An error occurred while retrieving the FCM token.', error);
        return null;
    }
};

/**
 * Subscribe to foreground FCM messages.
 *
 * Returns Firebase's own unsubscribe function so the subscription can be
 * registered once and cleaned up on unmount. The earlier promise-based API
 * re-registered a handler per received message, so message N was delivered to N
 * handlers and the same toast appeared N times.
 *
 * Messages are data-only (see the service worker), so the title and body
 * arrive in `payload.data` rather than `payload.notification`.
 */
export const onForegroundMessage = (callback) => {
    if (!messaging) return () => {};
    return onMessage(messaging, (payload) => callback(payload?.data ?? {}));
};
