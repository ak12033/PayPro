import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import User from '../models/User.js';
import KycSubmission from '../models/KycSubmission.js';
import KycDecision from '../models/KycDecision.js';
import SecureDocument from '../models/SecureDocument.js';
import Notification from '../models/Notification.js';
import AuditLog, { AUDIT } from '../models/AuditLog.js';
import {
    PASSWORD, auth, makeAccount, pngBytes, applicant, uploadKycDocument, verifyKyc, settle,
} from './helpers/phase5.js';

vi.mock('../utils/sendOtp.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../utils/fastapiClient.js', () => ({
    categorizeTransaction: vi.fn().mockResolvedValue({ category: 'Others', icon: 'CircleDollarSign', confidence_score: 0 }),
    checkFraud: vi.fn().mockResolvedValue({ risk_score: 0, risk_level: 'low', reason: 'test' }),
    default: {},
}));
vi.mock('../utils/socket.js', () => ({ emitToUser: vi.fn(), getIO: vi.fn(), initSocket: vi.fn(), default: {} }));

/**
 * Phase 5, internal KYC (plan.md §0.20.2). The exit criterion in §47 is the
 * last describe block: an admin reviews a submission and records VERIFIED with a
 * complete audit trail, and the user's tier and limits follow it.
 */
const { buildTestApp } = await import('./helpers/app.js');

let app;
beforeAll(() => { app = buildTestApp(); });

const submit = (token, body = applicant()) => request(app).post('/api/kyc/submissions').set(auth(token)).send(body);

describe('holder submission', () => {
    it('stores the PAN encrypted and masked, keeps only Aadhaar last 4, and never returns either in clear', async () => {
        const user = await makeAccount(app, 'kyc-submit@example.com');
        const res = await submit(user.token);
        expect(res.status).toBe(201);
        expect(res.body.submission).toMatchObject({
            status: 'PENDING',
            identifiers: { panMasked: 'XXXXX1234X', aadhaarMasked: 'XXXX XXXX 4321' },
            editable: true,
        });
        expect(JSON.stringify(res.body)).not.toContain('ABCDE1234F');
        expect(res.body.tier).toBe('unverified');

        const stored = await KycSubmission.findOne({ userId: user.id }).select('+identifiers.panEncrypted').lean();
        expect(stored.identifiers.panEncrypted).toMatch(/^v1:/);
        expect(stored.identifiers.panEncrypted).not.toContain('ABCDE1234F');
        expect(JSON.stringify(stored)).not.toMatch(/\b\d{12}\b/);
    });

    it.each([
        ['an invalid PAN', { pan: 'ABC123' }, 'INVALID_PAN'],
        ['an under-18 applicant', { dateOfBirth: new Date(Date.now() - 10 * 365 * 864e5).toISOString().slice(0, 10) }, 'UNDERAGE'],
        ['a full Aadhaar number', { aadhaarLast4: '123412341234' }, 'INVALID_AADHAAR'],
        ['a bad PIN code', { address: { line1: 'x', city: 'y', state: 'z', postalCode: '012345' } }, 'INVALID_PIN'],
        ['a non-date DOB', { dateOfBirth: '1990-02-31' }, 'INVALID_DOB'],
    ])('refuses %s', async (_label, overrides, code) => {
        const user = await makeAccount(app, `kyc-bad-${code.toLowerCase()}@example.com`);
        const res = await submit(user.token, applicant(overrides));
        expect(res.status).toBe(400);
        expect(res.body.code).toBe(code);
    });

    it('refuses a second submission while one is pending', async () => {
        const user = await makeAccount(app, 'kyc-twice@example.com');
        await submit(user.token);
        const again = await submit(user.token);
        expect(again.status).toBe(409);
        expect(again.body.code).toBe('SUBMISSION_EXISTS');
    });

    it('accepts PDF/PNG/JPEG by content, refuses anything else, and encrypts what it keeps', async () => {
        const user = await makeAccount(app, 'kyc-docs@example.com');
        const { body } = await submit(user.token);
        const id = body.submission._id;

        const ok = await uploadKycDocument(app, user.token, id);
        expect(ok.status).toBe(201);
        expect(ok.body.document).toMatchObject({ type: 'pan_card', contentType: 'image/png', fileName: 'my pan card.png' });

        // Declared as a PNG, but the bytes are not one.
        const fake = await uploadKycDocument(app, user.token, id, { body: Buffer.from('MZ\x90\x00 not an image at all') });
        expect(fake.status).toBe(415);

        const badType = await uploadKycDocument(app, user.token, id, { type: 'selfie_with_cat' });
        expect(badType.body.code).toBe('INVALID_TYPE');

        const stored = await SecureDocument.findOne({ refId: id }).select('+data').lean();
        expect(Buffer.from(stored.data.buffer).includes(Buffer.from('PNG'))).toBe(false);
    });

    it("cannot touch someone else's submission", async () => {
        const owner = await makeAccount(app, 'kyc-owner@example.com');
        const other = await makeAccount(app, 'kyc-other@example.com');
        const { body } = await submit(owner.token);
        const res = await uploadKycDocument(app, other.token, body.submission._id);
        expect(res.status).toBe(404);
    });
});

