/**
 * Single source of truth for build-time environment variables.
 *
 * `import.meta.env` was previously read in five different modules, each with
 * its own inline fallback string. Centralising it means a renamed variable is a
 * one-line change and the fallbacks cannot drift apart.
 */

const readEnv = (key, fallback = '') => import.meta.env[key] ?? fallback;

export const env = {
    backendUrl: readEnv('VITE_BACKEND_URL', 'http://localhost:5000'),

    razorpayKeyId: readEnv('VITE_RAZORPAY_KEY_ID'),

    firebase: {
        apiKey: readEnv('VITE_FIREBASE_API_KEY', 'mock-api-key'),
        authDomain: readEnv('VITE_FIREBASE_AUTH_DOMAIN', 'mock-auth-domain'),
        projectId: readEnv('VITE_FIREBASE_PROJECT_ID', 'mock-project-id'),
        storageBucket: readEnv('VITE_FIREBASE_STORAGE_BUCKET', 'mock-storage-bucket'),
        messagingSenderId: readEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', 'mock-sender-id'),
        appId: readEnv('VITE_FIREBASE_APP_ID', 'mock-app-id'),
        vapidKey: readEnv('VITE_FIREBASE_VAPID_KEY', 'mock-vapid-key'),
    },
};

export const API_BASE_URL = `${env.backendUrl}/api`;
