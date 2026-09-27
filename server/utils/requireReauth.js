import bcrypt from 'bcryptjs';
import User from '../models/User.js';

/**
 * Destructive staff actions require the acting staff member's own current
 * password (plan.md §28.3 rule 4) — the same re-authentication pattern
 * `userController.updateUserProfile` uses for email/password changes. A stolen
 * or XSS'd access token is not enough on its own to suspend an account, move
 * money, or record an identity decision.
 *
 * Sends the 400/401 itself and returns null when the check fails, so a handler
 * reads `const actor = await requireReauth(req, res); if (!actor) return;`.
 * Moved out of adminController (Phase 5) so the compliance controller shares it.
 */
export const requireReauth = async (req, res) => {
    const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : null;
    if (!currentPassword) {
        res.status(400).json({ message: 'Your current password is required for this action' });
        return null;
    }
    const actor = await User.findById(req.user.id).select('+password');
    if (!actor || !(await bcrypt.compare(currentPassword, actor.password))) {
        res.status(401).json({ message: 'Current password is incorrect' });
        return null;
    }
    return actor;
};

export default requireReauth;
