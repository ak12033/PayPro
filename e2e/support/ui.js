import { expect } from '@playwright/test';
import { totp } from './totp.js';

/**
 * Sign in through the UI. When the API asks for a second factor, answer it
 * with the authenticator code (or a recovery code) — the page under test is
 * the one a user sees.
 */
export const signIn = async (page, user, { recoveryCode = null } = {}) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    const challenged = page.getByRole('heading', { name: 'Enter your authenticator code' });
    const home = page.waitForURL('**/home');
    const outcome = await Promise.race([
        challenged.waitFor().then(() => 'challenge'),
        home.then(() => 'home'),
    ]);

    if (outcome === 'challenge') {
        if (recoveryCode) {
            await page.getByRole('button', { name: /Use a recovery code/ }).click();
            await page.getByLabel('Recovery code').fill(recoveryCode);
            await page.getByRole('button', { name: 'Verify and sign in' }).click();
        } else {
            // The field submits itself once six digits are in.
            await page.getByLabel('Code from your authenticator app').fill(totp(user.secret));
        }
        await page.waitForURL('**/home');
    }
    await expect(page).toHaveURL(/\/home/);
};
