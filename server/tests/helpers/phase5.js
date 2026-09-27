import request from 'supertest';
import User from '../../models/User.js';

/**
 * Shared fixtures for the Phase 5 suites (KYC, AML, withdrawals, bill payments,
 * portfolio). Importing this file does not load config — callers still do their
 * dynamic `import('./helpers/app.js')` first, per the config-snapshot gotcha.
 */

export const PASSWORD = 'Str0ngPass99';
export const auth = (token) => ({ Authorization: `Bearer ${token}` });

/** Sign up; optionally make the account staff (with the authenticator staff routes require). */
export const makeAccount = async (app, email, { role, balance } = {}) => {
    const res = await request(app).post('/api/auth/signup').send({ firstName: 'Test', lastName: 'Person', email, password: PASSWORD });
    if (!res.body?.user?._id) throw new Error(`signup failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
    const set = {};
    if (role) Object.assign(set, { role, 'totp.enabled': true });
    if (balance !== undefined) Object.assign(set, { accountBalance: balance, balanceMinor: Math.round(balance * 100) });
    if (Object.keys(set).length) await User.updateOne({ _id: res.body.user._id }, { $set: set });
    return { token: res.body.accessToken, id: res.body.user._id, email };
};

/** A tiny but genuine PNG header followed by filler: enough for the type sniffer. */
export const pngBytes = (size = 256) => Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(size, 7),
]);

export const pdfBytes = () => Buffer.from('%PDF-1.4\n% test document\n%%EOF\n');

export const applicant = (overrides = {}) => ({
    legalName: 'Asha Rani Verma',
    dateOfBirth: '1990-04-12',
    address: { line1: '12 MG Road', city: 'Bengaluru', state: 'Karnataka', postalCode: '560001' },
    pan: 'ABCDE1234F',
    aadhaarLast4: '4321',
    ...overrides,
});

export const uploadKycDocument = (app, token, submissionId, { type = 'pan_card', body = pngBytes(), contentType = 'image/png' } = {}) =>
    request(app)
        .post(`/api/kyc/submissions/${submissionId}/documents?type=${type}`)
        .set(auth(token))
        .set('Content-Type', contentType)
        .set('X-File-Name', encodeURIComponent('my pan card.png'))
        .send(body);

/**
 * Take `user` all the way to VERIFIED through the real endpoints, with `admin`
 * as the reviewer. Returns the submission id.
 */
export const verifyKyc = async (app, user, admin, { tier = 'basic', applicantOverrides = {} } = {}) => {
    const submitted = await request(app).post('/api/kyc/submissions').set(auth(user.token)).send(applicant(applicantOverrides));
    if (submitted.status !== 201) throw new Error(`submit failed: ${submitted.status} ${JSON.stringify(submitted.body)}`);
    const submissionId = submitted.body.submission._id;
    const uploaded = await uploadKycDocument(app, user.token, submissionId);
    if (uploaded.status !== 201) throw new Error(`upload failed: ${uploaded.status} ${JSON.stringify(uploaded.body)}`);
    const claimed = await request(app).post(`/api/admin/kyc/${submissionId}/claim`).set(auth(admin.token));
    if (claimed.status !== 200) throw new Error(`claim failed: ${claimed.status} ${JSON.stringify(claimed.body)}`);
    const decided = await request(app).post(`/api/admin/kyc/${submissionId}/decision`).set(auth(admin.token)).send({
        status: 'VERIFIED', method: 'document_review', reference: 'CASE-1', tier,
        notes: 'PAN card matches name and date of birth', currentPassword: PASSWORD,
    });
    if (decided.status !== 200) throw new Error(`decision failed: ${decided.status} ${JSON.stringify(decided.body)}`);
    return submissionId;
};

/** Let fire-and-forget work (audit writes, AML hooks, screening) land. */
export const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));
