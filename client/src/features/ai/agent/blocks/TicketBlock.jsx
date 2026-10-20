import React from 'react';
import toast from 'react-hot-toast';
import { Copy } from 'lucide-react';
import Badge from '../../../../components/ui/Badge';
import Button from '../../../../components/ui/Button';
import {
    TICKET_CATEGORY_LABEL,
    TICKET_STATUS_LABEL,
    TICKET_STATUS_TONE,
} from '../../../../constants/support';
import { allowedRoute } from '../agentRoutes';
import BlockCard from './BlockCard';

/** A support ticket: its number (copyable), status, and a way to open it. */
const TicketBlock = ({ block, onNavigate }) => {
    const { fact } = block;
    const route = allowedRoute(block.link);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(fact.ticketNumber);
            toast.success('Ticket number copied');
        } catch {
            toast.error("Couldn't copy the ticket number");
        }
    };

    return (
        <BlockCard label={`Support ticket ${fact.ticketNumber}`}>
            <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1 font-mono font-medium text-text">
                    {fact.ticketNumber}
                    <button
                        type="button"
                        onClick={copy}
                        aria-label="Copy ticket number"
                        className="rounded p-1 text-text-muted hover:bg-surface-hover hover:text-text"
                    >
                        <Copy size={13} />
                    </button>
                </span>
                <Badge tone={TICKET_STATUS_TONE[fact.status]} size="sm" dot>
                    {TICKET_STATUS_LABEL[fact.status] ?? fact.status}
                </Badge>
            </div>
            <p className="mt-1 text-xs text-text-muted">
                {TICKET_CATEGORY_LABEL[fact.category] ?? fact.category}
            </p>
            {route && (
                <Button variant="secondary" size="sm" className="mt-2" onClick={() => onNavigate(route)}>
                    Open ticket
                </Button>
            )}
        </BlockCard>
    );
};

export default TicketBlock;
