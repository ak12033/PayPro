import { request } from '@playwright/test';
import { API_URL } from '../stack/ports.js';
import { totp } from './totp.js';
import { collection, findUser, updateUser, oid } from './db.js';

export const PASSWORD = 'E2e-Str0ng-Pass!';

let counter = 0;
/** Unique per run, so a reused stack (`reuseExistingServer`) never collides with an earlier run. */
export const uniqueEmail = (prefix) => `${prefix}.${Date.now().toString(36)}${(counter += 1)}@e2e.test`;

/**
 * Create a customer through the public API, optionally with an authenticator
 * app enrolled the way the Account screen does it (setup → first code), then
 * apply the database-only extras.
 *
 * `balanceMinor` is set on both money columns, as every real write path does
 * during the rupee-column rollback release (plan.md §0.23).
 */
export const seedUser = async ({
    firstName = 'E2E',
    lastName = 'User',
    email = uniqueEmail(firstName.toLowerCase()),
    balanceMinor = 0,
    withAuthenticator = false,
    role = 'user',
    alwaysChallenge = false,
} = {}) => {
    const api = await request.newContext({ baseURL: API_URL });
    const signup = await api.post('/api/auth/signup', { data: { firstName, lastName, email, password: PASSWORD } });
    if (!signup.ok()) throw new Error(`signup failed: ${signup.status()} ${await signup.text()}`);
    const { accessToken, user } = await signup.json();
    const headers = { Authorization: `Bearer ${accessToken}` };

    let secret = null;
    let recoveryCodes = null;
    if (withAuthenticator) {
        const setup = await (await api.post('/api/auth/totp/setup', { headers })).json();
        secret = setup.secret;
        const enable = await api.post('/api/auth/totp/enable', { headers, data: { code: totp(secret) } });
        if (!enable.ok()) throw new Error(`enable failed: ${enable.status()} ${await enable.text()}`);
        recoveryCodes = (await enable.json()).recoveryCodes;
    }
    await api.dispose();

    await updateUser(email, {
        role,
        emailVerified: true,
        balanceMinor,
        accountBalance: balanceMinor / 100,
        'preferences.twoFactorAuth': alwaysChallenge,
        // Setup consumed the current 30s step; a sign-in inside the same step
        // would be refused as a replay. Waiting for the next step is what a
        // real person does without noticing — this is the same thing, faster.
        ...(withAuthenticator ? { 'totp.lastUsedStep': -1 } : {}),
    });

    return { id: user._id, email, firstName, lastName, password: PASSWORD, secret, recoveryCodes };
};

/** Let the next authenticator code through (see seedUser). */
export const allowNextCode = (email) => updateUser(email, { 'totp.lastUsedStep': -1 });

/** Earlier settled transfers between two accounts today — enough to trip the velocity 2FA rule. */
export const seedTransfersToday = async (from, to, count) => {
    const transactions = await collection('transactions');
    const now = new Date();
    await transactions.insertMany(Array.from({ length: count }, (_, i) => ({
        userId: oid(from.id),
        recipientId: oid(to.id),
        description: `Earlier transfer ${i + 1}`,
        amount: 1,
        amountMinor: 100,
        type: 'Debit',
        category: 'Transfer',
        source: 'p2p',
        status: 'SUCCESS',
        settlement: 'settled',
        invoiceId: `E2E${Date.now()}${i}${Math.floor(Math.random() * 1e6)}`,
        createdAt: now,
        updatedAt: now,
    })));
};

export const balanceMinorOf = async (email) => (await findUser(email))?.balanceMinor ?? null;
