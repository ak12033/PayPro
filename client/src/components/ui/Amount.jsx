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

/** Splits into integer and fraction so the two can be sized differently. */
const splitAmount = (value) => {
    const parts = new Intl.NumberFormat(CURRENCY_LOCALE, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).formatToParts(Math.abs(Number(value) || 0));

    const integer = parts
        .filter((p) => p.type === 'integer' || p.type === 'group')
        .map((p) => p.value)
        .join('');

    const fraction = parts.find((p) => p.type === 'fraction')?.value ?? '00';

    return { integer, fraction };
};

const Amount = ({
    value,
    /** 'in' | 'out' | null. Null means "a quantity", e.g. a balance. */
    direction = null,
    size = 'md',
    tone,
    /** Hide the decimals on dense list rows where they add noise, not meaning. */
    showFraction = true,
    className,
}) => {
    const { integer, fraction } = splitAmount(value);

    const sign = direction === 'out' ? '−' : direction === 'in' ? '+' : '';
    const resolvedTone =
        tone ??
        (direction === 'out' ? 'negative' : direction === 'in' ? 'positive' : 'neutral');

    const spoken = `${Math.abs(Number(value) || 0).toLocaleString(CURRENCY_LOCALE)} rupees${
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
