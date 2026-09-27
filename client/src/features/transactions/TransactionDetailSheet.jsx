import React, { useState } from 'react';
import { CircleHelp, Copy, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import Sheet from '../../components/ui/Sheet';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { LedgerAmount } from '../../components/ui/Amount';
import { DetailRow } from '../../components/ui/List';
import { Select } from '../../components/ui/Field';
import { getTransactionIcon } from './transactionIcons';
import { statusMeta } from './transactionStatus';
import { LEDGER_TYPES } from '../../constants/transactions';
import { formatDateTime } from '../../utils/formatters';
import { getErrorMessage } from '../../utils/errors';
import cn from '../../lib/cn';
import { amountMinorOf } from '../../lib/money';

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

/**
 * Categories the ledger writes itself, describing *how* money moved rather
 * than what it was for. Mirrors `SYSTEM_CATEGORIES` in
 * `server/constants/categories.js` — kept in sync manually since this is a
 * display-only gate; the server is the actual authority and refuses the
 * PATCH either way.
 */
const SYSTEM_CATEGORIES = ['Transfer', 'Top Up', 'Refund', 'Stripe', 'Adjustment', 'Withdrawal'];

const TransactionDetailSheet = ({ transaction, open, onClose, onExplain, categories = [], onRecategorise }) => {
    const [editingCategory, setEditingCategory] = useState(false);
    const [saving, setSaving] = useState(false);

    if (!transaction) return null;

    const isDebit = transaction.type === LEDGER_TYPES.DEBIT;
    const Icon = getTransactionIcon(transaction.icon);
    const status = statusMeta(transaction.status);
    const canRecategorise = onRecategorise && !SYSTEM_CATEGORIES.includes(transaction.category);

    const saveCategory = async (event) => {
        const next = event.target.value;
        if (!next || next === transaction.category) {
            setEditingCategory(false);
            return;
        }

        setSaving(true);
        try {
            await onRecategorise(transaction, next);
            setEditingCategory(false);
        } catch (caught) {
            toast.error(getErrorMessage(caught, 'Could not update the category.'));
        } finally {
            setSaving(false);
        }
    };

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
                    <LedgerAmount type={transaction.type} minor={amountMinorOf(transaction)} size="display" />
                </div>

                <p className="mt-1.5 text-sm text-text-secondary">
                    {transaction.description || 'Transaction'}
                </p>

                <div className="mt-3 flex justify-center gap-2">
                    <Badge tone={isDebit ? 'neutral' : 'positive'} dot>
                        {isDebit ? 'Sent' : 'Received'}
                    </Badge>
                    {status && <Badge tone={status.tone}>{status.label}</Badge>}
                </div>
            </div>

            <dl className="mt-5 divide-y divide-border rounded-card bg-surface-sunken px-4">
                <DetailRow label="Date" value={formatDateTime(transaction.createdAt)} />

                {transaction.category && (
                    <DetailRow
                        label="Category"
                        value={
                            editingCategory ? (
                                <Select
                                    autoFocus
                                    defaultValue={transaction.category}
                                    disabled={saving}
                                    onBlur={() => setEditingCategory(false)}
                                    onChange={saveCategory}
                                    className="h-8 text-xs"
                                >
                                    {!categories.some((c) => c.name === transaction.category) && (
                                        <option value={transaction.category}>{transaction.category}</option>
                                    )}
                                    {categories.map((c) => (
                                        <option key={c.name} value={c.name}>{c.name}</option>
                                    ))}
                                </Select>
                            ) : (
                                <span className="flex items-center justify-end gap-1.5">
                                    {transaction.category}
                                    {canRecategorise && (
                                        <button
                                            type="button"
                                            onClick={() => setEditingCategory(true)}
                                            aria-label="Change category"
                                            className="rounded p-1 text-text-muted hover:bg-surface-hover hover:text-text"
                                        >
                                            <Pencil size={12} />
                                        </button>
                                    )}
                                </span>
                            )
                        }
                    />
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
