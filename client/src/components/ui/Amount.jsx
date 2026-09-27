import React from 'react';
import cn from '../../lib/cn';
import { CURRENCY_LOCALE, CURRENCY_SYMBOL } from '../../constants/app';
import { LEDGER_TYPES } from '../../constants/transactions';

/**
 * Every rendered sum of money in the product goes through this component.
 *
 * That is a rule, not a suggestion. Amounts were previously formatted inline in
 * at least seven places, and the results disagreed: some rendered the sign,
 * some did not; some used tabular figures, some did not; and the direction of a
 * transaction was communicated *only* by colour, which is invisible to a user
 * with deuteranopia and to anyone reading a printed statement.
 *
 * Three guarantees:
 *
 *   1. Direction is carried by an explicit +/− sign as well as by colour, so
 *      the meaning survives without colour (WCAG 1.4.1).
 *   2. The currency symbol and the fraction are set at a smaller optical size
 *      than the integer part, so the magnitude is what the eye lands on.
 *   3. The screen-reader text is a full sentence — "500 rupees received" —
 *      instead of the literal glyph soup "+₹500", which VoiceOver reads as
 *      "plus rupee five hundred".
 */

const TONES = {
    positive: 'text-positive',
    negative: 'text-negative',
    neutral: 'text-text',
    muted: 'text-text-muted',
};

const SIZES = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-xl',
    xl: 'text-2xl',
    display: 'text-3xl sm:text-4xl',
};

const integerFormat = new Intl.NumberFormat(CURRENCY_LOCALE, { maximumFractionDigits: 0 });

/**
 * Splits a magnitude in integer paise into rupees and paise so the two can be
 * sized differently. Integer division, so the digits are exact — no float
 * value ever passes through a rounding step on its way to the screen.
 */
const splitMinor = (absMinor) => ({
    integer: integerFormat.format(Math.floor(absMinor / 100)),
    fraction: String(absMinor % 100).padStart(2, '0'),
});

/**
 * The amount in paise. `minor` (an integer from the server's `*Minor` fields)
 * wins; `value` in rupees is the fallback for callers that only have rupees,
 * and is rounded to the nearest paisa once, here.
 */
const resolveMinor = (minor, value) => {
    if (Number.isInteger(minor)) return minor;
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

const Amount = ({
    /** Rupees. Prefer `minor` wherever the server supplies it. */
    value,
    /** Integer paise (`amountMinor`, `balanceMinor`, …). Takes precedence over `value`. */
    minor,
    /** 'in' | 'out' | null. Null means "a quantity", e.g. a balance. */
    direction = null,
    size = 'md',
    tone,
    /** Hide the decimals on dense list rows where they add noise, not meaning. */
    showFraction = true,
    className,
}) => {
    const amountMinor = resolveMinor(minor, value);
    const absMinor = Math.abs(amountMinor);
    const { integer, fraction } = splitMinor(absMinor);

    /**
     * A *quantity* below zero keeps its sign.
     *
     * Directional amounts are rendered as a magnitude plus an arrow-like sign,
     * which is why `splitAmount` takes the absolute value. A balance has no
     * direction, and dropping its sign turned an overdrawn −₹400 into "₹400" —
     * telling someone who owes money that they have it (plan.md §4.4). Only a
     * refund can take a balance below zero, but when one does, this is the
     * number they look at first.
     */
    const negativeQuantity = direction === null && amountMinor < 0;

    const sign = direction === 'out' || negativeQuantity ? '−' : direction === 'in' ? '+' : '';
    const resolvedTone =
        tone ??
        (direction === 'out' || negativeQuantity ? 'negative' : direction === 'in' ? 'positive' : 'neutral');

    const spoken = `${negativeQuantity ? 'minus ' : ''}${(absMinor / 100).toLocaleString(CURRENCY_LOCALE)} rupees${
        direction === 'out' ? ' sent' : direction === 'in' ? ' received' : ''
    }`;

    return (
        <span
            className={cn(
                'inline-flex items-baseline font-semibold tabular-nums',
                TONES[resolvedTone],
                SIZES[size],
                className
            )}
        >
            {/* The visual form is hidden from assistive tech and replaced by the
                sentence below, so the punctuation is never read aloud. */}
            <span aria-hidden="true" className="inline-flex items-baseline">
                {sign && <span className="mr-0.5">{sign}</span>}
                <span className="opacity-70">{CURRENCY_SYMBOL}</span>
                <span>{integer}</span>
                {showFraction && (
                    <span className="text-[0.7em] opacity-70">.{fraction}</span>
                )}
            </span>
            <span className="sr-only">{spoken}</span>
        </span>
    );
};

/** Maps the server's Debit/Credit vocabulary onto the visual direction. */
export const LedgerAmount = ({ type, ...rest }) => (
    <Amount direction={type === LEDGER_TYPES.DEBIT ? 'out' : 'in'} {...rest} />
);

export default Amount;
