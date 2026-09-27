import { describe, it, expect } from 'vitest';
import { hotp, totp, verifyTotp, base32Encode, base32Decode, otpauthUri, generateSecret, TOTP_PERIOD_SECONDS } from '../utils/totp.js';

/**
 * The algorithm is pinned to the RFCs' own published vectors, because a TOTP
 * implementation that is subtly wrong still produces six plausible digits — it
 * just never matches the user's phone.
 */

// RFC 4226 Appendix D / RFC 6238 Appendix B: the ASCII secret "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'));

describe('HOTP (RFC 4226 Appendix D)', () => {
    const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
    it.each(expected.map((code, counter) => [counter, code]))('counter %i → %s', (counter, code) => {
        expect(hotp(RFC_SECRET, counter)).toBe(code);
    });
});

describe('TOTP (RFC 6238 Appendix B, SHA-1, last 6 digits)', () => {
    // The RFC prints 8 digits; an authenticator shows the low 6 of the same value.
    it.each([
        [59, '94287082'],
        [1111111109, '07081804'],
        [1111111111, '14050471'],
        [1234567890, '89005924'],
        [2000000000, '69279037'],
        [20000000000, '65353130'],
    ])('T=%i', (seconds, eightDigits) => {
        expect(totp(RFC_SECRET, { timeMs: seconds * 1000 })).toBe(eightDigits.slice(-6));
        expect(totp(RFC_SECRET, { timeMs: seconds * 1000, digits: 8 })).toBe(eightDigits);
    });
});

describe('base32', () => {
    it('round-trips arbitrary bytes and matches RFC 4648 vectors', () => {
        expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
        const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
        expect(base32Decode(base32Encode(bytes)).equals(bytes)).toBe(true);
    });

    it('accepts lowercase, spaces and padding as typed from a setup screen', () => {
        expect(base32Decode('mzxw 6ytb oi==').toString()).toBe('foobar');
    });

    it('generates a 160-bit secret', () => {
        expect(base32Decode(generateSecret())).toHaveLength(20);
    });
});

describe('verifyTotp', () => {
    const now = 1_700_000_000_000;
    const step = Math.floor(now / 1000 / TOTP_PERIOD_SECONDS);
    const at = (offset) => totp(RFC_SECRET, { timeMs: now + offset * TOTP_PERIOD_SECONDS * 1000 });

    it('accepts the current step and one either side, and returns which step matched', () => {
        expect(verifyTotp(RFC_SECRET, at(0), { timeMs: now })).toBe(step);
        expect(verifyTotp(RFC_SECRET, at(-1), { timeMs: now })).toBe(step - 1);
        expect(verifyTotp(RFC_SECRET, at(1), { timeMs: now })).toBe(step + 1);
    });

    it('refuses codes two steps away', () => {
        expect(verifyTotp(RFC_SECRET, at(-2), { timeMs: now })).toBeNull();
        expect(verifyTotp(RFC_SECRET, at(2), { timeMs: now })).toBeNull();
    });

    it('refuses a code at or before the last accepted step (replay)', () => {
        expect(verifyTotp(RFC_SECRET, at(0), { timeMs: now, afterStep: step })).toBeNull();
        expect(verifyTotp(RFC_SECRET, at(1), { timeMs: now, afterStep: step })).toBe(step + 1);
    });

    it('refuses anything that is not exactly six digits', () => {
        for (const junk of ['', '12345', '1234567', 'abcdef', null, undefined, 123456]) {
            expect(verifyTotp(RFC_SECRET, junk, { timeMs: now })).toBeNull();
        }
    });
});

describe('otpauthUri', () => {
    it('labels the account with the issuer so apps show "PayPro"', () => {
        const uri = otpauthUri({ secret: 'ABC', accountName: 'asha@example.com' });
        expect(uri.startsWith('otpauth://totp/PayPro:asha%40example.com?')).toBe(true);
        const params = new URL(uri).searchParams;
        expect(params.get('secret')).toBe('ABC');
        expect(params.get('issuer')).toBe('PayPro');
        expect(params.get('digits')).toBe('6');
        expect(params.get('period')).toBe('30');
    });
});
