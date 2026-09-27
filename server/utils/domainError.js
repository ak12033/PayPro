/**
 * An expected business failure with an HTTP status and a stable `code`.
 *
 * Phase 4's services each grew their own copy of this class (`BillError`,
 * `RiskCaseError`, `TotpError`), and every controller had to catch its own.
 * Phase 5's services throw this one instead, and `errorHandler` answers it the
 * same way it answers a `LedgerError`: the status, the message, and the code the
 * client keys on. It is never a defect, so it is logged at `warn` and never
 * reaches error tracking.
 */
export class DomainError extends Error {
    constructor(code, message, status = 400) {
        super(message);
        this.name = 'DomainError';
        this.code = code;
        this.status = status;
    }
}

export default DomainError;
