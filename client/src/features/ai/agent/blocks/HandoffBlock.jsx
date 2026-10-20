import React from 'react';
import { LifeBuoy } from 'lucide-react';
import { TICKET_CATEGORY_LABEL } from '../../../../constants/support';
import BlockCard from './BlockCard';

/**
 * What a support ticket would say, before the user agrees to raise it
 * (plan.md §24). The [Create ticket] / [Cancel] buttons are the confirm card
 * that follows: the ticket is a proposal like any other write.
 *
 * No note field: the server's v1 ticket body is fixed (`HandoffBlock.
 * noteMaxLength` is reserved), so the user adds detail by replying on the
 * ticket instead.
 */
const HandoffBlock = ({ block }) => (
    <BlockCard label="Support ticket preview">
        <p className="flex items-center gap-1.5 font-medium text-text">
            <LifeBuoy size={15} className="text-text-muted" aria-hidden="true" />
            {block.subject}
        </p>
        <p className="mt-0.5 text-xs text-text-muted">
            {TICKET_CATEGORY_LABEL[block.category] ?? block.category}
        </p>
        {block.summaryPreview && (
            <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-text-secondary hover:text-text">
                    What support will see
                </summary>
                <p className="mt-1.5 whitespace-pre-line leading-5 text-text-secondary">{block.summaryPreview}</p>
            </details>
        )}
    </BlockCard>
);

export default HandoffBlock;
