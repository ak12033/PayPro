import jwt from 'jsonwebtoken';
import config from '../config/env.js';
import User from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Verifies the access token.
 *
 * Two changes over the original:
 *
 *  - It distinguishes an *expired* token from an *invalid* one. Previously both
 *    returned `code: 'TOKEN_EXPIRED'`, so the client's axios interceptor fired a
 *    silent refresh even for a structurally bogus or forged token, producing a
 *    401 -> refresh -> 401 loop against the server.
 *
 *  - It honours `tokenVersion`, so a password change or "log out everywhere"
 *    invalidates tokens already in circulation, instead of leaving a 15-minute
 *    window in which a stolen token can still spend money.
 */
const authMiddleware = asyncHandler(async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Unauthorized', code: 'NO_TOKEN' });
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
        return res.status(401).json({ message: 'Unauthorized', code: 'NO_TOKEN' });
    }

    let decoded;
    try {
        decoded = jwt.verify(token, config.JWT_SECRET);
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token expired', code: 'TOKEN_EXPIRED' });
        }
        return res.status(401).json({ message: 'Invalid token', code: 'TOKEN_INVALID' });
    }

    // Cheap projection; the _id index makes this a single-key lookup.
    const user = await User.findById(decoded.id).select('tokenVersion role status emailVerified totp.enabled').lean();
    if (!user) {
        return res.status(401).json({ message: 'Invalid token', code: 'TOKEN_INVALID' });
    }

    if ((decoded.tv ?? 0) !== (user.tokenVersion ?? 0)) {
        return res.status(401).json({ message: 'Session revoked', code: 'TOKEN_REVOKED' });
    }

    /**
     * A suspension must take effect on the next request, not after the
     * access token's 15-minute expiry — the whole point of suspending an
     * account is usually that it is actively being abused right now.
     */
    if (user.status === 'closed') {
        return res.status(403).json({ message: 'Account closed', code: 'ACCOUNT_CLOSED' });
    }
    if (user.status && user.status !== 'active') {
        return res.status(403).json({ message: 'Account suspended', code: 'ACCOUNT_SUSPENDED' });
    }

    req.user = {
        id: decoded.id,
        email: decoded.email,
        role: user.role || 'user',
        // Read fresh for the same reason as role: verifying must unlock money
        // movement on the next request, not after the token is re-minted.
        emailVerified: user.emailVerified === true,
        // Read by `requireStaffTotp`: enrolling must open the console at once.
        totpEnabled: user.totp?.enabled === true,
    };
    // Make the user id available to the logger for every downstream log line.
    if (req.context) req.context.userId = decoded.id;
    next();
});

export default authMiddleware;