describe('review controls', () => {
    const setup = async (prefix) => {
        const user = await makeAccount(app, `${prefix}-user@example.com`);
        const admin = await makeAccount(app, `${prefix}-admin@example.com`, { role: 'admin' });
        const { body } = await submit(user.token);
        const id = body.submission._id;
        await uploadKycDocument(app, user.token, id);
        return { user, admin, id };
    };

    it('only admins reach the queue; risk and support are refused', async () => {
        const risk = await makeAccount(app, 'kyc-risk@example.com', { role: 'risk' });
        const support = await makeAccount(app, 'kyc-support@example.com', { role: 'support' });
        expect((await request(app).get('/api/admin/kyc').set(auth(risk.token))).status).toBe(403);
        expect((await request(app).get('/api/admin/kyc').set(auth(support.token))).status).toBe(403);
    });

    it('refuses a decision on a submission nobody has claimed, and one claimed by someone else', async () => {
        const { admin, id } = await setup('kyc-claim');
        const decide = (token) => request(app).post(`/api/admin/kyc/${id}/decision`).set(auth(token)).send({
            status: 'REJECTED', notes: 'Document is illegible', userVisibleReason: 'The PAN image was unreadable.', currentPassword: PASSWORD,
        });
        expect((await decide(admin.token)).body.code).toBe('NOT_UNDER_REVIEW');

        const second = await makeAccount(app, 'kyc-claim-admin2@example.com', { role: 'admin' });
        await request(app).post(`/api/admin/kyc/${id}/claim`).set(auth(admin.token)).expect(200);
        const stolen = await decide(second.token);
        expect(stolen.status).toBe(409);
        expect(stolen.body.code).toBe('NOT_YOURS');

        const claimedTwice = await request(app).post(`/api/admin/kyc/${id}/claim`).set(auth(second.token));
        expect(claimedTwice.status).toBe(409);
    });

    it('requires re-authentication, a method, a tier, notes and a document for VERIFIED', async () => {
        const { admin, id } = await setup('kyc-verify-rules');
        await request(app).post(`/api/admin/kyc/${id}/claim`).set(auth(admin.token)).expect(200);
        const base = { status: 'VERIFIED', method: 'document_review', tier: 'basic', notes: 'PAN card matches the applicant' };
        const post = (body) => request(app).post(`/api/admin/kyc/${id}/decision`).set(auth(admin.token)).send(body);

        expect((await post(base)).status).toBe(400); // no password
        expect((await post({ ...base, currentPassword: 'wrong-password' })).status).toBe(401);
        expect((await post({ ...base, method: 'vibes', currentPassword: PASSWORD })).body.code).toBe('METHOD_REQUIRED');
        expect((await post({ ...base, tier: 'unverified', currentPassword: PASSWORD })).body.code).toBe('TIER_REQUIRED');
        expect((await post({ ...base, notes: 'ok', currentPassword: PASSWORD })).body.code).toBe('NOTES_REQUIRED');

        await SecureDocument.deleteMany({ refId: id });
        expect((await post({ ...base, currentPassword: PASSWORD })).body.code).toBe('NO_DOCUMENTS');
    });

    it('never lets staff claim or decide their own submission', async () => {
        const admin = await makeAccount(app, 'kyc-self-admin@example.com', { role: 'admin' });
        const { body } = await submit(admin.token);
        const res = await request(app).post(`/api/admin/kyc/${body.submission._id}/claim`).set(auth(admin.token));
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('SELF_REVIEW');
    });

    it('lets two concurrent decisions produce exactly one outcome', async () => {
        const { admin, id } = await setup('kyc-race');
        await request(app).post(`/api/admin/kyc/${id}/claim`).set(auth(admin.token)).expect(200);
        const decide = (status) => request(app).post(`/api/admin/kyc/${id}/decision`).set(auth(admin.token)).send({
            status, method: 'document_review', tier: 'basic', notes: 'Concurrent decision test',
            userVisibleReason: 'Please upload a clearer image.', requestedActions: ['Upload a clearer PAN image'], currentPassword: PASSWORD,
        });
        const results = await Promise.all([decide('VERIFIED'), decide('REQUIRES_ACTION')]);
        expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
        expect(await KycDecision.countDocuments({ submissionId: id })).toBe(1);
    });

    it('shows reviewers the document only through an audited read, and never caches it', async () => {
        const { admin, id } = await setup('kyc-view');
        const detail = await request(app).get(`/api/admin/kyc/${id}`).set(auth(admin.token)).expect(200);
        const [doc] = detail.body.documents;

        const file = await request(app).get(`/api/admin/kyc/${id}/documents/${doc._id}`).set(auth(admin.token))
            .buffer(true).parse((res, cb) => { const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); });
        expect(file.status).toBe(200);
        expect(file.headers['content-type']).toBe('image/png');
        expect(file.headers['cache-control']).toContain('no-store');
        expect(Buffer.compare(file.body, pngBytes())).toBe(0);

        await settle();
        expect(await AuditLog.countDocuments({ action: AUDIT.KYC_DOCUMENT_VIEWED, userId: admin.id })).toBe(1);
    });

    it('keeps staff ids and internal notes out of the customer view', async () => {
        const { user, admin, id } = await setup('kyc-hide');
        await request(app).post(`/api/admin/kyc/${id}/claim`).set(auth(admin.token)).expect(200);
        await request(app).post(`/api/admin/kyc/${id}/decision`).set(auth(admin.token)).send({
            status: 'REQUIRES_ACTION', notes: 'INTERNAL: suspect photo edit', userVisibleReason: 'Your PAN photo is blurred.',
            requestedActions: ['Upload a sharper photo of your PAN card'], currentPassword: PASSWORD,
        }).expect(200);

        const mine = await request(app).get('/api/kyc/me').set(auth(user.token)).expect(200);
        const text = JSON.stringify(mine.body);
        expect(text).not.toContain(admin.id);
        expect(text).not.toContain('INTERNAL');
        expect(mine.body.submission).toMatchObject({
            status: 'REQUIRES_ACTION',
            userVisibleReason: 'Your PAN photo is blurred.',
            requestedActions: ['Upload a sharper photo of your PAN card'],
        });
    });
});

