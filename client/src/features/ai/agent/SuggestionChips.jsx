import React from 'react';
import cn from '../../../lib/cn';

/**
 * Up to three suggested next steps under the latest reply (plan.md §25.4).
 * A tap sends the chip's server-issued id; its label becomes the user's
 * bubble. Older messages' chips are not rendered at all — the server would
 * refuse them once a newer message exists.
 */
const SuggestionChips = ({ suggestions, disabled, onAct }) => {
    if (!suggestions?.length) return null;

    return (
        <div role="group" aria-label="Suggested replies" className="mt-2 flex flex-wrap gap-2">
            {suggestions.slice(0, 3).map((chip) => (
                <button
                    key={chip.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onAct({ type: 'suggestion', id: chip.id }, chip.label)}
                    className={cn(
                        'rounded-pill border border-ai/20 bg-ai-soft px-3 py-1.5 text-xs font-medium text-ai',
                        'transition-[filter] hover:brightness-105 disabled:pointer-events-none disabled:opacity-45'
                    )}
                >
                    {chip.label}
                </button>
            ))}
        </div>
    );
};

export default SuggestionChips;
