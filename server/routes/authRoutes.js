import express from 'express';
import { register, login, refresh, logout } from '../controllers/authController.js';
import locationMiddleware from '../middlewares/locationMiddleware.js';
import { resendLoginOtp, verifyLoginOtp } from '../controllers/otpController.js';

const authRouter = express.Router();

authRouter.post('/signup', locationMiddleware, register);
authRouter.post('/login', locationMiddleware, login);
authRouter.get('/refresh', refresh);
authRouter.post('/logout', logout);
authRouter.post('/resend-login-otp', resendLoginOtp);
authRouter.post('/verify-login-otp', locationMiddleware, verifyLoginOtp);

export default authRouter;
