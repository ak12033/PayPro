import jwt from 'jsonwebtoken';
import config from '../config/env.js';
import crypto from 'crypto';
import Session from '../models/Session.js';

export const generateTokens = (user) => {
    const accessToken = jwt.sign(
        { id: user._id, email: user.email },
        config.JWT_SECRET,
        { expiresIn: '15m' }
    );

    const plainRefreshToken = crypto.randomBytes(40).toString('hex');
    const hashedRefreshToken = crypto.createHash('sha256').update(plainRefreshToken).digest('hex');

    return { accessToken, plainRefreshToken, hashedRefreshToken };
};

export const REFRESH_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: config.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/api/auth/refresh'
};

export const createSession = async (user, req, res) => {
    const familyId = crypto.randomUUID();
    const { accessToken, plainRefreshToken, hashedRefreshToken } = generateTokens(user);

    await Session.create({
        userId: user._id,
        refreshTokenHash: hashedRefreshToken,
        familyId,
        deviceInfo: {
            userAgent: req.headers['user-agent'],
            ip: req.ip
        },
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });

    res.cookie('refreshToken', plainRefreshToken, REFRESH_COOKIE_OPTIONS);
    return accessToken;
};
