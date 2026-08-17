import React from 'react';
import { AlertCircle, RefreshCw, WifiOff } from 'lucide-react';
import Button from '../ui/Button';

/**
 * Inline failure, with a way out.
 *
 * The governing principle: an error screen in a finance product must answer
 * three questions in this order — *is my money safe?*, *what happened?*, *what
 * do I do now?* The old version answered only the second, in red text, with no
 * recovery path.
 *
 * The reassurance line is not decoration. When a request fails mid-flow the
 * user's actual first thought is "did that go through and I just can't see
 * it?", and leaving that unanswered generates the support ticket.
 */
const ErrorState = ({
    title = "That didn't load",
    message,
    /** Set when the failure was the network rather than the server. */
    offline = false,
    /** Renders the "your money is safe" line. Omit only where it would be a lie. */
    reassurance = 'Your balance and transactions are unaffected.',
    onRetry,
    retryLabel = 'Try again',
    action,
}) => (
    <div className="px-6 py-12 text-center" role="alert">
        <div
            aria-hidden="true"
            className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-warning-soft text-warning"
        >
            {offline ? <WifiOff size={22} /> : <AlertCircle size={22} />}
        </div>

        <h3 className="text-base font-semibold text-text">{title}</h3>

        {message && (
            <p className="mx-auto mt-1.5 max-w-sm text-sm leading-6 text-text-muted">{message}</p>
        )}

        {reassurance && (
            <p className="mx-auto mt-3 max-w-sm text-xs text-text-muted">{reassurance}</p>
        )}

        <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
            {onRetry && (
                <Button variant="secondary" size="sm" onClick={onRetry} icon={<RefreshCw size={15} />}>
                    {retryLabel}
                </Button>
            )}
            {action}
        </div>
    </div>
);

export default ErrorState;
