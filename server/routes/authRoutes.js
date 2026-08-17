import express from 'express';
import { register, login, refresh, logout, logoutAll, listSessions } from '../controllers/authController.js';
import locationMiddleware from '../middlewares/locationMiddleware.js';
import authMiddleware from '../middlewares/authMiddleware.js';
import { resendLoginOtp, verifyLoginOtp } from '../controllers/otpController.js';
import { loginLimiter, signupLimiter, otpVerifyLimiter, otpSendLimiter } from '../middlewares/rateLimiters.js';

const authRouter = express.Router();

authRouter.post('/signup', signupLimiter, locationMiddleware, register);
authRouter.post('/login', loginLimiter, locationMiddleware, login);
authRouter.get('/refresh', refresh);
authRouter.post('/logout', logout);

authRouter.post('/resend-login-otp', otpSendLimiter, resendLoginOtp);
authRouter.post('/verify-login-otp', otpVerifyLimiter, locationMiddleware, verifyLoginOtp);

// Session visibility and global revocation.
authRouter.get('/sessions', authMiddleware, listSessions);
authRouter.post('/logout-all', authMiddleware, logoutAll);

export default authRouter;