describe('the workflow end to end', () => {
    it('REQUIRES_ACTION → resubmit → PENDING, and REJECTED → new submission → PENDING', async () => {
        const user = await makeAccount(app, 'kyc-loop@example.com');
        const admin = await makeAccount(app, 'kyc-loop-admin@example.com', { role: 'admin' });
        const id = (await submit(user.token)).body.submission._id;
        await uploadKycDocument(app, user.token, id);

        await request(app).post(`/api/admin/kyc/${id}/claim`).set(auth(admin.token)).expect(200);
        await request(app).post(`/api/admin/kyc/${id}/decision`).set(auth(admin.token)).send({
            status: 'REQUIRES_ACTION', notes: 'Address proof is missing', userVisibleReason: 'We need proof of address.',
            requestedActions: ['Upload a utility bill'], currentPassword: PASSWORD,
        }).expect(200);

        const resubmitted = await request(app).post(`/api/kyc/submissions/${id}/resubmit`).set(auth(user.token)).send(applicant());
        expect(resubmitted.status).toBe(200);
        expect(resubmitted.body.submission).toMatchObject({ status: 'PENDING', submissionCount: 2, requestedActions: [] });

        await request(app).post(`/api/admin/kyc/${id}/claim`).set(auth(admin.token)).expect(200);
        await request(app).post(`/api/admin/kyc/${id}/decision`).set(auth(admin.token)).send({
            status: 'REJECTED', notes: 'The document belongs to someone else', userVisibleReason: 'The documents do not match your details.', currentPassword: PASSWORD,
        }).expect(200);

        const fresh = await submit(user.token);
        expect(fresh.status).toBe(201);
        expect(fresh.body.submission).toMatchObject({ status: 'PENDING', submissionCount: 3 });

        const history = (await KycSubmission.findById(id).lean()).statusHistory.map((h) => h.to);
        expect(history).toEqual(['PENDING', 'UNDER_REVIEW', 'REQUIRES_ACTION', 'PENDING', 'UNDER_REVIEW', 'REJECTED', 'PENDING']);
        expect(await KycDecision.countDocuments({ submissionId: id })).toBe(2);
    });

    it('a watchlist alert that is still open blocks VERIFIED until someone closes it', async () => {
        const user = await makeAccount(app, 'kyc-screen@example.com');
        const admin = await makeAccount(app, 'kyc-screen-admin@example.com', { role: 'admin' });
        await request(app).post('/api/admin/aml/watchlists?name=Test%20List&source=Test%20authority')
            .set(auth(admin.token)).set('Content-Type', 'text/csv')
            .send('name,date_of_birth,reference\n"VERMA, Asha Rani",1990-04-12,T-1\n').expect(201);

        const id = (await submit(user.token)).body.submission._id;
        await uploadKycDocument(app, user.token, id);
        await settle(150);

        const detail = await request(app).get(`/api/admin/kyc/${id}`).set(auth(admin.token)).expect(200);
        expect(detail.body.submission.screening.possibleMatches).toBe(1);
        expect(detail.body.amlAlerts[0]).toMatchObject({ rule: 'WATCHLIST_MATCH', severity: 'high', status: 'open' });

        await request(app).post(`/api/admin/kyc/${id}/claim`).set(auth(admin.token)).expect(200);
        const blocked = await request(app).post(`/api/admin/kyc/${id}/decision`).set(auth(admin.token)).send({
            status: 'VERIFIED', method: 'document_review', tier: 'basic', notes: 'Documents look fine', currentPassword: PASSWORD,
        });
        expect(blocked.body.code).toBe('SCREENING_OPEN');

        await request(app).post(`/api/admin/aml/alerts/${detail.body.amlAlerts[0]._id}/close`).set(auth(admin.token))
            .send({ disposition: 'false_positive', notes: 'Different person: listed DOB matches but PAN holder is a teacher in Pune' }).expect(200);

        await request(app).post(`/api/admin/kyc/${id}/decision`).set(auth(admin.token)).send({
            status: 'VERIFIED', method: 'document_review', tier: 'basic', notes: 'Documents look fine', currentPassword: PASSWORD,
        }).expect(200);
    });

    it('KycDecision is append-only', async () => {
        const user = await makeAccount(app, 'kyc-append@example.com');
        const admin = await makeAccount(app, 'kyc-append-admin@example.com', { role: 'admin' });
        await verifyKyc(app, user, admin);
        await expect(KycDecision.updateOne({ userId: user.id }, { $set: { notes: 'rewritten' } })).rejects.toThrow(/append-only/);
        await expect(KycDecision.deleteMany({ userId: user.id })).rejects.toThrow(/append-only/);
    });
});

