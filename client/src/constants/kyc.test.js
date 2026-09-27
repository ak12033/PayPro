import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { KYC_STATUS_META, KYC_METHOD_LABEL, KYC_DOCUMENT_LABEL, BANK_DOCUMENT_LABEL, KYC_PRIVACY_NOTE, kycStatusMeta } from './kyc';

/**
 * The client's KYC vocabulary is pinned to `server/constants/kyc.js`: a status
 * the server can send that the client cannot label would render as "Not
 * started" for someone who is in fact verified.
 */
const SERVER = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../server/constants/kyc.js'),
    'utf8'
);
const listFrom = (name) => {
    const [, body] = SERVER.match(new RegExp(`export const ${name} = \\[([^\\]]*)\\]`));
    return body.match(/'([a-z_]+)'/g).map((s) => s.slice(1, -1)).sort();
};

describe('matches server/constants/kyc.js', () => {
    it('labels every status', () => {
        const [, body] = SERVER.match(/export const KYC_STATUS = \{([^}]*)\}/);
        const statuses = body.match(/'([A-Z_]+)'/g).map((s) => s.slice(1, -1)).sort();
        expect(Object.keys(KYC_STATUS_META).sort()).toEqual(statuses);
    });

    it('labels every method and document type', () => {
        expect(Object.keys(KYC_METHOD_LABEL).sort()).toEqual(listFrom('KYC_METHODS'));
        expect(Object.keys(KYC_DOCUMENT_LABEL).sort()).toEqual(listFrom('KYC_DOCUMENT_TYPES'));
        expect(Object.keys(BANK_DOCUMENT_LABEL).sort()).toEqual(listFrom('BANK_DOCUMENT_TYPES'));
    });
});

describe('copy', () => {
    it('an account with no submission is "Not started", not an error', () => {
        expect(kycStatusMeta(undefined).label).toBe('Not started');
    });

    it('the privacy note promises only what the code does', () => {
        expect(KYC_PRIVACY_NOTE).toMatch(/encrypted/);
        expect(KYC_PRIVACY_NOTE).toMatch(/never ask for your full Aadhaar/);
        expect(KYC_PRIVACY_NOTE).toMatch(/AI assistant/);
    });
});
