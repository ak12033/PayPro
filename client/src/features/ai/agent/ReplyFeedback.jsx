import React, { useState } from 'react';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import cn from '../../../lib/cn';
import agentApi from '../../../services/api/endpoints/agentApi';

const RATINGS = [
    { rating: 'up', label: 'Helpful', Icon: ThumbsUp },
    { rating: 'down', label: 'Not helpful', Icon: ThumbsDown },
];

/**
 * Thumbs under an agent reply (plan.md §31.4), stored on the turn's
 * telemetry record. One rating per reply in this session; a failed send
 * just lets the user try again — feedback is never worth an error message.
 */
const ReplyFeedback = ({ messageId }) => {
    const [rated, setRated] = useState(null);
    const [sending, setSending] = useState(false);

    const rate = async (rating) => {
        if (rated || sending) return;
        setSending(true);
        try {
            await agentApi.sendFeedback(messageId, rating);
            setRated(rating);
        } catch {
            // Leave the buttons usable.
        } finally {
            setSending(false);
        }
    };

    return (
        <div role="group" aria-label="Rate this reply" className="mt-1 flex items-center gap-1">
            {RATINGS.map(({ rating, label, Icon }) => (
                <button
                    key={rating}
                    type="button"
                    aria-label={label}
                    aria-pressed={rated === rating}
                    disabled={sending || (rated !== null && rated !== rating)}
                    onClick={() => rate(rating)}
                    className={cn(
                        'grid h-6 w-6 place-items-center rounded-control text-text-muted',
                        'hover:bg-surface-hover hover:text-text disabled:pointer-events-none disabled:opacity-45',
                        rated === rating && 'text-ai'
                    )}
                >
                    <Icon size={13} aria-hidden="true" />
                </button>
            ))}
            {rated && (
                <span role="status" className="text-2xs text-text-muted">
                    Thanks for the feedback
                </span>
            )}
        </div>
    );
};

export default ReplyFeedback;
