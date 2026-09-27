/**
 * Gate a route to one or more roles.
 *
 * Mounted after `authMiddleware`, which already re-reads `role` from the
 * database on every request (not from the JWT — a JWT is not re-issued when
 * an admin demotes someone, so trusting its claim would let a revoked admin
 * keep acting as one for up to 15 minutes). This middleware only compares
 * against what `authMiddleware` already loaded; it does not query again.
 */
export const requireRole = (...roles) => (req, res, next) => {
    if (!req.user?.role || !roles.includes(req.user.role)) {
        return res.status(403).json({ message: 'You do not have permission to do that', code: 'FORBIDDEN_ROLE' });
    }
    next();
};

export default requireRole;
