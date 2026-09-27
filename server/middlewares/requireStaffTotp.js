import { audit } from '../services/auditService.js';
import { AUDIT } from '../models/AuditLog.js';

/**
 * Mandatory second factor for staff (plan.md §28.3 rule 5).
 *
 * Mounted on the whole admin router, after `authMiddleware` (which reads
 * `totp.enabled` fresh on every request, so enrolling opens the console on the
 * next call). A staff member without an authenticator can still sign in and
 * use their own wallet; they cannot act on anyone else's until they set one up.
 * The client turns `TOTP_ENROLMENT_REQUIRED` into a link to the setup screen.
 *
 * Ordinary users never reach the admin router with a staff role, so they are
 * refused by `requireRole` as before, not by this.
 */
export const requireStaffTotp = (req, res, next) => {
    if (req.user?.role && req.user.role !== 'user' && !req.user.totpEnabled) {
        audit(AUDIT.STAFF_TOTP_REQUIRED, {
            userId: req.user.id, req, outcome: 'failure',
            metadata: { path: req.originalUrl?.split('?')[0] },
        });
        return res.status(403).json({
            message: 'Set up an authenticator app before using the admin console.',
            code: 'TOTP_ENROLMENT_REQUIRED',
        });
    }
    next();
};

export default requireStaffTotp;
