# Enabling FCM Push Notifications — Setup Guide

> **STATUS: FCM is configured and verified working as of 2026-08-03.**
> The service-account credential is installed in `server/.env` (base64), the
> Admin SDK authenticates against project `paypro-64e9a`, and the Cloud
> Messaging V1 API accepts sends. Nothing further is required to make push work.
>
> The rest of this document is kept as reference — for rotating the key, moving
> to a different Firebase project, or deploying to a new host. See
> §8 for exactly what was verified.

**Status of this repo:** the push pipeline is fully implemented on both the
server and the client, and the credential is now in place.

---

## 1. What is already done (so you know what NOT to build)

| Piece | Where | State |
| --- | --- | --- |
| Firebase Admin init (raw JSON **or** base64, plus ADC fallback) | [server/utils/fcm.js](../server/utils/fcm.js) | Done |
| Multicast send + stale-token pruning | [server/utils/fcm.js:74](../server/utils/fcm.js#L74) | Done |
| Save notification → Socket.IO emit → push fan-out | [server/services/notificationService.js](../server/services/notificationService.js) | Done |
| `POST /api/notifications/token` to register a device | [server/routes/notificationRoutes.js:10](../server/routes/notificationRoutes.js#L10) | Done |
| `fcmTokens` array on the user | [server/models/User.js:39](../server/models/User.js#L39) | Done |
| Firebase web SDK init | [client/src/services/firebase/firebaseApp.js](../client/src/services/firebase/firebaseApp.js) | Done |
| Permission prompt + token retrieval | [client/src/services/firebase/messaging.js:21](../client/src/services/firebase/messaging.js#L21) | Done |
| Auto-register token on login + foreground toast | [client/src/context/NotificationContext.jsx:69](../client/src/context/NotificationContext.jsx#L69) | Done |
| Background service worker | [client/public/firebase-messaging-sw.js](../client/public/firebase-messaging-sw.js) | Done |
| `fcmTokens` / `FIREBASE_SERVICE_ACCOUNT` redacted from logs | [server/utils/logger.js:28](../server/utils/logger.js#L28) | Done |

Until the credential is supplied the server does **not** crash — it logs
`⚠️ Firebase Admin not configured` at boot and every push is swallowed by a
`[MOCK PUSH]` branch ([server/utils/fcm.js:77](../server/utils/fcm.js#L77)).
That mock branch is exactly the state you are in right now.

---

## 2. What you need to obtain

| # | Credential | Where it goes | Currently |
| --- | --- | --- | --- |
| 1 | Service-account JSON (private key) | `server/.env` → `FIREBASE_SERVICE_ACCOUNT` | **Installed (base64)** |
| 2 | Web app config (7 values) | `client/.env` → `VITE_FIREBASE_*` | Filled |
| 3 | Web Push (VAPID) key pair | `client/.env` → `VITE_FIREBASE_VAPID_KEY` | Filled |

All three are in place. The instructions in §3 are retained for key rotation or
a project switch.

---

## 3. How to get each credential

### 3.1 Service-account JSON — already installed; steps kept for rotation

1. Open <https://console.firebase.google.com/> and select your project
   (the existing one is **`paypro-64e9a`** — the value already in your
   `client/.env`; use the same project or everything below must be redone
   together).
2. Click the **gear icon** (top-left, next to *Project Overview*) →
   **Project settings**.
3. Go to the **Service accounts** tab.
4. Make sure **Node.js** is selected, then click
   **Generate new private key** → **Generate key** in the confirmation dialog.
5. A file downloads, named something like
   `paypro-64e9a-firebase-adminsdk-xxxxx-yyyyyyyyyy.json`. It looks like:

   ```json
   {
     "type": "service_account",
     "project_id": "paypro-64e9a",
     "private_key_id": "…",
     "private_key": "-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----\n",
     "client_email": "firebase-adminsdk-xxxxx@paypro-64e9a.iam.gserviceaccount.com",
     …
   }
   ```

> **This file is a full-access credential for your Firebase project. Never
> commit it, never paste it into the client, never put it in a screenshot.**
> `.gitignore` already covers `.env`, but the downloaded `.json` itself should be
> deleted from your Downloads folder once you have pasted the value in.

**Also confirm the API is on:** in the Console go to **Project settings → Cloud
Messaging**. If *Firebase Cloud Messaging API (V1)* shows as *Disabled*, click
the ⋮ menu → **Manage API in Google Cloud Console** → **Enable**. The Admin SDK
uses the V1 API; the legacy server key is deprecated and this project does not
use it.

#### Putting it into `server/.env`

The loader accepts **either** format
([server/utils/fcm.js:20](../server/utils/fcm.js#L20)). Base64 is strongly
recommended — the private key contains newlines, and both `.env` parsers and
hosting dashboards mangle them.

**Recommended — base64 (single safe line):**

Run this in PowerShell from the folder containing the downloaded JSON:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("paypro-64e9a-firebase-adminsdk-xxxxx.json")) | Set-Clipboard
```

The base64 blob is now on your clipboard. Paste it into `server/.env`:

```
FIREBASE_SERVICE_ACCOUNT=eyJ0eXBlIjoic2VydmljZV9hY2NvdW50Iiw…
```

**Alternative — raw JSON on one line:**

```powershell
(Get-Content "paypro-64e9a-firebase-adminsdk-xxxxx.json" -Raw) -replace "`r`n","" -replace "`n","" | Set-Clipboard
```

Then in `server/.env` — note the surrounding single quotes, needed because the
value contains `#` and `=`:

```
FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"paypro-64e9a",…}'
```

Restart the server. Success looks like this in the boot log:

```
✅ Firebase Admin initialized from FIREBASE_SERVICE_ACCOUNT
```

If you instead see `❌ FIREBASE_SERVICE_ACCOUNT could not be parsed`, the value
got truncated or the quoting is wrong — redo with the base64 form.

### 3.2 Web app config (filled — for reference / new project only)

Firebase Console → **Project settings** → **General** tab → scroll to
**Your apps** → select the Web app (`</>` icon) → **SDK setup and configuration**
→ **Config**. Copy each value into `client/.env`:

```
VITE_FIREBASE_API_KEY=…
VITE_FIREBASE_AUTH_DOMAIN=<project>.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=…
VITE_FIREBASE_STORAGE_BUCKET=<project>.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=…
VITE_FIREBASE_APP_ID=…
```

If no web app exists yet, click **Add app → Web**, give it a nickname, skip
Firebase Hosting, and the config appears.

These are **public by design** — they ship inside the JS bundle. That is normal
and is not a leak. Only the service-account JSON in 3.1 is secret.

### 3.3 VAPID / Web Push key (filled — for reference)

Firebase Console → **Project settings** → **Cloud Messaging** tab → scroll to
**Web configuration** → **Web Push certificates**.

- If a key pair is listed, click the copy icon on the **Key pair** column.
- If none is listed, click **Generate key pair** first.

It is an ~87-character string starting with `B…`. Put it in `client/.env`:

```
VITE_FIREBASE_VAPID_KEY=BNxxxxx…
```

Without this, `getToken()` fails and no device ever registers.

---

## 4. One code change you must NOT forget if you switch projects

[client/public/firebase-messaging-sw.js:10-18](../client/public/firebase-messaging-sw.js#L10-L18)
has the Firebase config **hardcoded**. A service worker is served as a static
file and cannot read Vite env vars, so it cannot use `client/.env`.

Right now it matches your `client/.env` (project `paypro-64e9a`), so **you do not
need to touch it today.** But if you ever change `VITE_FIREBASE_*` to a different
project, you must hand-edit the same values into that file. If the two drift
apart, foreground toasts keep working while background notifications silently
stop — a confusing failure worth knowing about in advance.

---

## 5. Deploying (Render / Vercel / Railway / Docker)

Set `FIREBASE_SERVICE_ACCOUNT` as an environment variable in the host's
dashboard, using the **base64** form. Do not upload the JSON file — the code
reads the env var only, precisely so that no deployment depends on a file
present on disk.

`client/.env` values must be present **at build time** for Vite to inline them;
on Vercel/Netlify add the `VITE_FIREBASE_*` variables to the project's build
environment.

Two hard browser requirements for push:

- The site must be served over **HTTPS**. The single exception is
  `http://localhost`, which browsers treat as secure — this is why local dev
  works without a certificate.
- **Safari/iOS** only delivers web push when the user has installed the site to
  the Home Screen as a PWA. Chrome, Edge, Firefox on desktop and Android need no
  such step.

---

## 6. Verifying it works

1. `FIREBASE_SERVICE_ACCOUNT` filled → restart server → confirm the
   `✅ Firebase Admin initialized` line.
2. Open the client and log in. The browser shows a **notification permission
   prompt** — click **Allow**.
   (Triggered by [NotificationContext.jsx:69](../client/src/context/NotificationContext.jsx#L69).)
3. Confirm the token was stored — in MongoDB, your user document should now have
   a non-empty `fcmTokens` array.
4. Trigger a real event — the easiest is a P2P transfer to yourself from another
   account, or a wallet top-up.
5. Expected results:
   - **App tab in foreground** → an in-app toast (this also arrives over
     Socket.IO, so it appears even with push misconfigured — do not use it as
     proof that FCM works).
   - **Tab backgrounded or browser minimised** → a real OS notification, drawn by
     [firebase-messaging-sw.js:24](../client/public/firebase-messaging-sw.js#L24).
     **This is the actual proof that FCM is live.**

If the OS notification does not appear, check in order:

| Symptom | Cause |
| --- | --- |
| `[MOCK PUSH]` in server log | `FIREBASE_SERVICE_ACCOUNT` still unset/unparsed |
| No permission prompt | Permission previously denied — reset it via the padlock icon in the address bar |
| `getToken` error in browser console | `VITE_FIREBASE_VAPID_KEY` wrong or missing |
| Foreground toast works, background silent | Service-worker config drifted from `client/.env` (see §4) |
| `registration-token-not-registered` in server log | Normal — a stale device; the code auto-prunes it |

---

## 7. Events that already fire a push

Every one of these calls `notifyUser(...)`, which saves the notification, emits
the socket event, and pushes to every registered device — automatically, once
the credential is in place. No per-event wiring is needed from you.

| Event | Title | Source |
| --- | --- | --- |
| Money sent | *Transfer Successful* | [transactionController.js:387](../server/controllers/transactionController.js#L387) |
| Money received | *Money Received* | [transactionController.js:394](../server/controllers/transactionController.js#L394) |
| Risky transfer flagged | *High Risk Transfer Detected* | [transactionController.js:402](../server/controllers/transactionController.js#L402) |
| Risky transaction flagged | *High Risk Transaction Detected* | [transactionController.js:200](../server/controllers/transactionController.js#L200) |
| Wallet top-up confirmed | *Wallet Top-Up Successful* | [paymentController.js:106](../server/controllers/paymentController.js#L106) |
| Refund processed | *Refund Processed* | [paymentController.js:156](../server/controllers/paymentController.js#L156) |
| Sign-in needs 2FA | *Sign-in needs verification* | [authController.js:227](../server/controllers/authController.js#L227) |
| Scheduled low-balance check | *Low Balance Warning* | [cron.js:37](../server/utils/cron.js#L37) |

### Adding a push to a new event later

One line, anywhere in a controller:

```js
import { notifyUser } from '../services/notificationService.js';

await notifyUser(
    userId,                     // recipient
    'Payment',                  // type: Payment | Transfer | Security | Reminder
    'Title shown in the banner',
    'Body text of the notification',
    { transactionId: txn._id }  // optional metadata; values are stringified for FCM
);
```

It never throws — a notification failure cannot break a payment or a login
([notificationService.js:48](../server/services/notificationService.js#L48)).

---

## 8. Setup record — what was done and verified (2026-08-03)

- [x] Service-account key generated for `paypro-64e9a`
      (`firebase-adminsdk-fbsvc@paypro-64e9a.iam.gserviceaccount.com`)
- [x] Base64-encoded into `server/.env` as `FIREBASE_SERVICE_ACCOUNT` (3168 chars)
- [x] `.gitignore` widened — see the warning below
- [x] Admin SDK boots: `✅ Firebase Admin initialized from FIREBASE_SERVICE_ACCOUNT`
- [x] Credential **accepted by Google** — a real OAuth access token was minted,
      proving the key is active and not just well-formed JSON
- [x] **Cloud Messaging V1 API confirmed enabled** — a probe send was accepted by
      FCM and failed only on the deliberately-invalid token, rather than
      returning a `403 PERMISSION_DENIED` at the API level
- [x] Non-string `data` coercion exercised (`500` → `"500"`, `null` dropped)
- [x] Service worker config verified field-by-field against `client/.env` —
      all six values match, so background delivery will not silently break
- [x] All three layers confirmed on the same project: service account,
      `client/.env`, and the service worker

### ⚠️ The credential file at the repo root

`paypro-64e9a-firebase-adminsdk-fbsvc-9d02f4bb97.json` sits in the **project
root**. It has never been committed, but it was **untracked and un-ignored** —
the previous rules only covered `server/config/`, so a single `git add .` would
have committed a live private key. `.gitignore` now matches
`*firebase-adminsdk*.json` in any directory, and `git check-ignore` confirms the
file is excluded.

The file is now redundant: its contents live in `server/.env`. **Deleting it is
recommended** — nothing in the codebase reads the `.json` from disk. It was left
in place rather than removed automatically, since deleting a credential is your
call.

### Remaining manual step

Browser-side delivery is the one thing that cannot be verified from a terminal,
because it needs a real click on the permission prompt:

1. Log in to the client, click **Allow**
2. Confirm your user document gains a non-empty `fcmTokens` array
3. Background the tab, trigger a transfer, expect an OS notification

### On deployment

`server/.env` is git-ignored and does not travel with a deploy. Set
`FIREBASE_SERVICE_ACCOUNT` to the same base64 value in the host's environment
variables (Render/Vercel/Railway dashboard), or push will fall back to
`[MOCK PUSH]` in production while working fine locally.
