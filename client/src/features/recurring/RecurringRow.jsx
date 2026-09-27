import React from 'react';
import { X } from 'lucide-react';
import { ListRow } from '../../components/ui/List';
import IconBadge from '../../components/ui/IconBadge';
import Amount from '../../components/ui/Amount';
import Badge from '../../components/ui/Badge';
import { IconButton } from '../../components/ui/Button';
import { getTransactionIcon } from '../transactions/transactionIcons';
import { CADENCE_LABEL, formatNextExpected } from '../../constants/recurring';

/**
 * One detected recurring payment.
 *
 * The copy rule from plan.md §18.3 lives here: this row describes what the
 * *detector noticed*, never what the user is subscribed to. Hence "looks like"
 * framing on the card that contains it, a visible dismiss affordance on every
 * row, and a confidence badge on the ones the detector is least sure about —
 * a heuristic that presents itself as a fact is the failure mode this guards
 * against.
 */
const RecurringRow = ({ item, onDismiss, onOpen }) => {
    const Icon = getTransactionIcon(item.icon);

    return (
        <ListRow
            leading={<IconBadge icon={<Icon size={16} />} tone="neutral" />}
            title={item.displayName}
            subtitle={`${CADENCE_LABEL[item.cadence]} · next ${formatNextExpected(item.nextExpectedAt)}`}
            onClick={onOpen ? () => onOpen(item) : undefined}
            showChevron={false}
            trailing={
                <span className="flex items-center gap-2">
                    <span className="text-right">
                        <Amount minor={item.amountMinor} size="sm" showFraction={false} />
                        {item.amountVariesFlag && (
                            <span className="mt-0.5 block text-2xs text-text-muted">varies</span>
                        )}
                    </span>
                    {onDismiss && (
                        <IconButton
                            label={`Not a recurring payment: ${item.displayName}`}
                            onClick={(e) => { e.stopPropagation(); onDismiss(item); }}
                        >
                            <X size={14} />
                        </IconButton>
                    )}
                </span>
            }
        >
            {/*
             * Only surfaced when the detector is unsure. Showing "92% confident" on
             * a solid detection invites the user to audit arithmetic they have no
             * way to check; showing it on a shaky one is an honest hedge.
             */}
            {item.confidence < 0.7 && (
                <Badge tone="neutral" size="sm" className="mt-1.5">Less certain</Badge>
            )}
        </ListRow>
    );
};

export default RecurringRow;
