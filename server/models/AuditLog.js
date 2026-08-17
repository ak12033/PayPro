import mongoose from 'mongoose';

/**
 * Immutable-by-convention audit trail.
 *
 * The application had no audit log at all. For a system that moves money that
 * is a compliance gap as much as an engineering one: after an incident there
 * was no way to answer "who changed this password", "where was this transfer
 * initiated from", or "was this refund issued by the user or by the gateway".
 * The Transaction collection records what happened to a *balance*, but nothing
 * recorded security-relevant actions or their origin.
 */
const auditLogSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    action: { type: String, required: true },
    /**
     * 'success' | 'failure'. Failed attempts matter more than successful ones
     * for detecting credential stuffing and enumeration.
     */
    outcome: { type: String, enum: ['success', 'failure'], default: 'success' },
    /** Resource touched, e.g. { type: 'Transaction', id: '...' } */
    target: {
        type: { type: String },
        id: { type: String },
    },
    ip: String,
    userAgent: String,
    requestId: String,
    /** Non-sensitive extra context. Never store credentials or OTPs here. */
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
    timestamps: { createdAt: true, updatedAt: false },
    // Audit rows are append-only; nothing should ever mutate one.
    minimize: false,
});

auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ outcome: 1, action: 1, createdAt: -1 });

/**
 * Retention: 400 days.
 *
 * Long enough to cover a full annual review cycle plus dispute windows, short
 * enough that the collection does not grow without bound.
 */
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 400 * 24 * 60 * 60 });

export const AUDIT = {
    LOGIN_SUCCESS: 'auth.login.success',
    LOGIN_FAILED: 'auth.login.failed',
    LOGIN_LOCKED: 'auth.login.locked',
    LOGIN_2FA_REQUIRED: 'auth.login.2fa_required',
    LOGIN_2FA_VERIFIED: 'auth.login.2fa_verified',
    LOGOUT: 'auth.logout',
    LOGOUT_ALL: 'auth.logout_all',
    REGISTER: 'auth.register',
    TOKEN_REUSE_DETECTED: 'auth.token_reuse_detected',
    DEVICE_TRUSTED: 'security.device.trusted',
    DEVICE_REVOKED: 'security.device.revoked',
    DEVICE_RENAMED: 'security.device.renamed',
    DEVICES_REVOKED_ALL: 'security.device.revoked_all',
    PASSWORD_CHANGED: 'user.password_changed',
    EMAIL_CHANGED: 'user.email_changed',
    SETTINGS_CHANGED: 'user.settings_changed',
    TRANSFER_SENT: 'wallet.transfer.sent',
    TRANSFER_2FA_REQUIRED: 'wallet.transfer.2fa_required',
    TRANSFER_FAILED: 'wallet.transfer.failed',
    TRANSACTION_ADDED: 'wallet.transaction.added',
    TOPUP_CAPTURED: 'payment.topup.captured',
    REFUND_ISSUED: 'payment.refund.issued',
    WEBHOOK_REJECTED: 'payment.webhook.rejected',
    HIGH_RISK_FLAGGED: 'security.high_risk_flagged',
};

export default mongoose.model('AuditLog', auditLogSchema);
