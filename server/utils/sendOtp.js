import nodemailer from 'nodemailer';
import config from '../config/env.js';

const sendOtp = async (email, otp) => {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: config.EMAIL_USER,
            pass: config.EMAIL_PASS,
        },
    });

    await transporter.sendMail({
        from: `"PayPro Security" <${config.EMAIL_USER}>`,
        to: email,
        subject: '🔐 Verify Your Login - OTP Code',
        text: `Hello,

We detected a login attempt to your PayPro account. To verify it's you, please use the following One-Time Password (OTP):

${otp}

This code will expire in 10 minutes.

If you did not request this login, please secure your account immediately.

Stay safe,
PayPro Security Team`,

        html: `
      <div style="font-family: Arial, sans-serif; color: #333;">
        <h2 style="color: #007bff;">🔐 Verify Your Login</h2>
        <p>Hello,</p>
        <p>We detected a login attempt to your <strong>PayPro</strong> account. To verify it's you, please use the following One-Time Password (OTP):</p>
        <h1 style="color: #007bff;">${otp}</h1>
        <p>This code will expire in <strong>10 minutes</strong>.</p>
        <p>If you did not request this login, we strongly recommend updating your password and securing your account immediately.</p>
        <br/>
        <p>Stay safe,<br/><strong>PayPro Security Team</strong></p>
      </div>
    `,
    });
};

export default sendOtp;
