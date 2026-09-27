import { test, expect } from '@playwright/test';
import { seedUser, balanceMinorOf } from '../support/seed.js';
import { closeDb } from '../support/db.js';
import { signIn } from '../support/ui.js';

test.afterAll(closeDb);

/** plan.md §43.6 flow 4: "Create goal → Contribute → progress updates → balance unchanged". */
test('a goal contribution is tracked without moving money out of the wallet', async ({ page }) => {
    const user = await seedUser({ firstName: 'Goal', withAuthenticator: true, balanceMinor: 250_000 });
    await signIn(page, user);

    await page.goto('/insights/goals');
    await page.getByRole('button', { name: /New goal|Create your first goal/ }).first().click();
    await page.getByLabel('Goal name').fill('Emergency fund');
    await page.getByLabel('Target amount').fill('10000');
    const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await page.getByLabel('Target date').fill(nextYear);
    await page.getByRole('button', { name: 'Save goal' }).click();

    await page.getByRole('button', { name: 'Add contribution' }).click();
    await page.getByLabel('Amount').fill('500');
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(page.getByLabel('Emergency fund: 500.00 of 10000.00 rupees')).toBeVisible();
    expect(await balanceMinorOf(user.email)).toBe(250_000);
});
