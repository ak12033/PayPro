import Session from '../models/Session.js';
import { getUserAuditLog } from '../services/auditService.js';
import { AUDIT } from '../models/AuditLog.js';
import { asInt, asString, asObjectId } from '../utils/sanitize.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { audit } from '../services/auditService.js';
import { hashRefreshToken } from '../utils/token.js';
import * as trustedDevices from '../services/trustedDeviceService.js';
import { getHistory } from '../services/loginHistoryService.js';

/**
 * Security centre endpoints: what the user needs to answer "is my account
 * safe?" without contacting support.
 *
 * None of this existed. A user had no way to see where they were signed in, no
 * way to revoke a device they had lost, and no visibility into failed login
 * attempts against their account.
 */

/** Devices with a live session. */
export const listActiveSessions = asyncHandler(async (req, res) => {
    const sessions = await Session.find({
        userId: req.user.id,
        isValid: true,
        expiresAt: { $gt: new Date() },
    })
        .sort({ createdAt: -1 })
        .select('familyId deviceInfo createdAt expiresAt')
        .lean();

    // Mark the caller's own session so the UI can label it "This device" and
    // avoid offering a revoke button that would log them out unexpectedly.
    const currentHash = req.cookies?.refreshToken
        ? hashRefreshToken(req.cookies.refreshToken)
        : null;

    const current = currentHash
        ? await Session.findOne({ refreshTokenHash: currentHash }).select('familyId').lean()
        : null;

    res.status(200).json({
        sessions: sessions.map((s) => ({
            id: s.familyId,
            device: s.deviceInfo?.userAgent || 'Unknown device',
            ip: s.deviceInfo?.ip || 'Unknown',
            signedInAt: s.createdAt,
            expiresAt: s.expiresAt,
            isCurrent: current ? s.familyId === current.familyId : false,
        })),
    });
});

/** Revoke one device by its session family. */
export const revokeSession = asyncHandler(async (req, res) => {
    const familyId = asString(req.params.familyId, { maxLength: 64 });
    if (!familyId) {
        return res.status(400).json({ message: 'Invalid session id' });
    }

    // The userId filter is the authorization check — without it any user could
    // revoke another user's sessions by guessing a family id.
    const { deletedCount } = await Session.deleteMany({
        userId: req.user.id,
        familyId,
    });

    if (deletedCount === 0) {
        return res.status(404).json({ message: 'Session not found' });
    }

    audit(AUDIT.LOGOUT, {
        userId: req.user.id,
        req,
        metadata: { revokedFamilyId: familyId, scope: 'single_device' },
    });

    res.status(200).json({ success: true, message: 'Device signed out' });
});

/**
 * Login history — the security-relevant subset of the audit log.
 */
export const getLoginHistory = asyncHandler(async (req, res) => {
    const page = asInt(req.query.page, { min: 1, max: 1000, fallback: 1 });
    const limit = asInt(req.query.limit, { min: 1, max: 50, fallback: 20 });

    const result = await getUserAuditLog(req.user.id, {
        page,
        limit,
        actions: [
            // Account creation belongs here: it is the first entry a user
            // expects to see when auditing access to their own account.
            AUDIT.REGISTER,
            AUDIT.LOGIN_SUCCESS,
            AUDIT.LOGIN_FAILED,
            AUDIT.LOGIN_LOCKED,
            AUDIT.LOGIN_2FA_REQUIRED,
            AUDIT.LOGIN_2FA_VERIFIED,
            AUDIT.LOGOUT,
            AUDIT.LOGOUT_ALL,
            AUDIT.PASSWORD_CHANGED,
            AUDIT.EMAIL_CHANGED,
            AUDIT.TOKEN_REUSE_DETECTED,
        ],
    });

    res.status(200).json(result);
});

/**
 * Devices this account signs in from, and which of them are trusted.
 *
 * Distinct from the session list above, and both are needed. A *session* is a
 * live refresh-token family: signing one out ends access right now. A *device*
 * is a standing decision to skip the second factor, and it outlives every
 * session it issues. Revoking one without the other is the gap an attacker who
 * once got a device trusted would walk back through.
 */
export const listTrustedDevices = asyncHandler(async (req, res) => {
    const devices = await trustedDevices.listDevices(req.user.id);
    res.status(200).json({ devices });
});

/**
 * Withdraw trust from a single device.
 *
 * Scoped to the caller's own devices by the service, so a guessed id cannot
 * reach another account. Other devices are untouched: revoking a lost phone
 * must not sign the user out of their laptop.
 */
export const revokeTrustedDevice = asyncHandler(async (req, res) => {
    const deviceId = asObjectId(req.params.deviceId);
    if (!deviceId) return res.status(400).json({ message: 'Invalid device id' });

    const removed = await trustedDevices.revokeDevice(req.user.id, deviceId);
    if (!removed) return res.status(404).json({ message: 'Device not found' });

    audit(AUDIT.DEVICE_REVOKED, {
        userId: req.user.id,
        req,
        target: { type: 'TrustedDevice', id: deviceId },
    });

    res.status(200).json({ success: true, message: 'Device removed. It will need to verify again.' });
});

/** The "none of these are mine" lever. */
export const revokeAllTrustedDevices = asyncHandler(async (req, res) => {
    const count = await trustedDevices.revokeAllDevices(req.user.id);

    audit(AUDIT.DEVICES_REVOKED_ALL, { userId: req.user.id, req, metadata: { count } });

    res.status(200).json({
        success: true,
        removed: count,
        message: 'All devices removed. Your next sign-in on each will need a code.',
    });
});

/** Rename a device so the list means something a month from now. */
export const renameTrustedDevice = asyncHandler(async (req, res) => {
    const deviceId = asObjectId(req.params.deviceId);
    const name = asString(req.body?.name, { maxLength: 80 });

    if (!deviceId) return res.status(400).json({ message: 'Invalid device id' });
    if (!name) return res.status(400).json({ message: 'A device name is required' });

    const renamed = await trustedDevices.renameDevice(req.user.id, deviceId, name);
    if (!renamed) return res.status(404).json({ message: 'Device not found' });

    audit(AUDIT.DEVICE_RENAMED, {
        userId: req.user.id,
        req,
        target: { type: 'TrustedDevice', id: deviceId },
    });

    res.status(200).json({ success: true });
});

/**
 * Structured sign-in history: where from, on what, how risky, and whether a
 * code was asked for.
 *
 * The audit-log view above answers "what happened to my account"; this answers
 * "who has been signing in", with the location and risk detail that only the
 * login pipeline records.
 */
export const getSignInHistory = asyncHandler(async (req, res) => {
    const page = asInt(req.query.page, { min: 1, max: 1000, fallback: 1 });
    const limit = asInt(req.query.limit, { min: 1, max: 50, fallback: 20 });

    res.status(200).json(await getHistory(req.user.id, { page, limit }));
});

/**
 * Full account activity log (money + security).
 */
export const getActivityLog = asyncHandler(async (req, res) => {
    const page = asInt(req.query.page, { min: 1, max: 1000, fallback: 1 });
    const limit = asInt(req.query.limit, { min: 1, max: 50, fallback: 20 });

    const result = await getUserAuditLog(req.user.id, { page, limit });
    res.status(200).json(result);
});
