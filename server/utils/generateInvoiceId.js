import crypto from 'crypto';

/**
 * Collision-resistant invoice id.
 *
 * The previous version used `Math.random()` over an 8-digit space plus 4 digits
 * of timestamp. `invoiceId` carries a unique index, so a collision threw a
 * duplicate-key error — and in the transfer path that error was raised *after*
 * the sender had already been debited, destroying the money.
 *
 * This uses a CSPRNG over a much larger space plus a time component, and
 * callers still retry on the (now vanishingly unlikely) duplicate.
 */
export const generateInvoiceId = () => {
    const random = crypto.randomBytes(6).toString('hex').toUpperCase(); // 48 bits
    const timestamp = Date.now().toString(36).toUpperCase();
    return `AP${timestamp}${random}`;
};
