/**
 * A second-factor entry worth submitting (plan.md §31.2.4): six digits (an
 * emailed or authenticator code), or a recovery code's ten characters with
 * the dash and spaces optional.
 */
export const isCompleteFactor = (value) =>
    /^\d{6}$/.test(String(value ?? '')) || /^[A-Z0-9]{10}$/i.test(String(value ?? '').replace(/[\s-]/g, ''));

export default { isCompleteFactor };
