import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

// Your web app's Firebase configuration
// In a real project, populate these in .env
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "mock-api-key",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "mock-auth-domain",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "mock-project-id",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "mock-storage-bucket",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "mock-sender-id",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "mock-app-id"
};

const app = initializeApp(firebaseConfig);

let messaging;

// We only initialize messaging if we are in a browser environment 
// and the browser supports service workers (required for FCM).
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
    try {
        messaging = getMessaging(app);
    } catch (e) {
        console.warn("Firebase messaging initialization failed:", e);
    }
}

export const requestForToken = async () => {
    if (!messaging) return null;
    
    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            const currentToken = await getToken(messaging, { 
                // VAPID key is required for web push notifications. Get it from Firebase console.
                vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY || 'mock-vapid-key' 
            });
            if (currentToken) {
                return currentToken;
            } else {
                console.log('No registration token available. Request permission to generate one.');
                return null;
            }
        } else {
            console.log('Notification permission denied');
            return null;
        }
    } catch (err) {
        console.error('An error occurred while retrieving token. ', err);
        return null;
    }
};

export const onMessageListener = () =>
    new Promise((resolve) => {
        if (!messaging) return;
        onMessage(messaging, (payload) => {
            resolve(payload);
        });
    });

export default app;
