import React from 'react';
import Badge from '../../../../components/ui/Badge';
import Amount from '../../../../components/ui/Amount';
import { formatDateTime } from '../../../../utils/formatters';
import { DO_NOT_PAY_AGAIN, TOPUP_STATUS_META } from '../agentLabels';
import BlockCard from './BlockCard';

/** A top-up, as the payment record has it. */
const TopUpBlock = ({ block }) => {
    const { fact, doNotPayAgain } = block;
    const status = TOPUP_STATUS_META[fact.status];

    return (
        <BlockCard label="Top-up">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="font-medium text-text">Wallet top-up</p>
                    <p className="mt-0.5 text-xs text-text-muted">{formatDateTime(fact.createdAt)}</p>
                </div>
                <Amount minor={fact.amountMinor} size="sm" />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
                {status && (
                    <Badge tone={status.tone} size="sm" dot>
                        {status.label}
                    </Badge>
                )}
                {fact.paymentIdMasked && (
                    <span className="font-mono text-2xs text-text-muted">Ref {fact.paymentIdMasked}</span>
                )}
            </div>

            {doNotPayAgain && (
                <p role="note" className="mt-2 text-xs font-medium leading-5 text-warning">
                    {DO_NOT_PAY_AGAIN}
                </p>
            )}
        </BlockCard>
    );
};

export default TopUpBlock;
