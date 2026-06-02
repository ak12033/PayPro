importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// To receive background messages, we need to initialize firebase in the service worker
// The config can be injected here or hardcoded.
// Note: In a real app, you can use a build step to inject environment variables here,
// or use URL parameters when registering the service worker.
// For simplicity, you can replace these with your actual Firebase config values.

const firebaseConfig = {
    apiKey: "AIzaSyAMvbwZqKtCXgc2ZGOS26SrBVypKnaEoKI",
    authDomain: "paypro-64e9a.firebaseapp.com",
    projectId: "paypro-64e9a",
    storageBucket: "paypro-64e9a.firebasestorage.app",
    messagingSenderId: "791429273580",
    appId: "1:791429273580:web:a42156c2922f5a248b92c9",
    measurementId: "G-JBT3FG4PR8"
};

try {
    firebase.initializeApp(firebaseConfig);
    const messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
        console.log('[firebase-messaging-sw.js] Received background message ', payload);
        const notificationTitle = payload.notification.title;
        const notificationOptions = {
            body: payload.notification.body,
            icon: '/vite.svg', // Replace with your app logo
            data: payload.data,
        };

        self.registration.showNotification(notificationTitle, notificationOptions);
    });
} catch (err) {
    console.log('Failed to initialize Firebase inside Service Worker', err);
}
