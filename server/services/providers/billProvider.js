import crypto from 'crypto';
import config from '../../config/env.js';
import { DomainError } from '../../utils/domainError.js';

/**
 * The bill-payment provider adapter (plan.md §19.3, §42.3).
 *
 * Real bill payment needs BBPS participation, directly or through an
 * aggregator (§19.1). That rail is genuinely external and is **not** here. What
 * is here is the seam it would plug into:
 *
 *   searchBillers()                      → [{ id, name, category, customerRefLabel, customerRefPattern }]
 *   fetchBill({ billerId, customerRef }) → { billerId, customerRef, customerName, amountMinor, dueDate, billNumber }
 *   payBill({ billerId, customerRef, amountMinor, idempotencyKey })
 *                                        → { status: 'SUCCESS' | 'FAILED' | 'PENDING', providerRef, failureReason? }
 *   getStatus({ providerRef })           → same shape as payBill
 *
 * Two implementations:
 *
 *   - `UnconfiguredBillProvider` — the default. Every call throws
 *     `BILL_PAYMENTS_UNAVAILABLE` (503). Failure mode: **fail closed**. A
 *     payment the provider cannot confirm must never debit a wallet.
 *   - `DemoBillProvider` — behind `ENABLE_DEMO_BILL_PAYMENTS=true`, which
 *     `validateConfig` refuses in production. A fixed catalogue of made-up
 *     billers and deterministic bills. Paying one **really debits the wallet
 *     and pays nobody**, which is why every screen labels it "Demo" and why it
 *     cannot run live.
 *
 * A real adapter (Setu, Razorpay BBPS, …) would add a timeout, bounded retries
 * on idempotent calls, and a status poll for PENDING — the §42.3 discipline
 * `utils/fastapiClient.js` models. It is a new file here, not a change to
 * `billPaymentService`.
 */

class UnconfiguredBillProvider {
    constructor() {
        this.mode = 'unconfigured';
    }

    #refuse() {
        throw new DomainError(
            'BILL_PAYMENTS_UNAVAILABLE',
            'Paying bills through PayPro is not available yet. Bill reminders still work.',
            503
        );
    }

    async searchBillers() { return this.#refuse(); }

    async fetchBill() { return this.#refuse(); }

    async payBill() { return this.#refuse(); }

    async getStatus() { return this.#refuse(); }
}

const DEMO_BILLERS = [
    { id: 'demo-power', name: 'Demo Power Distribution', category: 'Bills', customerRefLabel: 'Consumer number', customerRefPattern: '^[0-9]{8,12}$' },
    { id: 'demo-broadband', name: 'Demo Fibre Broadband', category: 'Internet', customerRefLabel: 'Account ID', customerRefPattern: '^[A-Z0-9]{6,12}$' },
    { id: 'demo-mobile', name: 'Demo Mobile Postpaid', category: 'Bills', customerRefLabel: 'Mobile number', customerRefPattern: '^[6-9][0-9]{9}$' },
    { id: 'demo-water', name: 'Demo Water Board', category: 'Bills', customerRefLabel: 'Connection ID', customerRefPattern: '^[0-9]{6,10}$' },
    { id: 'demo-gas', name: 'Demo Piped Gas', category: 'Bills', customerRefLabel: 'BP number', customerRefPattern: '^[0-9]{8,10}$' },
];

/** A stable number from a string, so the same account always shows the same demo bill. */
const seeded = (text) => crypto.createHash('sha256').update(text).digest().readUInt32BE(0);

class DemoBillProvider {
    constructor() {
        this.mode = 'demo';
        this.payments = new Map();
    }

    async searchBillers() {
        return DEMO_BILLERS.map((b) => ({ ...b }));
    }

    #biller(billerId) {
        const biller = DEMO_BILLERS.find((b) => b.id === billerId);
        if (!biller) throw new DomainError('UNKNOWN_BILLER', 'Choose a biller from the list', 400);
        return biller;
    }

    async fetchBill({ billerId, customerRef }) {
        const biller = this.#biller(billerId);
        if (!new RegExp(biller.customerRefPattern).test(customerRef ?? '')) {
            throw new DomainError('INVALID_CUSTOMER_REF', `Enter a valid ${biller.customerRefLabel.toLowerCase()}`, 400);
        }
        const seed = seeded(`${billerId}:${customerRef}`);
        // ₹199.00 – ₹4,198.00, in whole rupees, so demo amounts look like bills.
        const amountMinor = (199 + (seed % 4000)) * 100;
        const due = new Date();
        due.setUTCDate(due.getUTCDate() + 3 + (seed % 12));
        return {
            billerId,
            billerName: biller.name,
            category: biller.category,
            customerRef,
            customerName: 'Demo Customer',
            amountMinor,
            dueDate: due.toISOString().slice(0, 10),
            billNumber: `DEMO-${String(seed).slice(0, 8)}`,
        };
    }

    /**
     * Customer references ending in `0000` are declined, so the failure path —
     * money held, then returned — can be exercised on purpose.
     */
    async payBill({ billerId, customerRef, amountMinor }) {
        this.#biller(billerId);
        const providerRef = `DEMO${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
        const result = String(customerRef).endsWith('0000')
            ? { status: 'FAILED', providerRef, failureReason: 'The demo biller declined this payment.' }
            : { status: 'SUCCESS', providerRef };
        this.payments.set(providerRef, { ...result, amountMinor });
        return result;
    }

    async getStatus({ providerRef }) {
        return this.payments.get(providerRef) ?? { status: 'FAILED', providerRef, failureReason: 'Unknown payment' };
    }
}

let instance = null;
let override = null;

export const getBillProvider = () => {
    if (override) return override;
    if (!instance) instance = config.ENABLE_DEMO_BILL_PAYMENTS ? new DemoBillProvider() : new UnconfiguredBillProvider();
    return instance;
};

/** Tests only: swap in a provider (or pass null to restore the configured one). */
export const setBillProviderForTests = (provider) => {
    override = provider;
};

export { DemoBillProvider, UnconfiguredBillProvider, DEMO_BILLERS };
