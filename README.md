# 💸 PayPro — AI-Powered MERN & FastAPI Payment System

PayPro is a highly secure, AI-enhanced **Peer-to-Peer (P2P) Payment and Wallet Application**. Built on a modern full-stack architecture, it integrates a React client, a Node.js/Express core server, and a FastAPI Python AI service.

The two backends are **independent**: the client calls Express for money, auth and account operations, and calls the FastAPI service directly for AI features. Both read the same MongoDB database and verify the same access tokens.

```
                    ┌──▶ Express  ──▶ MongoDB / Razorpay / FCM
React ──────────────┤
                    └──▶ FastAPI  ──▶ MongoDB / Google Gemini
```

PayPro features location-aware security checks (triggering 2FA email OTPs upon login location changes), rate-limiting P2P transaction controls, direct wallet top-ups and refunds via Razorpay, real-time push alerts via Firebase Cloud Messaging, and automatic AI-powered transaction categorization, fraud evaluation, and dynamic insights using Google Gemini.

---

## 🛠️ Technology Stack

### Frontend (`/client`)
*   **Core Framework:** React 19 (Vite-powered)
*   **Styling:** Tailwind CSS (v4) for fully responsive, fluid, and dark-themed components
*   **Data Visualization:** Recharts for wallet activity and ledger graphing
*   **Notifications & Alerts:** React Hot Toast for modern toast alerts
*   **Client Services:** Axios with interceptor-based token refresh queueing; Firebase Client SDK for web push tokens

### Main Core Backend (`/server`)
*   **Runtime:** Node.js (ES Modules syntax)
*   **Framework:** Express.js (v5) with cookie parsing and request logging
*   **Database ORM:** Mongoose & MongoDB Atlas
*   **Authentication:** Dual JWT custom sessions with bcryptjs encryption
*   **Automated Scheduling:** `node-cron` for daily balance warnings
*   **Mailing:** Nodemailer (Gmail SMTP setup) for OTP challenges
*   **Gateway Integrations:** Razorpay Node SDK (order creation, signature checks, webhooks, refunds)
*   **Notification Engine:** Firebase Admin SDK (multicast background push)

### AI Service (`/fastapi-server`)
*   **Language & Framework:** Python 3.12 & FastAPI (Uvicorn), isolated in a project-local `.venv`
*   **AI Engine SDK:** `google-genai` integration utilizing **`gemini-2.5-flash`**
*   **Database:** `pymongo` (`AsyncMongoClient`) against the *same* MongoDB the Express server uses
*   **Authentication:** `PyJWT` — verifies the access tokens Express signs, so the browser can call it directly
*   **Schemas & Validation:** Pydantic models for strict structure validation

---

## ✨ System Features

### 🔐 1. Geolocation-Based AI 2FA Verification
*   **IP-to-Location Resolution:** Translates user IP addresses during signup and login using `ipapi.co`.
*   **Dynamic Security Check:** Compares current login city with the last saved session location.
*   **Nodemailer OTP Challenge:** If login takes place from a different city, or if the user enabled explicit 2FA in profile settings, the login halts, generating and sending a 6-digit verification code to the registered email address.
*   **Notification:** Dispatches high-security alerts warning users of unrecognized connection attempts.

### 💸 2. Secure P2P Money Transfers
*   **Ledger Consistency:** Creates a dual transaction ledger (Debit entry for sender, Credit entry for recipient) in MongoDB, updating balances in a unified operation.
*   **Rate-Limiting Protection:** Evaluates frequency of daily transfers. If 5 or more transactions are sent to the same user in a single day, the platform triggers a mandatory 6-digit email OTP verify block to prevent unauthorized account draining.
*   **Instant Notifications:** Dispatches push notifications to both parties immediately upon completion.

### 💳 3. Razorpay Wallet Top-up & Refunds
*   **Secure Checkout:** Integrates Razorpay scripts directly in the React frontend, allowing secure credit card and UPI top-ups.
*   **Signature Authentication:** Validates payments using SHA256 HMAC signature verification in the backend.
*   **Webhook Receivers:** Robust webhook capture endpoints updating ledger records on successful, failed, or refunded payments.
*   **Refund Integration:** Supports single-click refunds that deduct user wallet balances securely and communicate back to Razorpay APIs.

### 🧠 4. AI-Powered Enhancements (FastAPI & Gemini)
*   **AI Transaction Categorization:** Sends transaction details to the FastAPI service. Gemini analyzes descriptions and maps them into 19 financial categories, returning an appropriate Lucide vector icon.
*   **AI Fraud Check Engine:** Gathers the transaction details along with the user's last 10 historical transactions. Gemini computes a dynamic `risk_score` (0-100), tags the `risk_level` (`low`, `medium`, `high`), and provides a natural reason description.
*   **AI Financial Assistant:** A sheet opened from the Insights page. The browser calls the FastAPI service directly; that service tool-calls into MongoDB for balances, transactions, analytics, notifications and profile, and persists the conversation.
*   **AI Financial Insights:** Generates structured spending reports, budget suggestions, and anomalous trend cards from the user's last 50 transactions, read by the FastAPI service itself.

