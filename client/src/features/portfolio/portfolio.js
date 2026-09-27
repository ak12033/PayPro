import { VIZ_SERIES, VIZ_OTHER } from '../../lib/chartTheme';

/**
 * Portfolio tracker vocabulary (plan.md §21, §22). Mirrors `ASSET_TYPES` and
 * `LIABILITY_KINDS` in the server models; `portfolio.test.js` pins both.
 */

/**
 * Asset types in their fixed colour order. Colour follows the *type*, never its
 * rank, so a holding keeps its colour when values reorder the bar. Seven types
 * and six categorical slots: "Other" takes the neutral, which is what that slot
 * is for.
 */
export const ASSET_TYPES = [
    { key: 'mf', label: 'Mutual funds' },
    { key: 'stock', label: 'Stocks' },
    { key: 'etf', label: 'ETFs' },
    { key: 'fd', label: 'Fixed deposits' },
    { key: 'bond', label: 'Bonds' },
    { key: 'gold', label: 'Gold' },
    { key: 'other', label: 'Other' },
];

export const ASSET_LABEL = Object.fromEntries(ASSET_TYPES.map((t) => [t.key, t.label]));

export const assetColor = (key) => {
    const slot = ASSET_TYPES.findIndex((t) => t.key === key);
    return key === 'other' || slot < 0 || slot >= VIZ_SERIES.length ? VIZ_OTHER : VIZ_SERIES[slot];
};

export const LIABILITY_KINDS = [
    { key: 'home_loan', label: 'Home loan' },
    { key: 'vehicle_loan', label: 'Vehicle loan' },
    { key: 'personal_loan', label: 'Personal loan' },
    { key: 'education_loan', label: 'Education loan' },
    { key: 'credit_card', label: 'Credit card' },
    { key: 'other', label: 'Other' },
];

export const LIABILITY_LABEL = Object.fromEntries(LIABILITY_KINDS.map((k) => [k.key, k.label]));

/**
 * The line every portfolio screen carries. These are the holder's own numbers,
 * and a tracker that looked like a brokerage would be misleading (§21).
 */
export const PORTFOLIO_DISCLAIMER =
    'Values you enter yourself. PayPro does not hold, buy or sell investments, does not fetch prices, and none of this is investment advice or a credit score.';
