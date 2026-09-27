import { test, expect } from '@playwright/test';
import { totp } from '../support/totp.js';
import { uniqueEmail, PASSWORD, allowNextCode } from '../support/seed.js';
import { findUser, updateUser, closeDb } from '../support/db.js';
import { signIn } from '../support/ui.js';

test.afterAll(closeDb);

/**
 * plan.md §31.2.4 with the recovery policy decided 2026-09-22: a customer
 * turns on an authenticator app from Account, is shown ten recovery codes they
 * cannot dismiss without confirming they saved them, and can later sign in
 * with one of those codes when the phone is gone.
 */
test('a customer turns on an authenticator app, then signs in with a recovery code', async ({ page, browser }) => {
    const email = uniqueEmail('asha');

    // Sign up through the UI: signup trusts this browser and signs straight in.
    await page.goto('/signup');
    // Required fields carry a decorative asterisk in their label, hence the anchored patterns.
    await page.getByLabel(/^First name/).fill('Asha');
    await page.getByLabel(/^Email/).fill(email);
    await page.getByLabel(/^Password/).fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.waitForURL('**/home');

    // Account → Authenticator app → set up.
    await page.goto('/account');
    await page.getByRole('button', { name: /Authenticator app/ }).click();
    await page.getByRole('button', { name: 'Set up authenticator app' }).click();
    await expect(page.getByRole('img', { name: /Authenticator setup code/ })).toBeVisible();

    // "Can't scan?" reveals the key an app would read from the QR code.
    await page.getByText("Can't scan? Enter the key instead").click();
    const key = (await page.locator('details p').innerText()).replace(/\s/g, '');
    expect(key).toMatch(/^[A-Z2-7]{32}$/);
    await page.getByLabel('Then enter the 6-digit code it shows').fill(totp(key));

    // Recovery codes: ten, and "Done" stays disabled until they are saved.
    await expect(page.getByRole('heading', { name: 'Save your recovery codes' })).toBeVisible();
    const codes = await page.getByRole('list', { name: 'Recovery codes' }).getByRole('listitem').allInnerTexts();
    expect(codes).toHaveLength(10);
    const done = page.getByRole('button', { name: 'Done' });
    await expect(done).toBeDisabled();
    await page.getByLabel('I have saved these somewhere other than this phone.').check();
    await done.click();
    await expect(page.getByText('On: codes come from your phone')).toBeVisible();

    expect((await findUser(email)).totp.enabled).toBe(true);

    // Later, on a fresh browser, with the phone lost: a recovery code gets in once.
    await updateUser(email, { 'preferences.twoFactorAuth': true });
    await allowNextCode(email);
    const fresh = await browser.newContext();
    const other = await fresh.newPage();
    await signIn(other, { email, password: PASSWORD, secret: key }, { recoveryCode: codes[0] });
    await expect(other.getByText(/Recovery code used\. 9 left/)).toBeVisible();

    const stored = await findUser(email);
    expect(stored.totp.recoveryCodes.filter((c) => c.usedAt)).toHaveLength(1);
    await fresh.close();
});
