import React from 'react';
import { Check } from 'lucide-react';
import { ListRow } from '../../components/ui/List';
import IconBadge from '../../components/ui/IconBadge';
import Amount from '../../components/ui/Amount';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { getTransactionIcon } from '../transactions/transactionIcons';
import {
    BILL_STATUS_LABEL,
    BILL_STATUS_TONE,
    BILL_FREQUENCY_LABEL,
    formatNextExpected,
} from '../../constants/recurring';

/**
 * One bill reminder.
 *
 * The action reads "Mark paid", never "Pay" (plan.md §19.2). That is the whole
 * distinction the feature rests on: PayPro cannot pay a biller, and a button
 * labelled "Pay" would promise exactly the thing it cannot do. `displayStatus`
 * comes from the server, where overdue is derived from the clock rather than
 * stored, so a lapsed bill reads as overdue without waiting for a cron.
 */
const BillRow = ({ bill, onMarkPaid, onOpen }) => {
    const Icon = getTransactionIcon(bill.icon);
    const status = bill.displayStatus;

    return (
        <ListRow
            leading={
                <IconBadge
                    icon={<Icon size={16} />}
                    tone={status === 'overdue' ? 'warning' : 'neutral'}
                />
            }
            title={bill.billerName}
            subtitle={
                status === 'paid'
                    ? `${BILL_FREQUENCY_LABEL[bill.frequency]} · paid`
                    : `${BILL_FREQUENCY_LABEL[bill.frequency]} · due ${formatNextExpected(bill.dueDate)}`
            }
            onClick={onOpen ? () => onOpen(bill) : undefined}
            showChevron={false}
            trailing={
                bill.amount != null && (
                    <Amount value={bill.amount} size="sm" showFraction={false} />
                )
            }
        >
            <span className="mt-1.5 flex flex-wrap items-center gap-2">
                <Badge tone={BILL_STATUS_TONE[status]} size="sm">
                    {BILL_STATUS_LABEL[status]}
                </Badge>

                {bill.autoDetectedFromRecurringId && (
                    <Badge tone="neutral" size="sm">Spotted automatically</Badge>
                )}

                {status !== 'paid' && onMarkPaid && (
                    <Button
                        variant="ghost"
                        size="sm"
                        icon={<Check size={14} />}
                        onClick={(e) => { e.stopPropagation(); onMarkPaid(bill); }}
                    >
                        Mark paid
                    </Button>
                )}
            </span>
        </ListRow>
    );
};

export default BillRow;
