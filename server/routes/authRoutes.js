import express from 'express';
import {
    register, login, refresh, logout, logoutAll, listSessions,
    forgotPassword, resetPassword, sendEmailVerification, verifyEmail,
} from '../controllers/authController.js';
import locationMiddleware from '../middlewares/locationMiddleware.js';
import authMiddleware from '../middlewares/authMiddleware.js';
import { resendLoginOtp, verifyLoginOtp } from '../controllers/otpController.js';
import {
    getTotpStatus, startTotpSetup, confirmTotpSetup, disableTotp, regenerateTotpRecoveryCodes,
} from '../controllers/totpController.js';
import {
    loginLimiter, signupLimiter, otpVerifyLimiter, otpSendLimiter, passwordResetLimiter, refreshLimiter,
} from '../middlewares/rateLimiters.js';

const authRouter = express.Router();

authRouter.post('/signup', signupLimiter, locationMiddleware, register);
authRouter.post('/login', loginLimiter, locationMiddleware, login);
/**
 * POST, not GET — this route rotates a refresh token, which is a write.
 * See utils/token.js (CSRF double-submit) and authController.refresh for why
 * a GET here was a CSRF vector even behind CORS.
 */
authRouter.post('/refresh', refreshLimiter, refresh);
authRouter.post('/logout', logout);

authRouter.post('/resend-login-otp', otpSendLimiter, resendLoginOtp);
authRouter.post('/verify-login-otp', otpVerifyLimiter, locationMiddleware, verifyLoginOtp);

authRouter.post('/forgot-password', passwordResetLimiter, forgotPassword);
authRouter.post('/reset-password', passwordResetLimiter, resetPassword);

// Email ownership (plan.md §31.2.7). Authenticated: signup already signed the
// user in, and a code is only ever sent to the address on the caller's account.
authRouter.post('/verify-email/send', authMiddleware, otpSendLimiter, sendEmailVerification);
authRouter.post('/verify-email', authMiddleware, otpVerifyLimiter, verifyEmail);

// Session visibility and global revocation.
authRouter.get('/sessions', authMiddleware, listSessions);
authRouter.post('/logout-all', authMiddleware, logoutAll);

/**
 * Authenticator app (plan.md §31.2.4). The code-checking routes share the OTP
 * verify limiter: a 6-digit code is as guessable here as anywhere else.
 */
authRouter.get('/totp', authMiddleware, getTotpStatus);
authRouter.post('/totp/setup', authMiddleware, otpSendLimiter, startTotpSetup);
authRouter.post('/totp/enable', authMiddleware, otpVerifyLimiter, confirmTotpSetup);
authRouter.post('/totp/disable', authMiddleware, otpVerifyLimiter, disableTotp);
authRouter.post('/totp/recovery-codes', authMiddleware, otpVerifyLimiter, regenerateTotpRecoveryCodes);

export default authRouter;
