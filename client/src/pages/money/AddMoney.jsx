import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Lock } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Amount from '../../components/ui/Amount';
import IconBadge from '../../components/ui/IconBadge';
import { AmountInput, Field } from '../../components/ui/Field';
import { DetailRow } from '../../components/ui/List';
import WalletCard from '../../features/wallet/WalletCard';
import VerifyEmailBanner from '../../features/account/VerifyEmailBanner';
import VerifyEmailSheet from '../../features/account/VerifyEmailSheet';
import { useAuth } from '../../context/AuthContext';
import { paymentApi } from '../../services/api/endpoints/paymentApi';
import { getErrorMessage } from '../../utils/errors';
import { formatCurrency, formatCurrencyCompact } from '../../utils/formatters';
import { loadExternalScript } from '../../lib/loadExternalScript';
import { env } from '../../app/config/env';
import { ROUTES } from '../../constants/routes';
import {
    QUICK_TOPUP_AMOUNTS,
    RAZORPAY_CHECKOUT_URL,
    getRazorpayThemeColor,
} from '../../constants/wallet';
import { APP_NAME } from '../../constants/app';
import cn from '../../lib/cn';

/**
 * Add money.
 *
 * The Razorpay integration is deliberately unchanged — order creation,
 * signature verification and the failure handler are all exactly as they were,
 * because that path is correctness-critical and was already correct.
 *
 * What changed is everything around it:
 *
 *   The failure state. `payment.failed` previously produced a toast that
 *   disappeared after four seconds, leaving the user on an unchanged form with
 *   no record of what went wrong and — worse — no answer to the question they
 *   actually have, which is *"was I charged?"*. A failed top-up is the single
 *   most anxiety-producing event in this product, and a vanishing toast is the
 *   wrong medium for it.
 *
 *   The success state. Also a toast. The user's money had moved and the
 *   confirmation was gone before they could read it.
 *
 *   `type="number"` on the amount field, which attached a scroll-wheel handler
 *   — scrolling the page with the cursor over the input silently changed how
 *   much was about to be charged.
 */
