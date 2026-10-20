import React from 'react';
import Badge from '../../../../components/ui/Badge';
import Amount from '../../../../components/ui/Amount';
import { WITHDRAWAL_STATUS_META } from '../../../../constants/kyc';
import { formatDateTime } from '../../../../utils/formatters';
import BlockCard from './BlockCard';

/** A withdrawal, with the reason staff gave the user and the UTR once paid. */
const WithdrawalBlock = ({ block }) => {
    const { fact } = block;
    const status = WITHDRAWAL_STATUS_META[fact.status];

    return (
        <BlockCard label="Withdrawal">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="font-medium text-text">
                        Withdrawal{fact.bankMasked ? ` to ${fact.bankMasked}` : ''}
                    </p>
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
                {fact.payoutReference && (
                    <span className="font-mono text-2xs text-text-muted">UTR {fact.payoutReference}</span>
                )}
            </div>

            {fact.userVisibleReason && (
                <p className="mt-2 text-xs leading-5 text-text-secondary">{fact.userVisibleReason}</p>
            )}
        </BlockCard>
    );
};

export default WithdrawalBlock;
