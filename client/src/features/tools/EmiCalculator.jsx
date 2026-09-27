import React, { useMemo, useState } from 'react';
import { Calculator } from 'lucide-react';
import Card, { CardHeader } from '../../components/ui/Card';
import Field, { AmountInput, Input } from '../../components/ui/Field';
import Amount from '../../components/ui/Amount';
import { DetailRow } from '../../components/ui/List';

/**
 * EMI calculator (plan.md §22).
 *
 * "Pure arithmetic, no data, no regulation" — which is exactly why it is the
 * only credit-adjacent thing in this product. It reads nothing about the user,
 * sends nothing to the server, and stores nothing. There is no eligibility
 * check, no offer, no rate PayPro suggests, and no path from this screen to
 * borrowing anything: all of that is lending, which needs an NBFC licence this
 * product does not have.
 *
 * The standard amortised-loan formula:
 *
 *     EMI = P · r · (1+r)^n / ((1+r)^n − 1)
 *
 * where `r` is the *monthly* rate (annual ÷ 12 ÷ 100) and `n` the number of
 * months. The zero-rate case is special-cased because that formula divides by
 * zero there, and 0% is a real input a user will try.
 */
export const calculateEmi = ({ principal, annualRatePct, months }) => {
    const p = Number(principal);
    const n = Math.round(Number(months));
    const annual = Number(annualRatePct);

    if (!Number.isFinite(p) || p <= 0) return null;
    if (!Number.isFinite(n) || n <= 0) return null;
    if (!Number.isFinite(annual) || annual < 0) return null;

    // An interest-free loan is just the principal split evenly.
    if (annual === 0) {
        const emi = p / n;
        return { emi, total: p, interest: 0, months: n };
    }

    const r = annual / 12 / 100;
    const growth = (1 + r) ** n;
    const emi = (p * r * growth) / (growth - 1);
    const total = emi * n;

    return { emi, total, interest: total - p, months: n };
};

const EmiCalculator = () => {
    const [principal, setPrincipal] = useState('500000');
    const [rate, setRate] = useState('9.5');
    const [months, setMonths] = useState('60');

    const result = useMemo(
        () => calculateEmi({ principal, annualRatePct: rate, months }),
        [principal, rate, months]
    );

    return (
        <Card>
            <CardHeader
                title="EMI calculator"
                description="Work out the monthly repayment on a loan. Nothing here is an offer, and nothing is sent anywhere."
            />

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <Field label="Loan amount">
                    {(props) => <AmountInput {...props} value={principal} onChange={setPrincipal} />}
                </Field>

                <Field label="Interest rate" hint="Per year, %">
                    {(props) => (
                        <Input
                            {...props}
                            inputMode="decimal"
                            value={rate}
                            onChange={(e) => {
                                const next = e.target.value;
                                if (next === '' || /^\d*\.?\d{0,2}$/.test(next)) setRate(next);
                            }}
                            suffix="%"
                        />
                    )}
                </Field>

                <Field label="Term" hint="In months">
                    {(props) => (
                        <Input
                            {...props}
                            inputMode="numeric"
                            value={months}
                            onChange={(e) => {
                                const next = e.target.value;
                                if (next === '' || /^\d{0,3}$/.test(next)) setMonths(next);
                            }}
                        />
                    )}
                </Field>
            </div>

            {result ? (
                <div className="mt-5 rounded-control bg-surface-sunken p-4">
                    <p className="text-sm text-text-muted">Monthly payment</p>
                    <Amount value={result.emi} size="xl" className="mt-1 block" />

                    <dl className="mt-4 divide-y divide-border border-t border-border">
                        <DetailRow label="Total interest" value={<Amount value={result.interest} size="sm" />} />
                        <DetailRow label="Total repaid" value={<Amount value={result.total} size="sm" />} />
                        <DetailRow label="Over" value={`${result.months} months`} />
                    </dl>
                </div>
            ) : (
                <p className="mt-5 flex items-center gap-2 rounded-control bg-surface-sunken p-4 text-sm text-text-muted">
                    <Calculator size={16} aria-hidden="true" />
                    Enter an amount, a rate and a term to see the monthly payment.
                </p>
            )}

            <p className="mt-3 text-xs leading-5 text-text-muted">
                An estimate on the standard reducing-balance formula. A real lender's figure will
                differ — processing fees, insurance and the exact day your payments fall all change it.
                PayPro does not lend money or arrange loans.
            </p>
        </Card>
    );
};

export default EmiCalculator;
