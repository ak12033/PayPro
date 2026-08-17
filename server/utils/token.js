import jwt from 'jsonwebtoken';
import config from '../config/env.js';
import crypto from 'crypto';
import Session from '../models/Session.js';

export const ACCESS_TOKEN_TTL = '15m';
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const generateTokens = (user) => {
    const accessToken = jwt.sign(
        {
            id: user._id,
            email: user.email,
            // Lets authMiddleware reject tokens minted before a credential
            // change, without waiting out the 15-minute expiry.
            tv: user.tokenVersion ?? 0
        },
        config.JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_TTL }
    );

    const plainRefreshToken = crypto.randomBytes(40).toString('hex');
    const hashedRefreshToken = crypto.createHash('sha256').update(plainRefreshToken).digest('hex');

    return { accessToken, plainRefreshToken, hashedRefreshToken };
};

/**
 * Refresh cookie options.
 *
 * `path` is '/' rather than '/api/auth/refresh'.
 *
 * With the narrower path the browser only attached the cookie to the refresh
 * endpoint itself — so `POST /api/auth/logout` never received it,
 * `req.cookies.refreshToken` was always undefined there, and **logout could not
 * revoke the session server-side**. The refresh token stayed valid for its full
 * 7 days after the user clicked "Log out", and the `res.clearCookie` call
 * (scoped to the same narrow path) did not remove it from the browser either.
 */
export const REFRESH_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: config.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: REFRESH_TOKEN_TTL_MS,
    path: '/'
};

/** Same attributes minus maxAge — clearCookie only matches on these. */
export const REFRESH_COOKIE_CLEAR_OPTIONS = {
    httpOnly: REFRESH_COOKIE_OPTIONS.httpOnly,
    secure: REFRESH_COOKIE_OPTIONS.secure,
    sameSite: REFRESH_COOKIE_OPTIONS.sameSite,
    path: REFRESH_COOKIE_OPTIONS.path
};

export const createSession = async (user, req, res) => {
    const familyId = crypto.randomUUID();
    const { accessToken, plainRefreshToken, hashedRefreshToken } = generateTokens(user);

    await Session.create({
        userId: user._id,
        refreshTokenHash: hashedRefreshToken,
        familyId,
        deviceInfo: {
            userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
            ip: req.ip
        },
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS)
    });

    res.cookie('refreshToken', plainRefreshToken, REFRESH_COOKIE_OPTIONS);
    return accessToken;
};

export const hashRefreshToken = (token) =>
    crypto.createHash('sha256').update(token).digest('hex');
