import { test, expect } from '@playwright/test';
import { seedUser, balanceMinorOf, PASSWORD } from '../support/seed.js';
import { collection, closeDb, findUser, oid } from '../support/db.js';
import { signIn } from '../support/ui.js';

test.afterAll(closeDb);

/** A real PNG header, which is all the server's type sniffer looks at. */
const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(512, 7)]);

/** Confirm a re-authenticated console action: type the password, press the sheet's own button. */
const reauth = async (page, confirmLabel) => {
    await page.getByLabel('Your password').fill(PASSWORD);
    await page.getByRole('button', { name: confirmLabel, exact: true }).last().click();
};

/**
 * Phase 5 (plan.md §0.20), driven through both UIs.
 *
 * The §47 exit criterion — "an admin can review a submission and record a
 * VERIFIED decision with a complete audit trail; the user's tier and limits
 * follow it" — and then the thing verification unlocks: a withdrawal to a
 * verified bank account, approved and marked paid by an operator, with the
 * ledger hold visible at each step.
 */
test('identity verified by an admin, then a withdrawal approved and paid', async ({ page, browser }) => {
    test.setTimeout(240_000);

    const admin = await seedUser({ firstName: 'Admin', withAuthenticator: true, role: 'admin' });
    const customer = await seedUser({ firstName: 'Asha', lastName: 'Verma', withAuthenticator: true, balanceMinor: 500_000 });
    // Letters only: the server (rightly) refuses digits in a legal name.
    const legalName = `Asha Verma ${Date.now().toString(36).replace(/[0-9]/g, '')}`;

    // ---- the customer submits details and a document
    await signIn(page, customer);
    await page.goto('/account/verification');
    await expect(page.getByText('Not started')).toBeVisible();
    await page.getByLabel('Full legal name').fill(legalName);
    await page.getByLabel('Date of birth').fill('1990-04-12');
    await page.getByLabel('Address line 1').fill('12 MG Road');
    await page.getByLabel('City').fill('Bengaluru');
    await page.getByLabel('State').fill('Karnataka');
    await page.getByLabel('PIN code').fill('560001');
    await page.getByLabel(/^PAN/).fill('ABCDE1234F');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Waiting for review')).toBeVisible();
    await expect(page.getByText('XXXXX1234X')).toBeVisible();

    await page.getByLabel('File').setInputFiles({ name: 'pan.png', mimeType: 'image/png', buffer: png() });
    await page.getByRole('button', { name: 'Upload', exact: true }).click();
    await expect(page.getByText(/pan\.png/)).toBeVisible();

    // ---- an admin reviews it and records VERIFIED
    const adminContext = await browser.newContext();
    const console_ = await adminContext.newPage();
    await signIn(console_, admin);
    await console_.goto('/admin/kyc');
    await console_.getByRole('row').filter({ hasText: legalName }).getByRole('button', { name: 'Open' }).click();
    await expect(console_.getByRole('dialog').getByText('XXXXX1234X')).toBeVisible();
    await console_.getByRole('button', { name: 'View', exact: true }).click();
    await expect(console_.getByRole('img', { name: 'PAN card' })).toBeVisible();

    await console_.getByRole('button', { name: 'Start review' }).click();
    await console_.getByLabel('Internal notes').fill('E2E: PAN card image matches the name and date of birth');
    await console_.getByRole('button', { name: 'Mark as verified' }).click();
    await reauth(console_, 'Record decision');
    await expect(console_.getByText('Decision recorded.')).toBeVisible();

    // The tier follows the decision, and the record says who, how and before/after.
    await expect.poll(async () => (await findUser(customer.email)).kycTier).toBe('basic');
    const decision = await (await collection('kycdecisions')).findOne({ userId: oid(customer.id) });
    expect(decision).toMatchObject({ previousStatus: 'UNDER_REVIEW', newStatus: 'VERIFIED', method: 'document_review', tierBefore: 'unverified', tierAfter: 'basic' });
    expect(String(decision.actorId)).toBe(String(admin.id));
    const audit = await (await collection('auditlogs')).findOne({ action: 'kyc.verified', userId: oid(admin.id) });
    expect(audit.metadata).toMatchObject({ tierBefore: 'unverified', tierAfter: 'basic' });

    await page.reload();
    await expect(page.getByText('Verified', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Basic tier')).toBeVisible();

    // ---- the customer adds a bank account; the admin verifies it
    await page.goto('/money/withdraw');
    await page.getByRole('button', { name: 'Add a bank account' }).click();
    await page.getByLabel(/^Account number/).fill('123456789012');
    await page.getByLabel('Confirm account number').fill('123456789012');
    await page.getByLabel('IFSC').fill('HDFC0001234');
    await page.getByRole('button', { name: 'Add account' }).click();
    await expect(page.getByRole('dialog').getByText('Being checked')).toBeVisible();
    await page.keyboard.press('Escape');

    await console_.goto('/admin/withdrawals');
    await console_.getByRole('tab', { name: 'Bank accounts' }).click();
    await console_.getByRole('row').filter({ hasText: customer.email }).getByRole('button', { name: 'Open' }).click();
    await expect(console_.getByText('Name matches KYC').or(console_.getByText('Name differs from KYC'))).toBeVisible();
    await console_.getByLabel('Notes').fill('E2E: holder name checked against the verified KYC name');
    await console_.getByRole('button', { name: 'Verify account' }).click();
    await reauth(console_, 'Verify');
    await expect(console_.getByText('Account verified.')).toBeVisible();

    // ---- the customer withdraws ₹1,500: held from the balance at once
    await page.reload();
    await page.getByLabel('Amount').fill('1500');
    await page.getByRole('button', { name: 'Review withdrawal' }).click();
    await page.getByRole('button', { name: 'Request withdrawal' }).click();
    await expect(page.getByText('Waiting for review').first()).toBeVisible();
    expect(await balanceMinorOf(customer.email)).toBe(500_000 - 150_000);
    const held = await (await collection('transactions')).findOne({ userId: oid(customer.id), source: 'withdrawal' });
    expect(held).toMatchObject({ status: 'PENDING', settlement: 'settled', amountMinor: 150_000 });

    // ---- the operator approves, sends it, and records the UTR
    await console_.getByRole('tab', { name: 'Payouts' }).click();
    await console_.getByRole('row').filter({ hasText: customer.email }).getByRole('button', { name: 'Open' }).click();
    await console_.getByRole('button', { name: 'Reveal (audited)' }).click();
    await expect(console_.getByRole('dialog').getByText('123456789012')).toBeVisible();
    await console_.getByRole('button', { name: 'Approve and send' }).click();
    await reauth(console_, 'Approve');
    await expect(console_.getByText(/Approved\. Send the transfer/)).toBeVisible();

    await console_.getByLabel('Bank reference (UTR)').fill('E2EUTR123456');
    await console_.getByRole('button', { name: 'Mark paid' }).first().click();
    await reauth(console_, 'Mark paid');
    await expect(console_.getByText('Marked paid.')).toBeVisible();

    const paid = await (await collection('withdrawalrequests')).findOne({ userId: oid(customer.id) });
    expect(paid).toMatchObject({ status: 'paid', payoutReference: 'E2EUTR123456' });
    expect((await (await collection('transactions')).findOne({ _id: held._id })).status).toBe('SUCCESS');
    expect(await balanceMinorOf(customer.email)).toBe(350_000);

    await page.reload();
    await expect(page.getByText(/UTR E2EUTR123456/)).toBeVisible();

    await adminContext.close();
});
