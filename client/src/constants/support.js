/**
 * Support ticket vocabulary (plan.md §27).
 *
 * The status labels are written from the user's side of the conversation:
 * `awaiting_user` renders as "Your reply needed", not "Awaiting user", because
 * a status is only useful if it tells the reader what *they* should do next.
 */
export const TICKET_STATUS_LABEL = {
    open: 'Open',
    awaiting_user: 'Your reply needed',
    in_progress: 'Being looked at',
    resolved: 'Resolved',
    closed: 'Closed',
};

export const TICKET_STATUS_TONE = {
    open: 'info',
    awaiting_user: 'warning',
    in_progress: 'accent',
    resolved: 'positive',
    closed: 'neutral',
};

export const TICKET_CATEGORY_LABEL = {
    transaction: 'Transaction',
    payment: 'Payment',
    account: 'Account',
    security: 'Security',
    fraud: 'Fraud',
    other: 'Other',
};
