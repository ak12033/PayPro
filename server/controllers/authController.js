import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Session from '../models/Session.js';
import { isValidEmail, validatePassword } from '../utils/validEmail.js';
import {
    createSession,
    generateTokens,
    hashRefreshToken,
    REFRESH_COOKIE_OPTIONS,
    REFRESH_COOKIE_CLEAR_OPTIONS,
    REFRESH_TOKEN_TTL_MS
} from '../utils/token.js';
import { notifyUser } from '../services/notificationService.js';
import { emitToUser } from '../utils/socket.js';
import { asEmail, asString } from '../utils/sanitize.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { audit } from '../services/auditService.js';
import { AUDIT } from '../models/AuditLog.js';
import { assessLogin, finalizeLogin, enrollDevice } from '../services/loginSecurityService.js';
import { issueLoginChallenge } from '../services/twoFactorService.js';
import { RISK_SIGNALS } from '../services/riskEvaluationService.js';
import { describePlace, toStoredPlace } from '../services/locationService.js';

// bcrypt cost. 10 is the library default; 12 is the current baseline for
// credentials guarding money.
const BCRYPT_ROUNDS = 12;

const MAX_FAILED_LOGINS = 8;
const LOCK_DURATION_MS = 15 * 60 * 1000;

export const publicUser = (user) => ({
    _id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    accountBalance: user.accountBalance,
    lastLoginLocation: user.lastLoginLocation,
    preferences: user.preferences
});

/**
 * What to tell the user about why they are being challenged.
 *
 * Naming the actual reason is worth the small amount it reveals. "We did not
 * recognise this device" tells someone whose account is being attacked that
 * they should not approve the prompt; a generic "additional verification
 * required" teaches them to click through without thinking. The reason codes
 * themselves are already known to an attacker who can read this policy.
 */
const CHALLENGE_COPY = {
    [RISK_SIGNALS.NEW_DEVICE]: 'We did not recognise this device.',
    [RISK_SIGNALS.UNTRUSTED_DEVICE]: 'This device has not been trusted yet.',
    [RISK_SIGNALS.EXPIRED_TRUST]: 'It has been a while since you used this device.',
    [RISK_SIGNALS.DIFFERENT_CITY]: 'You are signing in from a new place.',
    [RISK_SIGNALS.DIFFERENT_STATE]: 'You are signing in from a new place.',
    [RISK_SIGNALS.DIFFERENT_COUNTRY]: 'You are signing in from a different country.',
    [RISK_SIGNALS.IMPOSSIBLE_TRAVEL]: 'This sign-in is a long way from your last one.',
    [RISK_SIGNALS.SUSPECTED_PROXY]: 'This connection looks like a VPN or proxy.',
    [RISK_SIGNALS.USER_PREFERENCE]: 'Your account asks for a code every time you sign in.',
};

const explainChallenge = (risk) => {
    const primary = risk.mandatory[0]
        ?? risk.reasons.find((code) => CHALLENGE_COPY[code])
        ?? RISK_SIGNALS.USER_PREFERENCE;
    return { code: primary, message: CHALLENGE_COPY[primary] ?? 'We need to confirm it is you.' };
};

