import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Fix __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let isFirebaseInitialized = false;

if (!admin.apps.length) {
  try {
    // ✅ Read JSON file manually
    const serviceAccountPath = path.join(
      __dirname,
      "../config/paypro-64e9a-firebase-adminsdk-fbsvc-65d08e5fb2.json"
    );

    const serviceAccount = JSON.parse(
      fs.readFileSync(serviceAccountPath, "utf-8")
    );

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    isFirebaseInitialized = true;
    console.log("✅ Firebase Admin Initialized Successfully");
  } catch (error) {
    console.error("❌ Firebase Admin Initialization Error:", error);
  }
}

export const sendPushNotification = async (tokens, payload) => {
  if (!tokens || tokens.length === 0) return;

  if (!isFirebaseInitialized) {
    console.log(
      `[MOCK PUSH] Sending notification to ${tokens.length} devices:`,
      payload?.notification?.title
    );
    return { success: true, mock: true };
  }

  try {
    const message = {
      notification: {
        title: payload.notification.title,
        body: payload.notification.body,
      },
      data: payload.data || {},
      tokens: tokens,
    };

    const response = await admin.messaging().sendEachForMulticast(message);

    let failedTokens = [];

    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(tokens[idx]);
          console.error("❌ FCM Error:", resp.error);
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
    console.error("❌ Error sending push notification:", error);
    return { success: false, error: error.message };
  }
};

export default admin;