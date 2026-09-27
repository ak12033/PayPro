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

/**
 * Double-submit CSRF token, paired with the refresh cookie.
 *
 * `GET /auth/refresh` used to be a state-changing read: any cross-site page
 * could trigger it (a plain `<img>`/form submission carries cookies without
 * needing CORS permission — CORS only gates whether the *response* is
 * readable, not whether the request is sent), and in production the cookie is
 * `SameSite=None`, so the browser would happily attach it cross-site. Moving
 * the route to POST closes the `<img src>` vector but not a cross-site form
 * post.
 *
 * The fix is the standard double-submit pattern: this cookie is deliberately
 * NOT httpOnly, so the SPA's own JS can read it and echo it back as the
 * `X-CSRF-Token` header (see refreshSession.js on the client). A cross-site
 * attacker can make the browser *send* the cookie, but — same-origin policy —
 * cannot *read* it to put its value in the header, so the header and cookie
 * only ever match when the request genuinely originated from our own page.
 */
export const CSRF_COOKIE_OPTIONS = {
    httpOnly: false,
    secure: config.NODE_ENV === 'production',
    sameSite: config.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: REFRESH_TOKEN_TTL_MS,
    path: '/'
};

export const CSRF_COOKIE_CLEAR_OPTIONS = {
    httpOnly: CSRF_COOKIE_OPTIONS.httpOnly,
    secure: CSRF_COOKIE_OPTIONS.secure,
    sameSite: CSRF_COOKIE_OPTIONS.sameSite,
    path: CSRF_COOKIE_OPTIONS.path
};

const generateCsrfToken = () => crypto.randomBytes(32).toString('hex');

/** Issue a fresh CSRF cookie, independent of any particular session record. */
export const issueCsrfCookie = (res) => {
    const csrfToken = generateCsrfToken();
    res.cookie('csrfToken', csrfToken, CSRF_COOKIE_OPTIONS);
    return csrfToken;
};

/**
 * Constant-time double-submit check: the header must equal the cookie.
 * `crypto.timingSafeEqual` needs equal-length buffers, so a length mismatch
 * is checked first rather than trying to pad — a shortcut here isn't a
 * timing leak worth caring about, since the two values are both public to
 * the browser that holds them, not secrets being brute-forced.
 */
export const verifyCsrf = (req) => {
    const header = typeof req.headers['x-csrf-token'] === 'string' ? req.headers['x-csrf-token'] : '';
    const cookie = typeof req.cookies?.csrfToken === 'string' ? req.cookies.csrfToken : '';
    if (!header || !cookie || header.length !== cookie.length) return false;
    return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(cookie));
};

export const createSession = async (user, req, res) => {
    const familyId = crypto.randomUUID();
    const { accessToken, plainRefreshToken, hashedRefreshToken } = generateTokens(user);
    const csrfToken = generateCsrfToken();

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
    res.cookie('csrfToken', csrfToken, CSRF_COOKIE_OPTIONS);
    return accessToken;
};

export const hashRefreshToken = (token) =>
    crypto.createHash('sha256').update(token).digest('hex');
