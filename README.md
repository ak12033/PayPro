# 💸 PayPro — AI-Powered MERN Payment System

PayPro is a secure, AI-enhanced **Peer-to-Peer (P2P) Payment Application** built with the **MERN stack**, offering AI-powered transaction categorization, location-based 2FA security, P2P money transfers, Stripe integration for adding money, and insightful transaction summaries — all wrapped within a clean, modern UI.

---

## 🛠️ Tech Stack

- **Frontend:** React (Vite), Tailwind CSS, React Hot Toast, Lucide Icons
- **Backend:** Node.js, Express.js
- **Database:** MongoDB (Cloud)
- **Authentication:** JWT, bcrypt
- **AI Integration:** Google Gemini API (Generative AI)
- **Email Service:** Nodemailer (Gmail SMTP)
- **Payment Gateway:** Stripe
- **Location Detection:** Public IP & Location API
- **Hosting:** Vercel (Frontend) & Render (Backend)

---

## ✨ Features

- **User Authentication**
  - Secure Signup & Login using JWT
  - **Location-based AI 2FA** using OTP if login from new location (city/IP)

- **Location Tracking**
  - Capture and store user's last login location (city + IP)
  - Compare current login location on every login attempt
  - If location differs → trigger OTP-based 2FA  
  - Updates last login location after successful verification  

- **P2P Money Transfer**
  - Transfer money between registered users
  - If 5+ transfers to the same user in a day — triggers 2FA OTP  
  - Maintains dual transaction records for sender and recipient  

- **Stripe Payments**
  - Add money to your account via Stripe payment gateway

- **AI-Powered Categorization**
  - Categorize each transaction using **Gemini AI**
  - Assign AI-suggested icons based on transaction description

- **Transaction Management**
  - Paginated transaction history
  - Transaction filtering: All, Payment, Transfer, Received
  - Full transaction summary: sent, received, added via Stripe

- **User Profile**
  - View & Update profile details (with email validation & unique email enforcement)

- **Responsive Modern UI**
  - Clean, intuitive, mobile-friendly interface built with Tailwind CSS

---

## 📄 Application Pages Overview

### 🔐 Authentication

- **Sign Up**
  - Full Name, Email, Password  
  - Email format validation  
  - Duplicate email prevention  

- **Login**
  - JWT Authentication  
  - **Location detection via public IP lookup**
  - AI-based location comparison
  - 2FA OTP via email if login from new location

---

### 💸 Dashboard & Payments

- **Transaction Summary**
  - Total Sent, Received, Added via Stripe

- **Add Money**
  - Seamless Stripe integration
  - Instant account balance update & transaction logging

- **Send Money**
  - P2P transfers to other registered users
  - If 5+ transfers to same user in a day → triggers 2FA OTP  
  - Secure balance management & dual transaction record creation  

- **Transaction History**
  - Paginated history with filters  
  - AI-generated categories & icons

- **Profile**
  - View & update personal info  
  - Email format check & uniqueness validation

---

## 📊 AI-Powered Enhancements

- **Transaction Categorization (Gemini AI)**
  - Categorizes transaction description into one of 18+ financial categories

- **Icon Suggestion (Gemini AI)**
  - Suggests appropriate Lucide icons for each transaction

---

## 📍 Location-Based Security

- Detects and stores user's **last login city and IP address**
- On each login attempt:
  - Compares current location with last saved one
  - If mismatch → triggers OTP-based 2FA
  - Verifies OTP before proceeding with login
- Updates last login location post successful 2FA

---

## 🚀 Deployment —  Vercel

- **Backend:** Vercel  
- **Frontend:** Vercel  

---

## 🚀 Live Demo

🌐 Click this: [https://PayPro.vercel.app](https://pay-pro-lcrj.vercel.app/)

---

## Getting Started

To get started with the Task-Pilot project, follow these steps:

1. Clone the repository from GitHub:

2. **Set Environment Variables**: Navigate to the `frontend` and `backend` folders and add necessary environment variables. You may need to create a `.env` file and configure it with required variables:
   In the backend/.env file:

   ```
   PORT=5000
   MONGO_URI=your_mongodb_connection_string_here
   JWT_SECRET=your_jwt_secret_here
   EMAIL_USER=your_email_here
   EMAIL_PASS=your_email_app_password_here
   IPAPI_URL=https://ipapi.co
   GEMINI_API_KEY_1=your_gemini_api_key_here
   GEMINI_API_KEY=your_second_gemini_api_key_here
   STRIPE_SECRET_KEY=your_stripe_secret_key_here
   ```

   In the frontend/.env file:

   ```
   VITE_BACKEND_URL=http://localhost:5000
   VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_actual_key
   ```

3. **Install Dependencies**: Install dependencies in the `frontend` and `backend` folders using npm or yarn:

   ```
   cd frontend
   npm install
   cd ../backend
   npm install
   ```

4. **Start the Backend Server**: In the `backend` folder, start the development server using npm:

   ```
   npm run server
   ```

5. **Start the Frontend**: In the `frontend` folder, start the frontend application:

   ```
   npm run dev
   ```

