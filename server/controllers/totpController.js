import User from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { asString } from '../utils/sanitize.js';
import { audit } from '../services/auditService.js';
import { AUDIT } from '../models/AuditLog.js';
import { notifyUser } from '../services/notificationService.js';
import { sendEmailAlert } from '../services/emailService.js';
import {
    getStatus, beginSetup, confirmSetup, disable, regenerateRecoveryCodes, TotpError,
} from '../services/totpService.js';

/**
 * The holder's own authenticator-app settings (plan.md §31.2.4).
 *
 * Mounted under /api/auth/totp behind `authMiddleware`. Turning the factor on
 * needs only a code from the new app (the session is already authenticated,
 * and adding a factor cannot weaken the account). Turning it off or re-issuing
 * recovery codes needs the password *and* a current code, since those are what
 * someone holding a stolen session would do first.
 */

const sendTotpError = (res, err) => {
    if (err instanceof TotpError) return res.status(err.status).json({ message: err.message, code: err.code });
    throw err;
};

const tellHolder = async (userId, title, body) => {
    notifyUser(userId, 'Security', title, body, {}).catch(() => {});
    const user = await User.findById(userId).select('email firstName').lean();
    // Always-on, like the other security emails (§26.3): not gated on emailAlerts.
    if (user) sendEmailAlert(user, 'securityChange', { title, body });
};

export const getTotpStatus = asyncHandler(async (req, res) => {
    try {
        res.status(200).json(await getStatus(req.user.id));
    } catch (err) {
        sendTotpError(res, err);
    }
});

export const startTotpSetup = asyncHandler(async (req, res) => {
    try {
        const setup = await beginSetup(req.user.id);
        audit(AUDIT.TOTP_SETUP_STARTED, { userId: req.user.id, req });
        // The secret is returned once, for the QR code and manual entry. It is never logged.
        res.status(200).json(setup);
    } catch (err) {
        sendTotpError(res, err);
    }
});

export const confirmTotpSetup = asyncHandler(async (req, res) => {
    const code = asString(req.body?.code, { maxLength: 10 });
    if (!code) return res.status(400).json({ message: 'Enter the 6-digit code from your authenticator app' });

    try {
        const { recoveryCodes } = await confirmSetup(req.user.id, code);
        audit(AUDIT.TOTP_ENABLED, { userId: req.user.id, req });
        await tellHolder(
            req.user.id,
            'Authenticator app turned on',
            'Sign-ins and transfers that need a second step will now ask for a code from your authenticator app instead of email. If this was not you, contact support now.'
        );
        res.status(200).json({ message: 'Authenticator app turned on', recoveryCodes });
    } catch (err) {
        if (err instanceof TotpError && err.code === 'TOTP_INVALID') {
            audit(AUDIT.TOTP_ENABLED, { userId: req.user.id, req, outcome: 'failure' });
        }
        sendTotpError(res, err);
    }
});

export const disableTotp = asyncHandler(async (req, res) => {
    const password = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : null;
    const code = asString(req.body?.code, { maxLength: 20 });
    if (!password || !code) return res.status(400).json({ message: 'Your password and a current code are required' });

    try {
        await disable(req.user.id, { password, code });
        audit(AUDIT.TOTP_DISABLED, { userId: req.user.id, req });
        await tellHolder(
            req.user.id,
            'Authenticator app turned off',
            'Your PayPro account no longer uses an authenticator app. Verification codes will be emailed to you instead. If this was not you, contact support now.'
        );
        res.status(200).json({ message: 'Authenticator app turned off' });
    } catch (err) {
        if (err instanceof TotpError && ['BAD_PASSWORD', 'TOTP_INVALID'].includes(err.code)) {
            audit(AUDIT.TOTP_DISABLED, { userId: req.user.id, req, outcome: 'failure', metadata: { reason: err.code } });
        }
        sendTotpError(res, err);
    }
});

export const regenerateTotpRecoveryCodes = asyncHandler(async (req, res) => {
    const password = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : null;
    const code = asString(req.body?.code, { maxLength: 20 });
    if (!password || !code) return res.status(400).json({ message: 'Your password and a current code are required' });

    try {
        const { recoveryCodes } = await regenerateRecoveryCodes(req.user.id, { password, code });
        audit(AUDIT.TOTP_RECOVERY_CODES_REGENERATED, { userId: req.user.id, req });
        await tellHolder(
            req.user.id,
            'New recovery codes created',
            'Your old PayPro recovery codes no longer work. If this was not you, contact support now.'
        );
        res.status(200).json({ message: 'New recovery codes created', recoveryCodes });
    } catch (err) {
        sendTotpError(res, err);
    }
});
