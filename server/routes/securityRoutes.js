import express from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
    listActiveSessions,
    revokeSession,
    getLoginHistory,
    getActivityLog,
    listTrustedDevices,
    revokeTrustedDevice,
    revokeAllTrustedDevices,
    renameTrustedDevice,
    getSignInHistory,
} from '../controllers/securityController.js';

const securityRouter = express.Router();

// Every route here is about the caller's own account.
securityRouter.use(authMiddleware);

securityRouter.get('/sessions', listActiveSessions);
securityRouter.delete('/sessions/:familyId', revokeSession);

/**
 * Trusted devices.
 *
 * A device is a standing exemption from 2FA, so being able to see and remove
 * one is not a nice-to-have: without it, a device trusted once — on a friend's
 * laptop, at an airport, by an attacker who got through a challenge — keeps
 * that exemption forever with nothing in the product able to take it away.
 */
securityRouter.get('/devices', listTrustedDevices);
securityRouter.patch('/devices/:deviceId', renameTrustedDevice);
securityRouter.delete('/devices/:deviceId', revokeTrustedDevice);
securityRouter.delete('/devices', revokeAllTrustedDevices);

securityRouter.get('/login-history', getLoginHistory);
securityRouter.get('/sign-ins', getSignInHistory);
securityRouter.get('/activity', getActivityLog);

export default securityRouter;
