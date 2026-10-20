import React from 'react';
import Badge from '../../../../components/ui/Badge';
import Amount from '../../../../components/ui/Amount';
import { formatDateTime } from '../../../../utils/formatters';
import { HELD_BLOCKED_META, HELD_STATUS_META } from '../agentLabels';
import BlockCard from './BlockCard';

/**
 * A transfer held for review. Only what the user may see: no rule codes, no
 * score — the server's projection carries none, and this card adds none.
 */
const HeldTransferBlock = ({ block }) => {
    const { fact } = block;
    const status = fact.action === 'block' ? HELD_BLOCKED_META : HELD_STATUS_META[fact.status];
    const firstName = fact.counterpartyName?.split(' ')[0];

    return (
        <BlockCard label="Held transfer">
            <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 font-medium text-text">
                    Transfer{firstName ? ` to ${firstName}` : ''}
                </p>
                <Amount minor={fact.amountMinor} size="sm" />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
                {status && (
                    <Badge tone={status.tone} size="sm" dot>
                        {status.label}
                    </Badge>
                )}
                {fact.status === 'open' && fact.autoReleaseAt && (
                    <span className="text-2xs text-text-muted">
                        Released by {formatDateTime(fact.autoReleaseAt)} if not reviewed sooner
                    </span>
                )}
            </div>
        </BlockCard>
    );
};

export default HeldTransferBlock;