export const register = asyncHandler(async (req, res) => {
    const email = asEmail(req.body?.email);
    const firstName = asString(req.body?.firstName, { maxLength: 60 });
    const lastName = asString(req.body?.lastName, { maxLength: 60 }) || '';
    const password = typeof req.body?.password === 'string' ? req.body.password : null;

    if (!email || !isValidEmail(email)) {
        return res.status(400).json({ message: 'Invalid email format' });
    }
    if (!firstName) {
        return res.status(400).json({ message: 'First name is required' });
    }

    const passwordCheck = validatePassword(password);
    if (!passwordCheck.ok) {
        return res.status(400).json({ message: passwordCheck.error });
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    let user;
    try {
        user = await User.create({
            firstName,
            lastName,
            email,
            password: hashedPassword,
            // Normalised through the location service so the stored shape is
            // the same one every later login writes — `region` is `state` here.
            lastLoginLocation: {
                ...toStoredPlace(req.currentLocation ?? {}),
                isp: req.currentLocation?.isp ?? null,
            },
        });
    } catch (err) {
        // Rely on the unique index rather than a check-then-insert, which races
        // when two signups for the same address arrive together.
        if (err?.code === 11000) {
            return res.status(409).json({ message: 'User already exists' });
        }
        throw err;
    }

    const accessToken = await createSession(user, req, res);

    /**
     * The signup device is trusted immediately.
     *
     * Anything else is friction with no security value: the person who just
     * chose the password on this browser is the account holder by definition,
     * and challenging them on their next visit — which is what a policy of
     * "trust nothing until 2FA" does — teaches new users that the code prompt
     * is noise.
     */
    await enrollDevice({ user, req, declaredDevice: req.body?.deviceInfo });

    audit(AUDIT.REGISTER, { userId: user._id, req });

    res.status(201).json({
        message: 'Registration successful',
        accessToken,
        user: publicUser(user)
    });
});

export const login = asyncHandler(async (req, res) => {
    const email = asEmail(req.body?.email);
    const password = typeof req.body?.password === 'string' ? req.body.password : null;

    if (!email || !password) {
        return res.status(400).json({ message: 'Invalid credentials' });
    }

    // `+password` is required now that the field is select:false on the schema.
    const user = await User.findOne({ email }).select('+password');

    /**
     * Uniform failure response.
     *
     * The original code returned the same message for both branches but bailed
     * out *before* hashing when the user did not exist, so "unknown address"
     * answered in ~1ms while "wrong password" took ~100ms of bcrypt. That gap
     * is a reliable account-enumeration oracle. We now always spend one bcrypt
     * comparison.
     */
    const DUMMY_HASH = '$2a$12$abcdefghijklmnopqrstuvOKQeCPZ1J7qXKVJ5w9pW3Z0mLYlq7e';

    if (!user) {
        await bcrypt.compare(password, DUMMY_HASH);
        return res.status(400).json({ message: 'Invalid credentials' });
    }

    if (user.isLocked()) {
        audit(AUDIT.LOGIN_LOCKED, { userId: user._id, outcome: 'failure', req });
        return res.status(429).json({
            message: 'Too many failed attempts. Please try again in a few minutes.'
        });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
        // Progressive lockout: without it, a 6-character minimum password is
        // brute-forceable at whatever rate the network allows.
        const attempts = (user.failedLoginAttempts || 0) + 1;
        const update = { failedLoginAttempts: attempts };
        if (attempts >= MAX_FAILED_LOGINS) {
            update.failedLoginAttempts = 0;
            update.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
        }
        await User.updateOne({ _id: user._id }, { $set: update });
        audit(update.lockUntil ? AUDIT.LOGIN_LOCKED : AUDIT.LOGIN_FAILED, {
            userId: user._id, outcome: 'failure', req, metadata: { attempts }
        });
        return res.status(400).json({ message: 'Invalid credentials' });
    }

    if (user.failedLoginAttempts || user.lockUntil) {
        await User.updateOne(
            { _id: user._id },
            { $set: { failedLoginAttempts: 0, lockUntil: null } }
        );
    }

    /**
     * Risk assessment.
     *
     * Replaces a single-city comparison against `user.lastLoginLocation`, which
     * could not tell a second device apart from an intruder: signing in on a
     * phone after a laptop overwrote the stored city, so the *next* laptop
     * login was "a new location" and got challenged, forever, in both
     * directions. Every alternation cost the user an email round trip while
     * providing no evidence about who was signing in.
     *
     * The assessment below considers the device, its trust state, the distance
     * from where that device was last used, everywhere else this account signs
     * in from, and whether the journey between the two was physically possible.
     */
    const assessment = await assessLogin({ user, req, declaredDevice: req.body?.deviceInfo });
    const { risk, location } = assessment;

    if (risk.require2FA) {
        const { challengeId } = await issueLoginChallenge(user, {
            prints: assessment.prints,
            deviceId: assessment.device?._id,
            loginHistoryId: assessment.loginHistoryId,
            ip: req.ip,
            reasons: risk.reasons,
            riskScore: risk.score,
        });

        const explanation = explainChallenge(risk);

        // Tell the user out of band, but only when something genuinely
        // security-relevant happened. A code prompt caused purely by their own
        // "always ask" setting is not news, and alert fatigue is what makes
        // people ignore the alert that matters.
        if (explanation.code !== RISK_SIGNALS.USER_PREFERENCE) {
            notifyUser(
                user._id,
                'Security',
                'Sign-in needs verification',
                `${explanation.message} We asked for a code before allowing a sign-in from ${describePlace(location)}.`,
                { city: location.city, ip: location.ip, reason: explanation.code }
            ).catch(() => {});
        }

        audit(AUDIT.LOGIN_2FA_REQUIRED, {
            userId: user._id,
            req,
            metadata: {
                reason: explanation.code,
                reasons: risk.reasons,
                riskScore: risk.score,
                city: location.city,
                deviceKnown: assessment.deviceKnown,
            },
        });

        return res.status(403).json({
            message: `${explanation.message} We sent a verification code to ${user.email}.`,
            require2FA: true,
            email: user.email,
            // Binds the verification request to this challenge — see
            // twoFactorService for why a code alone is not enough.
            challengeId,
            reason: explanation.code,
        });
    }

    const accessToken = await createSession(user, req, res);

    await finalizeLogin({
        user,
        device: assessment.device,
        prints: assessment.prints,
        context: assessment.context,
        location,
        trustDevice: false,
    });

    audit(AUDIT.LOGIN_SUCCESS, {
        userId: user._id,
        req,
        metadata: { city: location.city, riskScore: risk.score, deviceTrusted: assessment.deviceTrusted },
    });

    res.status(200).json({ message: 'Login successful', accessToken, user: publicUser(user) });
});

export const refresh = asyncHandler(async (req, res) => {
    const refreshToken = asString(req.cookies?.refreshToken, { maxLength: 200 });
    if (!refreshToken) {
        return res.status(401).json({ message: 'No refresh token provided' });
    }

    const hashedToken = hashRefreshToken(refreshToken);

    /**
     * Atomic rotation.
     *
     * The previous flow was: find session -> check isValid -> set isValid=false
     * -> save -> create replacement. Two refreshes arriving together (two tabs,
     * or several queued 401s) both found the same valid session, and the second
     * one hit the `!session.isValid` branch, which **deleted the entire session
     * family** and logged the user out of every device. That is the "random
     * logout / expired token loop" symptom.
     *
     * The findOneAndUpdate below claims the token in a single operation, so
     * exactly one concurrent caller can consume it.
     */
    const session = await Session.findOneAndUpdate(
        { refreshTokenHash: hashedToken, isValid: true, expiresAt: { $gt: new Date() } },
        { $set: { isValid: false, rotatedAt: new Date() } },
        { new: true }
    );

    if (!session) {
        // Either the token never existed, has expired, or was already consumed.
        const known = await Session.findOne({ refreshTokenHash: hashedToken });

        if (known && known.rotatedAt) {
            /**
             * Reuse detection. A token that was already rotated is being
             * presented again — either a replay by an attacker who captured it,
             * or a client that raced itself. Treat it as compromise and revoke
             * the whole family.
             *
             * A benign double-refresh is tolerated by a short grace window,
             * so two tabs refreshing in the same second don't nuke the session.
             */
            const GRACE_MS = 10 * 1000;
            const withinGrace = Date.now() - known.rotatedAt.getTime() < GRACE_MS;

            if (!withinGrace) {
                await Session.deleteMany({ familyId: known.familyId });
                audit(AUDIT.TOKEN_REUSE_DETECTED, {
                    userId: known.userId, outcome: 'failure', req,
                    metadata: { familyId: known.familyId }
                });
                emitToUser(known.userId.toString(), 'session_compromised', {
                    reason: 'Refresh token reuse detected. All sessions were revoked.',
                    familyId: known.familyId
                });
            }
        }

        res.clearCookie('refreshToken', REFRESH_COOKIE_CLEAR_OPTIONS);
        return res.status(401).json({ message: 'Session expired or invalid' });
    }

    const user = await User.findById(session.userId);
    if (!user) {
        res.clearCookie('refreshToken', REFRESH_COOKIE_CLEAR_OPTIONS);
        return res.status(401).json({ message: 'Session expired or invalid' });
    }

    const { accessToken, plainRefreshToken, hashedRefreshToken: newHash } = generateTokens(user);

    await Session.create({
        userId: user._id,
        refreshTokenHash: newHash,
        familyId: session.familyId,
        deviceInfo: session.deviceInfo,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS)
    });

    await Session.updateOne({ _id: session._id }, { $set: { replacedBy: newHash } });

    res.cookie('refreshToken', plainRefreshToken, REFRESH_COOKIE_OPTIONS);
    res.status(200).json({ accessToken });
});

