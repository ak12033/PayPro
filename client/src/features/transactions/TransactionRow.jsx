import React from 'react';
import cn from '../../lib/cn';
import { LedgerAmount } from '../../components/ui/Amount';
import { getTransactionIcon } from './transactionIcons';
import { LEDGER_TYPES } from '../../constants/transactions';
import { formatTime } from '../../utils/formatters';

/**
 * One line in the ledger.
 *
 * The single most repeated component in the product, so its information
 * hierarchy matters more than any other. What a person scanning their history
 * is looking for, in order: *who or what*, *how much*, *when*. Everything else
 * — category, invoice id, ledger type — is context they want only once they
 * have found the row.
 *
 * The old row put five competing elements on one line: description, a
 * Debit/Credit pill, the date, the category and a monospaced invoice id, then
 * repeated the direction a second time as an "OUTGOING"/"INCOMING" caption
 * under the amount. Direction was stated three times (pill, colour, caption)
 * and the merchant — the thing you are actually looking for — had no more
 * visual weight than the invoice number.
 *
 * Here: icon and name lead, amount is the only thing right-aligned, and the
 * Debit/Credit pill is gone. The sign on the amount already says it, and
 * `Amount` renders that sign as text rather than colour alone.
 */
const TransactionRow = ({ transaction, onSelect, className }) => {
    const isDebit = transaction.type === LEDGER_TYPES.DEBIT;
    const Icon = getTransactionIcon(transaction.icon);

    return (
        <li>
            <button
                type="button"
                onClick={() => onSelect?.(transaction)}
                className={cn(
                    'flex w-full items-center gap-3 rounded-card px-2 py-3 text-left',
                    'transition-colors duration-[--duration-fast]',
                    'hover:bg-surface-hover active:bg-surface-active',
                    className
                )}
            >
                <span
                    aria-hidden="true"
                    className={cn(
                        'grid h-10 w-10 shrink-0 place-items-center rounded-full',
                        isDebit
                            ? 'bg-surface-sunken text-text-secondary'
                            : 'bg-positive-soft text-positive'
                    )}
                >
                    <Icon size={17} />
                </span>

                <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-text">
                        {transaction.description || 'Transaction'}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-text-muted">
                        {/* Time, not the date: the row already sits under a day
                            heading, so repeating "04 March" on every line is
                            noise that pushes out the category. */}
                        {formatTime(transaction.createdAt)}
                        {transaction.category && transaction.category !== 'General' && (
                            <> · {transaction.category}</>
                        )}
                    </span>
                </span>

                <LedgerAmount
                    type={transaction.type}
                    value={transaction.amount}
                    size="sm"
                    className="shrink-0"
                />
            </button>
        </li>
    );
};

export default React.memo(TransactionRow);
