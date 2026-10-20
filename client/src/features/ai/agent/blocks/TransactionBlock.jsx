import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import Badge from '../../../../components/ui/Badge';
import { LedgerAmount } from '../../../../components/ui/Amount';
import TransactionDetailSheet from '../../../transactions/TransactionDetailSheet';
import { statusMeta } from '../../../transactions/transactionStatus';
import { formatDateTime } from '../../../../utils/formatters';
import BlockCard from './BlockCard';

/** A `TxFact` in the shape `TransactionDetailSheet` reads. */
const asTransaction = (fact) => ({
    _id: fact.id,
    invoiceId: fact.invoiceId,
    status: fact.status,
    type: fact.type,
    amountMinor: fact.amountMinor,
    createdAt: fact.createdAt,
    category: fact.category,
    description: fact.counterpartyName,
});

/** One verified transaction; tapping it opens the same detail sheet Activity uses. */
const TransactionBlock = ({ block }) => {
    const { fact } = block;
    const [open, setOpen] = useState(false);
    const status = statusMeta(fact.status);
    const title = fact.counterpartyName || fact.category || 'Transaction';

    return (
        <BlockCard label="Transaction" padding="none">
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="flex w-full items-center gap-3 rounded-card px-3 py-2.5 text-left hover:bg-surface-hover"
                aria-label={`Open transaction: ${title}`}
            >
                <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-text">{title}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
                        {formatDateTime(fact.createdAt)}
                        {status && (
                            <Badge tone={status.tone} size="sm" dot>
                                {status.label}
                            </Badge>
                        )}
                    </span>
                    {fact.failureReason && (
                        <span className="mt-1 block text-xs text-text-secondary">{fact.failureReason}</span>
                    )}
                </span>
                <LedgerAmount type={fact.type} minor={fact.amountMinor} size="sm" />
                <ChevronRight size={15} className="shrink-0 text-text-muted" aria-hidden="true" />
            </button>

            {open && (
                <TransactionDetailSheet
                    transaction={asTransaction(fact)}
                    open={open}
                    onClose={() => setOpen(false)}
                />
            )}
        </BlockCard>
    );
};

export default TransactionBlock;
