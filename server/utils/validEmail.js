export const isValidEmail = (email) => {
    if (typeof email !== 'string' || email.length > 254) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    return emailRegex.test(email);
};

/**
 * Password policy.
 *
 * The previous rule was "at least 6 characters", with no composition
 * requirement — for an application that holds a spendable balance that is well
 * below any reasonable baseline, and it makes the online brute-force surface
 * (now also rate-limited and lockout-protected) far too cheap.
 */
export const MIN_PASSWORD_LENGTH = 8;

const COMMON_PASSWORDS = new Set([
    'password', 'password1', 'password123', '12345678', '123456789', 'qwerty123',
    'iloveyou', 'admin123', 'welcome1', 'letmein1', 'abc12345', '11111111'
]);

export const validatePassword = (password) => {
    if (typeof password !== 'string') {
        return { ok: false, error: 'Password is required' };
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
        return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long` };
    }
    // bcrypt silently truncates beyond 72 bytes; reject rather than mislead.
    if (Buffer.byteLength(password, 'utf8') > 72) {
        return { ok: false, error: 'Password may not exceed 72 bytes' };
    }
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) {
        return { ok: false, error: 'Password must contain both uppercase and lowercase letters' };
    }
    if (!/[0-9]/.test(password)) {
        return { ok: false, error: 'Password must contain at least one number' };
    }
    if (COMMON_PASSWORDS.has(password.toLowerCase())) {
        return { ok: false, error: 'This password is too common. Please choose another.' };
    }
    return { ok: true };
};
