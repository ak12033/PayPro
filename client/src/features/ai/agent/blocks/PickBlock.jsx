import React from 'react';
import Amount from '../../../../components/ui/Amount';
import { formatDateTime } from '../../../../utils/formatters';
import cn from '../../../../lib/cn';

export const NONE_OF_THESE = 'None of these';

/**
 * "Which one?" over the user's own verified records. Each row sends its
 * server-issued id, never the record itself; "None of these" hands off.
 */
const PickBlock = ({ block, interactive, busy = false, onAct }) => {
    const row = cn(
        'flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm',
        'hover:bg-surface-hover disabled:pointer-events-none disabled:opacity-60'
    );

    return (
        <div
            role="group"
            aria-label="Pick one"
            className="mt-2 divide-y divide-border overflow-hidden rounded-card border border-border bg-surface"
        >
            {block.options.map((option) => (
                <button
                    key={option.id}
                    type="button"
                    className={row}
                    disabled={!interactive || busy}
                    onClick={() => onAct({ type: 'pick', id: option.id }, option.label)}
                >
                    <span className="min-w-0">
                        <span className="block truncate font-medium text-text">{option.label}</span>
                        {option.fact?.createdAt && (
                            <span className="text-xs text-text-muted">{formatDateTime(option.fact.createdAt)}</span>
                        )}
                    </span>
                    {Number.isInteger(option.fact?.amountMinor) && (
                        <Amount minor={option.fact.amountMinor} size="sm" />
                    )}
                </button>
            ))}
            <button
                type="button"
                className={cn(row, 'text-text-secondary')}
                disabled={!interactive || busy}
                onClick={() => onAct({ type: 'pick', id: block.noneOfTheseId }, NONE_OF_THESE)}
            >
                {NONE_OF_THESE}
            </button>
        </div>
    );
};

export default PickBlock;