describe('exit criterion (plan.md §47 Phase 5): VERIFIED with a complete audit trail, and tier and limits follow it', () => {
    it('raises the tier, records who/when/how/why/before/after, notifies the holder, and lets the higher limit through', async () => {
        const user = await makeAccount(app, 'kyc-exit@example.com', { balance: 50000 });
        const recipient = await makeAccount(app, 'kyc-exit-recipient@example.com');
        const admin = await makeAccount(app, 'kyc-exit-admin@example.com', { role: 'admin' });

        // Before: ₹15,000 is over the unverified per-transaction limit (₹10,000).
        const before = await request(app).post('/api/transactions/transfer').set(auth(user.token)).send({ recipientId: recipient.id, amount: 15000 });
        expect(before.status).toBe(400);
        expect(before.body.message).toMatch(/per-transaction limit/);

        const submissionId = await verifyKyc(app, user, admin, { tier: 'basic' });
        await settle();

        // The tier, on the user and in the holder's own view with its limits.
        expect((await User.findById(user.id).lean()).kycTier).toBe('basic');
        const mine = await request(app).get('/api/kyc/me').set(auth(user.token)).expect(200);
        expect(mine.body).toMatchObject({ tier: 'basic', submission: { status: 'VERIFIED', grantedTier: 'basic' } });
        expect(mine.body.limits.perTxn).toBe(100000);

        // The append-only decision: who, when, how, reference, why, status and tier before/after.
        const [decision] = await KycDecision.find({ submissionId }).lean();
        expect(decision).toMatchObject({
            previousStatus: 'UNDER_REVIEW', newStatus: 'VERIFIED', method: 'document_review', reference: 'CASE-1',
            notes: 'PAN card matches name and date of birth', tierBefore: 'unverified', tierAfter: 'basic',
        });
        expect(String(decision.actorId)).toBe(admin.id);
        expect(decision.at).toBeInstanceOf(Date);

        // The general audit trail has every step, with no identifiers in it.
        const trail = await AuditLog.find({ 'target.id': submissionId }).sort({ createdAt: 1 }).lean();
        expect(trail.map((e) => e.action)).toEqual(expect.arrayContaining([
            AUDIT.KYC_SUBMITTED, AUDIT.KYC_DOCUMENT_UPLOADED, AUDIT.KYC_REVIEW_STARTED, AUDIT.KYC_VERIFIED,
        ]));
        expect(JSON.stringify(trail)).not.toContain('ABCDE1234F');
        expect(trail.find((e) => e.action === AUDIT.KYC_VERIFIED).metadata).toMatchObject({ tierBefore: 'unverified', tierAfter: 'basic' });

        // Told in a category they cannot mute.
        const note = await Notification.findOne({ userId: user.id, type: 'Account' }).lean();
        expect(note.title).toBe('Your identity is verified');

        // After: the same ₹15,000 goes through.
        const after = await request(app).post('/api/transactions/transfer').set(auth(user.token)).send({ recipientId: recipient.id, amount: 15000 });
        expect(after.status).toBe(200);
    });

    it('revoking VERIFIED returns the tier to unverified in the same write', async () => {
        const user = await makeAccount(app, 'kyc-revoke@example.com');
        const admin = await makeAccount(app, 'kyc-revoke-admin@example.com', { role: 'admin' });
        const id = await verifyKyc(app, user, admin, { tier: 'full' });
        expect((await User.findById(user.id).lean()).kycTier).toBe('full');

        const res = await request(app).post(`/api/admin/kyc/${id}/revoke`).set(auth(admin.token)).send({
            notes: 'PAN reported as forged by the issuing office', userVisibleReason: 'We need to verify your identity again.',
            requestedActions: ['Upload your PAN card again'], currentPassword: PASSWORD,
        });
        expect(res.status).toBe(200);
        expect((await User.findById(user.id).lean()).kycTier).toBe('unverified');
        const decisions = await KycDecision.find({ submissionId: id }).sort({ at: 1 }).lean();
        expect(decisions.map((d) => [d.newStatus, d.tierAfter])).toEqual([['VERIFIED', 'full'], ['REQUIRES_ACTION', 'unverified']]);
    });
});
