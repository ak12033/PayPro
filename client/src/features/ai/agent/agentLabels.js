/**
 * Status wording the agent's cards use where the client has no constant of
 * its own. Each label matches the server's prose for the same status
 * (`fastapi-server/services/agent/responses/formatting.py`), so the card under a
 * reply never contradicts the sentence above it. `agentBlocks.test.jsx` pins
 * the top-up labels to that file.
 */

/** Payments: mirrors `TOPUP_STATUS_LABEL` (AddMoney.jsx's result copy). */
export const TOPUP_STATUS_META = {
    created: { label: 'Not completed', tone: 'warning' },
    captured: { label: 'Paid', tone: 'positive' },
    failed: { label: 'Failed', tone: 'negative' },
    refunded: { label: 'Refunded', tone: 'neutral' },
};

/**
 * Held transfers. "Released" deliberately does not say "sent": approval
 * releases the hold but doesn't move the money (templates.py `_held`).
 */
export const HELD_STATUS_META = {
    open: { label: 'On hold', tone: 'warning' },
    approved: { label: 'Released', tone: 'info' },
    auto_released: { label: 'Released', tone: 'info' },
    rejected: { label: 'Not approved', tone: 'negative' },
};

export const HELD_BLOCKED_META = { label: 'Not approved', tone: 'negative' };

/** `AddMoney.jsx`'s pending copy, word for word. */
export const DO_NOT_PAY_AGAIN =
    'Your payment went through but we could not confirm it yet. It usually settles within a few minutes — do not pay again.';
