import { describe, it, expect } from 'vitest';

/**
 * Encryption at rest for identity data and the document store's type sniffing
 * (Phase 5, plan.md §0.20.2).
 */
process.env.PII_ENCRYPTION_KEY = 'c'.repeat(64);
const enc = await import('../utils/fieldEncryption.js');
const { sniffContentType, cleanFileName } = await import('../services/secureDocumentService.js');

describe('fieldEncryption', () => {
    it('round-trips strings and buffers, with a fresh IV each time', () => {
        const a = enc.encryptField('ABCDE1234F');
        const b = enc.encryptField('ABCDE1234F');
        expect(a).not.toBe(b);
        expect(a).not.toContain('ABCDE1234F');
        expect(enc.decryptField(a)).toBe('ABCDE1234F');

        const sealed = enc.encryptBuffer(Buffer.from('%PDF-1.4 secret'));
        expect(enc.decryptBuffer(sealed).toString()).toBe('%PDF-1.4 secret');
    });

    it('refuses a tampered ciphertext instead of decrypting it to something else', () => {
        const parts = enc.encryptField('123456789012').split(':');
        const body = Buffer.from(parts[3], 'base64url');
        body[0] ^= 1;
        parts[3] = body.toString('base64url');
        expect(() => enc.decryptField(parts.join(':'))).toThrow();
    });

    it('fingerprints are stable, keyed, and separated by kind', () => {
        expect(enc.fingerprint('pan', 'ABCDE1234F')).toBe(enc.fingerprint('pan', 'ABCDE1234F'));
        expect(enc.fingerprint('pan', 'ABCDE1234F')).not.toBe(enc.fingerprint('bank_account', 'ABCDE1234F'));
        expect(enc.fingerprint('pan', 'ABCDE1234F')).not.toMatch(/ABCDE/);
    });

    it('masks', () => {
        expect(enc.maskPan('ABCDE1234F')).toBe('XXXXX1234X');
        expect(enc.maskTail('123456789012', 4)).toBe('XXXXXXXX9012');
        expect(enc.maskTail('12', 4)).toBe('XX');
    });
});

describe('document type sniffing', () => {
    it('trusts bytes, not names', () => {
        expect(sniffContentType(Buffer.from('%PDF-1.7\n'))).toBe('application/pdf');
        expect(sniffContentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0]))).toBe('image/png');
        expect(sniffContentType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
        expect(sniffContentType(Buffer.from('MZ\x90\x00'))).toBeNull();
        expect(sniffContentType(Buffer.from('<svg onload=alert(1)>'))).toBeNull();
    });

    it('strips paths and control characters from the uploader\'s file name', () => {
        expect(cleanFileName(encodeURIComponent('..\\..\\etc/passwd'))).toBe('passwd');
        expect(cleanFileName('bad<name>\u0000.png')).toBe('badname.png');
        expect(cleanFileName('%E0%A4')).toBe('%E0%A4');
    });
});
