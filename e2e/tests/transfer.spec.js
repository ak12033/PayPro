import { test, expect } from '@playwright/test';
import { totp } from '../support/totp.js';
import { seedUser, seedTransfersToday, allowNextCode, balanceMinorOf } from '../support/seed.js';
import { closeDb } from '../support/db.js';
import { signIn } from '../support/ui.js';

test.afterAll(closeDb);

/**
 * plan.md §43.6 flow 2 — "Send money → 2FA challenge → verify → both ledgers
 * updated" — with the challenge answered by the authenticator app rather than
 * an emailed code, which is the §31.2.4 path and the one a test can read.
 */
test('a challenged transfer is confirmed with the authenticator app and moves exactly that amount', async ({ page }) => {
    const suffix = Date.now().toString(36);
    const alice = await seedUser({ firstName: `Alice${suffix}`, withAuthenticator: true, balanceMinor: 500_000 });
    const bob = await seedUser({ firstName: `Bob${suffix}` });
    // Five transfers to Bob today: the sixth always asks for a second factor.
    await seedTransfersToday(alice, bob, 5);

    await signIn(page, alice);

    await page.goto('/money/send');
    await page.getByLabel('Search for a recipient').fill(bob.firstName);
    await page.getByRole('radio', { name: new RegExp(bob.firstName) }).click();
    await page.getByLabel('Amount').fill('200');
    await page.getByRole('button', { name: 'Review' }).click();
    await page.getByRole('button', { name: /^Send / }).click();

    // No email: the code comes from the app, and nothing offers to resend one.
    await expect(page.getByRole('heading', { name: 'Confirm this transfer' })).toBeVisible();
    await expect(page.getByText('Enter the 6-digit code from your authenticator app.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Resend code|Send a new code/ })).toHaveCount(0);

    // The sign-in used this 30s step's code; a transfer inside it would be a replay.
    await allowNextCode(alice.email);
    await page.getByLabel('Code from your authenticator app').fill(totp(alice.secret));

    await expect(page.getByRole('heading', { name: 'Transfer complete' })).toBeVisible();
    expect(await balanceMinorOf(alice.email)).toBe(480_000);
    expect(await balanceMinorOf(bob.email)).toBe(20_000);
});