export const logout = asyncHandler(async (req, res) => {
    const refreshToken = asString(req.cookies?.refreshToken, { maxLength: 200 });

    if (refreshToken) {
        const hashedToken = hashRefreshToken(refreshToken);
        const session = await Session.findOne({ refreshTokenHash: hashedToken });
        if (session) {
            // Revoke the whole family: logging out should end this device's
            // session chain, not just the one token currently in hand.
            await Session.deleteMany({ familyId: session.familyId });
            audit(AUDIT.LOGOUT, { userId: session.userId, req });
        }
    }

    res.clearCookie('refreshToken', REFRESH_COOKIE_CLEAR_OPTIONS);
    res.status(200).json({ message: 'Logged out successfully' });
});

/** Revoke every session for the current user (used by "log out everywhere"). */
export const logoutAll = asyncHandler(async (req, res) => {
    await Session.deleteMany({ userId: req.user.id });
    /**
     * Drop every registered device along with every session.
     *
     * "Log out everywhere" is reached from the security centre, by someone who
     * believes a device is no longer theirs. Ending the sessions while leaving
     * the push registrations in place would keep delivering "You received
     * ₹5,000" to exactly the device they were trying to cut off.
     */
    await User.updateOne(
        { _id: req.user.id },
        { $inc: { tokenVersion: 1 }, $set: { fcmTokens: [] } }
    );
    audit(AUDIT.LOGOUT_ALL, { userId: req.user.id, req });
    res.clearCookie('refreshToken', REFRESH_COOKIE_CLEAR_OPTIONS);
    res.status(200).json({ message: 'All sessions revoked' });
});

/** List active sessions so a user can see where they are signed in. */
export const listSessions = asyncHandler(async (req, res) => {
    const sessions = await Session.find({
        userId: req.user.id,
        isValid: true,
        expiresAt: { $gt: new Date() }
    })
        .sort({ createdAt: -1 })
        .select('deviceInfo createdAt expiresAt familyId')
        .lean();

    res.status(200).json({ sessions });
});