const AddMoney = () => {
    const navigate = useNavigate();
    const { userName, balance, balanceMinor, fetchDashboardData } = useAuth();

    const [amount, setAmount] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null); // { status, amount, message }
    const [verifyOpen, setVerifyOpen] = useState(false);

    const numericAmount = Number(amount);
    const isValidAmount = Number.isFinite(numericAmount) && numericAmount > 0;

    // Warm the checkout script while the user is still choosing an amount, so
    // the gateway opens instantly rather than after a cold network fetch at the
    // exact moment they have committed.
    useEffect(() => {
        loadExternalScript(RAZORPAY_CHECKOUT_URL).catch(() => {});
    }, []);

    const startPayment = async () => {
        if (!isValidAmount || loading) return;

        setLoading(true);
        setResult(null);

        try {
            const loaded = await loadExternalScript(RAZORPAY_CHECKOUT_URL);
            if (!loaded || !window.Razorpay) {
                setResult({
                    status: 'error',
                    message:
                        "We couldn't reach the payment provider. Check your connection and try again — you have not been charged.",
                });
                return;
            }

            const { data: order } = await paymentApi.createOrder({ amount: numericAmount });

            if (!order.success) {
                setResult({
                    status: 'error',
                    message: 'We could not start this payment. You have not been charged.',
                });
                return;
            }

            const checkout = new window.Razorpay({
                key: env.razorpayKeyId,
                amount: order.amount,
                currency: order.currency,
                name: APP_NAME,
                description: 'Wallet top-up',
                order_id: order.orderId,

                handler: async (response) => {
                    try {
                        const { data } = await paymentApi.verify({
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                        });

                        if (data.success) {
                            setResult({ status: 'success', amount: numericAmount });
                            setAmount('');
                            fetchDashboardData().catch(() => {});
                        } else {
                            /**
                             * Verification failed *after* a successful charge.
                             *
                             * This is the one case where "try again" is the
                             * wrong advice — the money may well have left the
                             * user's card. The copy says so plainly and points
                             * at the reference, rather than inviting a second
                             * payment.
                             */
                            setResult({
                                status: 'pending',
                                message:
                                    'Your payment went through but we could not confirm it yet. It usually settles within a few minutes — do not pay again.',
                                reference: response.razorpay_payment_id,
                            });
                        }
                    } catch (caught) {
                        setResult({
                            status: 'pending',
                            message: getErrorMessage(
                                caught,
                                'Your payment went through but we could not confirm it yet. Do not pay again.'
                            ),
                            reference: response.razorpay_payment_id,
                        });
                    }
                },

                modal: {
                    // Dismissing the gateway is a normal thing to do and must
                    // not leave the button spinning forever, which is what the
                    // old flow did — `setLoading(false)` only ran in the
                    // `finally` of the *open* call, not on dismissal.
                    ondismiss: () => setLoading(false),
                },

                theme: { color: getRazorpayThemeColor() },
            });

            checkout.on('payment.failed', (response) => {
                setResult({
                    status: 'error',
                    message:
                        response?.error?.description ??
                        'The payment was declined. You have not been charged.',
                    reference: response?.error?.metadata?.payment_id,
                });
                setLoading(false);
            });

            checkout.open();
        } catch (caught) {
            // Refused before an order was created, so there is nothing to
            // reassure about beyond "not charged" — ask for the code instead.
            if (caught?.response?.data?.code === 'EMAIL_NOT_VERIFIED') {
                setVerifyOpen(true);
                return;
            }
            setResult({
                status: 'error',
                message: getErrorMessage(
                    caught,
                    'Something went wrong starting this payment. You have not been charged.'
                ),
            });
        } finally {
            setLoading(false);
        }
    };

    // ---------------------------------------------------------------- success

    if (result?.status === 'success') {
        return (
            <div className="mx-auto max-w-md py-6 text-center">
                <IconBadge
                    icon={<CheckCircle2 size={32} />}
                    tone="positive"
                    size="xl"
                    pulse
                    className="mx-auto"
                />

                <div role="status">
                    <h1 className="mt-4 text-xl font-semibold text-text">Money added</h1>
                    <p className="mt-1 text-sm text-text-muted">
                        <Amount value={result.amount} size="sm" tone="neutral" /> is now in your
                        wallet.
                    </p>
                </div>

                <div className="mt-6 flex flex-col gap-2">
                    <Button variant="primary" fullWidth onClick={() => navigate(ROUTES.HOME)}>
                        Done
                    </Button>
                    <Button variant="ghost" fullWidth onClick={() => setResult(null)}>
                        Add more
                    </Button>
                </div>
            </div>
        );
    }

    // ------------------------------------------------------------------- form

    return (
        <div className="mx-auto max-w-md">
            <PageHeader title="Add money" back={ROUTES.HOME} />

            <VerifyEmailBanner className="mb-4" />

            <WalletCard userName={userName} balanceMinor={balanceMinor} className="mb-5" />

            <div className="space-y-4">
                <Field label="Amount" hint={`Current balance: ${formatCurrency(balance)}`}>
                    {(props) => (
                        <AmountInput value={amount} onChange={setAmount} autoFocus {...props} />
                    )}
                </Field>

                <div className="flex flex-wrap gap-2">
                    {QUICK_TOPUP_AMOUNTS.map((preset) => (
                        <button
                            key={preset}
                            type="button"
                            onClick={() => setAmount(String(preset))}
                            className={cn(
                                'h-9 rounded-pill border px-4 text-sm font-medium',
                                'transition-colors duration-[--duration-fast]',
                                amount === String(preset)
                                    ? 'border-accent bg-accent-soft text-accent-text'
                                    : 'border-border text-text-secondary hover:bg-surface-hover'
                            )}
                        >
                            {formatCurrencyCompact(preset)}
                        </button>
                    ))}
                </div>

                {isValidAmount && (
                    <Card padding="md">
                        <dl className="divide-y divide-border">
                            <DetailRow label="You pay" value={formatCurrency(numericAmount)} />
                            <DetailRow label="Fee" value="No fee" />
                            <DetailRow
                                label="New balance"
                                value={formatCurrency(Number(balance || 0) + numericAmount)}
                            />
                        </dl>
                    </Card>
                )}

                {/*
                 * Failure and pending states are persistent panels, not toasts.
                 * Both answer "was I charged?" in the first sentence, because
                 * that is the question the user actually has.
                 */}
                {result?.status === 'error' && (
                    <Card padding="md" className="border-danger/30 bg-danger-soft">
                        <p role="alert" className="text-sm font-medium text-danger">
                            Payment not completed
                        </p>
                        <p className="mt-1 text-sm leading-6 text-text-secondary">
                            {result.message}
                        </p>
                        {result.reference && (
                            <p className="mt-2 font-mono text-xs text-text-muted">
                                Reference: {result.reference}
                            </p>
                        )}
                    </Card>
                )}

                {result?.status === 'pending' && (
                    <Card padding="md" className="border-warning/30 bg-warning-soft">
                        <p role="alert" className="text-sm font-medium text-warning">
                            Payment received, confirmation pending
                        </p>
                        <p className="mt-1 text-sm leading-6 text-text-secondary">
                            {result.message}
                        </p>
                        {result.reference && (
                            <p className="mt-2 font-mono text-xs text-text-muted">
                                Reference: {result.reference}
                            </p>
                        )}
                    </Card>
                )}

                <Button
                    variant="primary"
                    size="xl"
                    fullWidth
                    loading={loading}
                    disabled={!isValidAmount}
                    onClick={startPayment}
                >
                    {isValidAmount ? `Add ${formatCurrency(numericAmount)}` : 'Add money'}
                </Button>

                <p className="flex items-center justify-center gap-1.5 text-xs text-text-muted">
                    <Lock size={13} aria-hidden="true" />
                    Card details go straight to Razorpay. {APP_NAME} never sees them.
                </p>
            </div>

            <VerifyEmailSheet open={verifyOpen} onClose={() => setVerifyOpen(false)} />
        </div>
    );
};

export default AddMoney;
