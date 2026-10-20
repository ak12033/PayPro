import React, { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import Button from '../../../../components/ui/Button';
import Amount from '../../../../components/ui/Amount';
import Spinner from '../../../../components/ui/Spinner';
import { formatCurrency, formatTime } from '../../../../utils/formatters';
import BlockCard from './BlockCard';

/**
 * The button's accessible name says what it does and how much
 * ("Confirm: Cancel withdrawal, ₹2,000.00"), so a screen reader user never
 * confirms a card they have only heard as "Confirm" (plan.md §25.5).
 */
const confirmAccessibleLabel = (verb, block) => {
    const money = block.lines?.find((line) => Number.isInteger(line.amountMinor));
    return `${verb}: ${block.title}${money ? `, ${formatCurrency(money.amountMinor / 100)}` : ''}`;
};

/**
 * A proposal waiting for the user (plan.md §20).
 *
 * It can be confirmed only while it is live: the latest message, carrying the
 * one-time nonce from the live reply (a card re-rendered from history has
 * none), and not already settled. Expiry is the server's call — confirming
 * an expired card gets a fresh one back, so the client does not race a clock.
 */
const ConfirmBlock = ({
    block,
    interactive,
    executing = false,
    busy = false,
    autoFocus = false,
    confirmLabel = 'Confirm',
    onConfirm,
    onCancel,
}) => {
    const ref = useRef(null);
    const live = interactive && Boolean(block.nonce);

    // Focus moves to a new card so keyboard and screen reader users land on
    // the decision, not on the input below it (plan.md §25.5).
    useEffect(() => {
        if (autoFocus && live) ref.current?.focus();
    }, [autoFocus, live]);

    return (
        <BlockCard ref={ref} tabIndex={-1} label={block.title} variant="raised" className="outline-none">
            <p className="font-semibold text-text">{block.title}</p>

            <dl className="mt-1 divide-y divide-border">
                {block.lines.map((line) => (
                    <div key={line.label} className="flex items-start justify-between gap-4 py-2">
                        <dt className="text-text-muted">{line.label}</dt>
                        <dd className="text-right font-medium text-text">
                            {Number.isInteger(line.amountMinor) ? (
                                <Amount minor={line.amountMinor} size="sm" />
                            ) : (
                                line.value
                            )}
                        </dd>
                    </div>
                ))}
            </dl>

            {block.irreversible && (
                <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-negative">
                    <AlertTriangle size={14} className="mt-px shrink-0" aria-hidden="true" />
                    This can&apos;t be undone.
                </p>
            )}

            {live ? (
                <>
                    <div className="mt-3 flex gap-2">
                        <Button
                            variant={block.danger ? 'danger' : 'ai'}
                            size="sm"
                            className="flex-1"
                            disabled={busy || executing}
                            aria-busy={executing || undefined}
                            aria-label={executing ? undefined : confirmAccessibleLabel(confirmLabel, block)}
                            onClick={() => onConfirm(block.proposalId, block.nonce)}
                        >
                            {executing ? (
                                <>
                                    <Spinner size="sm" tone="current" />
                                    Working…
                                </>
                            ) : (
                                confirmLabel
                            )}
                        </Button>
                        <Button
                            variant="secondary"
                            size="sm"
                            className="flex-1"
                            disabled={busy || executing}
                            onClick={() => onCancel(block.proposalId)}
                        >
                            Cancel
                        </Button>
                    </div>
                    <p className="mt-2 text-2xs text-text-muted">
                        Expires at {formatTime(block.expiresAt)}
                    </p>
                </>
            ) : (
                <p className="mt-2 text-2xs text-text-muted">
                    No longer active. Ask again if you still want to do this.
                </p>
            )}
        </BlockCard>
    );
};

export default ConfirmBlock;
