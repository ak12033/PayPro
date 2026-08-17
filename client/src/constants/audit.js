/**
 * Audit actions, translated into English.
 *
 * The server stores machine identifiers — `auth.login.2fa_required`,
 * `security.high_risk_flagged` — which are exactly right for a log and exactly
 * wrong for a screen a customer reads. Showing the raw action string would ask
 * a person auditing their own account to parse a dotted namespace.
 *
 * `severity` drives whether an entry is presented as routine, notable, or
 * alarming. That judgement belongs here rather than in the component, because
 * it is a product decision about what should worry a user — not a styling one.
 */
export const AUDIT_LABELS = {
    'auth.login.success': { label: 'Signed in', severity: 'info' },
    'auth.login.failed': { label: 'Failed sign-in attempt', severity: 'warning' },
    'auth.login.locked': { label: 'Account temporarily locked', severity: 'critical' },
    'auth.login.2fa_required': { label: 'Verification code requested', severity: 'info' },
    'auth.login.2fa_verified': { label: 'Verification code confirmed', severity: 'info' },
    'auth.logout': { label: 'Signed out', severity: 'info' },
    'auth.logout_all': { label: 'Signed out of all devices', severity: 'notable' },
    'auth.register': { label: 'Account created', severity: 'info' },
    /**
     * Token reuse means a refresh token was presented twice — the classic
     * signature of a stolen session. It is the single most serious thing in
     * this list and is presented as such.
     */
    'auth.token_reuse_detected': {
        label: 'Suspicious session activity detected',
        severity: 'critical',
    },
    'user.password_changed': { label: 'Password changed', severity: 'notable' },
    'user.email_changed': { label: 'Email address changed', severity: 'notable' },
    'user.settings_changed': { label: 'Settings updated', severity: 'info' },
    'wallet.transfer.sent': { label: 'Money sent', severity: 'info' },
    'wallet.transfer.2fa_required': { label: 'Transfer verification requested', severity: 'info' },
    'wallet.transfer.failed': { label: 'Transfer failed', severity: 'warning' },
    'wallet.transaction.added': { label: 'Transaction recorded', severity: 'info' },
    'payment.topup.captured': { label: 'Wallet topped up', severity: 'info' },
    'payment.refund.issued': { label: 'Refund issued', severity: 'notable' },
    'payment.webhook.rejected': { label: 'Payment callback rejected', severity: 'warning' },
    'security.high_risk_flagged': { label: 'Transaction flagged as high risk', severity: 'warning' },
};

export const describeAuditAction = (action) =>
    AUDIT_LABELS[action] ?? { label: action, severity: 'info' };

export const SEVERITY_TONES = {
    info: 'neutral',
    notable: 'info',
    warning: 'warning',
    critical: 'negative',
};
