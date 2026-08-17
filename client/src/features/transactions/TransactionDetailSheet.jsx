import React from 'react';
import { CircleHelp, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import Sheet from '../../components/ui/Sheet';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { LedgerAmount } from '../../components/ui/Amount';
import { DetailRow } from '../../components/ui/List';
import { getTransactionIcon } from './transactionIcons';
import { LEDGER_TYPES } from '../../constants/transactions';
import { formatDateTime } from '../../utils/formatters';
import cn from '../../lib/cn';

/**
 * The receipt.
 *
 * This did not exist. A transaction row was a dead end: the user could see that
 * ₹1,200 left their account on 4 March and nothing else — no reference number
 * they could quote to support, no way to copy it, no confirmation of who
 * received it.
 *
 * "Can you prove this payment happened?" is a question a finance product must
 * be able to answer, and a row in a list is not an answer. Everything the
 * server already returns about the transaction is surfaced here.
 */
const TransactionDetailSheet = ({ transaction, open, onClose, onExplain }) => {
    if (!transaction) return null;

    const isDebit = transaction.type === LEDGER_TYPES.DEBIT;
    const Icon = getTransactionIcon(transaction.icon);

    const copyReference = async () => {
        try {
            await navigator.clipboard.writeText(transaction.invoiceId);
            toast.success('Reference copied');
        } catch {
            // Clipboard is permission-gated and unavailable over plain HTTP.
            // Failing silently would leave the user tapping a dead button.
            toast.error('Could not copy. Select the reference to copy it manually.');
        }
    };

    return (
        <Sheet open={open} onClose={onClose} title="" size="sm">
            <div className="pb-2 text-center">
                <span
                    aria-hidden="true"
                    className={cn(
                        'mx-auto grid h-14 w-14 place-items-center rounded-full',
                        isDebit
                            ? 'bg-surface-sunken text-text-secondary'
                            : 'bg-positive-soft text-positive'
                    )}
                >
                    <Icon size={24} />
                </span>

                {/* The amount is the headline — it is what the user opened this
                    for — and it is the page's heading for assistive tech too. */}
                <h2 className="sr-only">
                    Transaction detail: {transaction.description}
                </h2>
                <div className="mt-3">
                    <LedgerAmount type={transaction.type} value={transaction.amount} size="display" />
                </div>

                <p className="mt-1.5 text-sm text-text-secondary">
                    {transaction.description || 'Transaction'}
                </p>

                <div className="mt-3 flex justify-center">
                    <Badge tone={isDebit ? 'neutral' : 'positive'} dot>
                        {isDebit ? 'Sent' : 'Received'}
                    </Badge>
                </div>
            </div>

            <dl className="mt-5 divide-y divide-border rounded-card bg-surface-sunken px-4">
                <DetailRow label="Date" value={formatDateTime(transaction.createdAt)} />

                {transaction.category && (
                    <DetailRow label="Category" value={transaction.category} />
                )}

                {transaction.invoiceId && (
                    <DetailRow
                        label="Reference"
                        value={
                            <span className="flex items-center justify-end gap-1.5">
                                {/* Monospaced so a reference can be compared
                                    character by character against an email or a
                                    bank statement — the whole reason it exists. */}
                                <span className="font-mono text-xs">{transaction.invoiceId}</span>
                                <button
                                    type="button"
                                    onClick={copyReference}
                                    aria-label="Copy reference number"
                                    className="rounded p-1 text-text-muted hover:bg-surface-hover hover:text-text"
                                >
                                    <Copy size={13} />
                                </button>
                            </span>
                        }
                    />
                )}

                {transaction.status && (
                    <DetailRow label="Status" value={transaction.status} />
                )}
            </dl>

            {/*
             * AI is offered, never imposed.
             *
             * "Why was this categorised as Shopping?" is a real question with a
             * real answer, but generating an explanation for every row on
             * arrival would spend a Gemini call per transaction to answer a
             * question almost nobody is asking. It runs on request.
             */}
            {onExplain && (
                <Button
                    variant="ai"
                    fullWidth
                    className="mt-4"
                    icon={<CircleHelp size={16} />}
                    onClick={() => onExplain(transaction)}
                >
                    Explain this transaction
                </Button>
            )}

            <p className="mt-4 text-center text-xs text-text-muted">
                Something look wrong? Report it from Account → Security.
            </p>
        </Sheet>
    );
};

export default TransactionDetailSheet;