> **Where each AI call goes.** Categorization and fraud checking run *inside* the ledger's write path, so Express calls the FastAPI service server-to-server with a shared `X-API-Key`. The assistant and insights are user-initiated, so the browser calls the FastAPI service directly with its normal access token. Express is not a proxy for either.

### 🔔 5. FCM Multicast Push Notifications
*   **Push Registration:** Registers and associates client device FCM tokens to user accounts.
*   **Real-time Dispatches:** Transmits payments, transfers, reminders, and alerts directly to mobile/browser clients.
*   **Automatic Dead Token Pruning:** Cleans up expired, stale, or revoked push tokens returned by Firebase.

---

## 🔒 Security & Session Architecture

*   **Refresh Token Rotation (RTR):** Protects against token theft. Issues unique refresh tokens on every rotation.
*   **Reuse Detection:** Tracks the cryptographic family trees of tokens (`familyId`). If an old refresh token is reused, all sessions in that family tree are immediately terminated and invalidated.
*   **In-Memory Access Tokens:** Minimizes XSS risk by avoiding local storage of JWT tokens.
*   **TTL Auto-Expiry:** Employs native MongoDB TTL indexes to clean up expired sessions automatically.

---

## 🚀 Environment Setup

### 1. Main Core Backend Server (`/server/.env`)
Create a `.env` file under the `server` directory:
```env
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net
JWT_SECRET=your_jwt_secret
EMAIL_USER=your_gmail_address
EMAIL_PASS=your_gmail_app_password
IPAPI_URL=https://ipapi.co
CORS_ORIGIN=http://localhost:5173
# The AI service, called server-to-server for categorization and fraud scoring.
FASTAPI_URL=http://localhost:8000
FASTAPI_API_KEY=your_shared_secret
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_razorpay_webhook_secret
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"...","private_key":"..."}
```

### 2. React Client (`/client/.env`)
Create a `.env` file under the `client` directory:
```env
VITE_BACKEND_URL=http://localhost:5000
# The AI service. The browser calls it directly for the assistant and insights.
VITE_FASTAPI_URL=http://localhost:8000
VITE_RAZORPAY_KEY_ID=your_razorpay_key_id

# Firebase Client Configuration
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_firebase_project_domain
VITE_FIREBASE_PROJECT_ID=your_firebase_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_firebase_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_firebase_app_id
VITE_FIREBASE_VAPID_KEY=your_firebase_vapid_key
```

### 3. FastAPI Server (`/fastapi-server/.env`)
Copy `fastapi-server/.env.example` to `fastapi-server/.env` and fill it in:
```env
ENVIRONMENT=development
GEMINI_API_KEY=your_gemini_api_key
# The SAME database the Express server uses — same data, no copy.
MONGO_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net
MONGO_DB_NAME=PayPro
# Must be byte-identical to JWT_SECRET in server/.env: this service verifies
# the very same access tokens the Express server signs.
JWT_SECRET=your_jwt_secret
# Comma-separated browser origins allowed to call this service directly.
# Required in production.
ALLOWED_ORIGINS=http://localhost:5173
# Shared secret with the Express backend — must match FASTAPI_API_KEY there.
# Guards the two server-to-server scoring endpoints. Required in production.
FASTAPI_API_KEY=your_shared_secret
```
See [`fastapi-server/README.md`](fastapi-server/README.md) for the full variable reference.

---

## 🏁 Getting Started

### Step 1: Install Dependencies
Install packages in all three service directories:
```bash
# Frontend
cd client
npm install

# Express Backend
cd ../server
npm install

# FastAPI AI Microservice (Python 3.12, isolated in a project-local .venv)
cd ../fastapi-server
python -m venv .venv
.venv\Scripts\activate            # On Windows (use source .venv/bin/activate on Mac/Linux)
pip install -r requirements-dev.txt   # or requirements.txt for runtime only
```
*Dependencies are pinned in `requirements.txt` (production) and `requirements-dev.txt` (adds pytest, httpx and ruff). `.venv/` is git-ignored — never commit it.*

### Step 2: Running the Services

1.  **FastAPI AI Server:** Start the Python service:
    ```bash
    cd fastapi-server
    .venv\Scripts\activate   # activate if not already (source .venv/bin/activate on Mac/Linux)
    uvicorn app.main:app --port 8000 --reload
    ```
    Run its tests with `pytest` from the same directory.
2.  **Express Backend Server:** Start the core Node service:
    ```bash
    cd server
    npm run server
    ```
3.  **Vite Client:** Launch the React client:
    ```bash
    cd client
    npm run dev
    ```

Open your browser to `http://localhost:5173` to explore the PayPro Platform.
