/**
 * Budget thresholds and copy, shared by the editor, the summary card and the
 * category rows — so the wording here always matches what the server's
 * `budgetService` actually notifies about (plan.md §14.1).
 */
export const CATEGORY_THRESHOLDS = [50, 80, 100, 120];
export const TOTAL_THRESHOLD = 80;

export const BUDGET_STATUS_LABEL = {
    ok: 'On track',
    warning: 'Getting close',
    over: 'Over budget',
};

/** Rupees (a decimal string from AmountInput) -> integer paise, for the API. */
export const toMinorUnits = (rupees) => Math.round(Number(rupees || 0) * 100);

/** Integer paise -> rupees, for display via `Amount`. */
export const toRupees = (minor) => Number(minor || 0) / 100;
