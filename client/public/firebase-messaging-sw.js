/**
 * Background push handler.
 *
 * This file runs in a service worker, with no access to the page, the bundle,
 * or `import.meta.env` — it is served as a static file from the site root and
 * is the *only* thing alive when the app is closed. Everything it needs is
 * therefore inlined below. The Firebase web config is public by design (access
 * is governed by Firebase rules, not by hiding these values), so inlining it
 * leaks nothing that the JS bundle does not already contain.
 */
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

const firebaseConfig = {
    apiKey: "AIzaSyAMvbwZqKtCXgc2ZGOS26SrBVypKnaEoKI",
    authDomain: "paypro-64e9a.firebaseapp.com",
    projectId: "paypro-64e9a",
    storageBucket: "paypro-64e9a.firebasestorage.app",
    messagingSenderId: "791429273580",
    appId: "1:791429273580:web:a42156c2922f5a248b92c9",
    measurementId: "G-JBT3FG4PR8"
};

/**
 * Take over immediately on install.
 *
 * Without these, a changed service worker sits in "waiting" until every tab of
 * the app has been closed — so a fix shipped here would not reach an active
 * user for days.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

try {
    firebase.initializeApp(firebaseConfig);
    const messaging = firebase.messaging();

    /**
     * The server sends data-only messages, so nothing is displayed unless we
     * display it. That is deliberate: when a message carries a `notification`
     * block the browser renders it itself *and* still calls this handler, which
     * produced two notifications for one event and left us unable to set the
     * icon, the tag, or where a tap should go.
     */
    messaging.onBackgroundMessage((payload) => {
        const data = payload.data || {};

        return self.registration.showNotification(data.title || 'PayPro', {
            body: data.body || '',
            icon: '/logo-mark-192.png',
            badge: '/logo-mark-192.png',
            /**
             * Tagged per notification id so a retried delivery replaces the
             * notification instead of stacking a duplicate underneath it,
             * while two genuinely different events still appear separately.
             */
            tag: data.notificationId || `paypro-${Date.now()}`,
            renotify: true,
            timestamp: Date.now(),
            data: { link: data.link || '/', ...data },
        });
    });
} catch (err) {
    console.log('Failed to initialize Firebase inside Service Worker', err);
}

/**
 * Tapping a notification must land on the thing it is about.
 *
 * There was no handler at all before, so a background notification was inert:
 * tapping it dismissed it and did nothing else. Focus an existing tab where
 * there is one — opening a second copy of a wallet app is disorienting — and
 * only open a new window as a last resort.
 */
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const link = event.notification.data?.link || '/';
    const target = new URL(link, self.location.origin).href;

    event.waitUntil(
        (async () => {
            const clients = await self.clients.matchAll({
                type: 'window',
                includeUncontrolled: true,
            });

            for (const client of clients) {
                if (new URL(client.url).origin !== self.location.origin) continue;

                await client.focus();
                // `navigate` is not implemented everywhere; a focused tab on
                // the wrong screen is still better than a new window.
                if ('navigate' in client) {
                    await client.navigate(target).catch(() => {});
                }
                return;
            }

            await self.clients.openWindow(target);
        })()
    );
});
