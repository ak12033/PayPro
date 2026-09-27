import { test, expect } from '@playwright/test';
import { seedUser, balanceMinorOf } from '../support/seed.js';
import { collection, closeDb, oid } from '../support/db.js';
import { signIn } from '../support/ui.js';

test.afterAll(closeDb);

/**
 * plan.md §43.6 flow 7: "Admin → reconciliation report → repair a drifted
 * account → audit entry". The admin signs in with the authenticator app, which
 * every staff sign-in requires (§28.3 rule 5).
 */
test('an admin repairs a drifted balance from the reconciliation report', async ({ page }) => {
    const admin = await seedUser({ firstName: 'Admin', withAuthenticator: true, role: 'admin' });
    // A stored balance with no ledger rows behind it: ₹123.45 of drift.
    const drifted = await seedUser({ firstName: 'Drift', balanceMinor: 12_345 });

    await signIn(page, admin);

    await page.goto('/admin/reconciliation');
    await expect(page.getByRole('status').getByText('Discrepancies found')).toBeVisible();
    await page.getByRole('row').filter({ hasText: drifted.email })
        .getByRole('button', { name: 'Open' }).click();

    await expect(page.getByRole('heading', { name: 'Correct this balance?' })).toBeVisible();
    await page.getByLabel('Reason').fill('E2E: balance had no ledger rows behind it');
    await page.getByRole('button', { name: 'Correct balance' }).click();
    await expect(page.getByText(/Balance corrected from/)).toBeVisible();

    expect(await balanceMinorOf(drifted.email)).toBe(0);
    const audit = await (await collection('auditlogs')).findOne({
        action: 'admin.reconciliation_repair',
        userId: oid(admin.id),
    });
    expect(audit).toBeTruthy();
});
