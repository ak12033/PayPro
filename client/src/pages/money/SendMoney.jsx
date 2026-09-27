import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowRight, CheckCircle2, ShieldCheck, ShieldAlert, ScanLine, QrCode } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Avatar from '../../components/ui/Avatar';
import Amount from '../../components/ui/Amount';
import IconBadge from '../../components/ui/IconBadge';
import { AmountInput, Field } from '../../components/ui/Field';
import { DetailRow } from '../../components/ui/List';
import RecipientPicker from '../../features/transfer/RecipientPicker';
import QrScanner from '../../features/transfer/QrScanner';
import PaymentCodeSheet from '../../features/transfer/PaymentCodeSheet';
import VerifyEmailBanner from '../../features/account/VerifyEmailBanner';
import VerifyEmailSheet from '../../features/account/VerifyEmailSheet';
import { payeeApi } from '../../services/api/endpoints/payeeApi';
import { useAuth } from '../../context/AuthContext';
import { transactionApi } from '../../services/api/endpoints/transactionApi';
import { getErrorMessage } from '../../utils/errors';
import { formatCurrency, formatCurrencyCompact } from '../../utils/formatters';
import { createIdempotencyKey } from '../../lib/idempotency';
import { ROUTES } from '../../constants/routes';
import { QUICK_SEND_AMOUNTS } from '../../constants/wallet';
import cn from '../../lib/cn';

const STEPS = ['recipient', 'amount', 'review', 'done'];

/**
 * Send money.
 *
 * The single most consequential flow in the product, and the one the redesign
 * changes most.
 *
 * The old screen was one long form: a dropdown, an amount box, and a "Send"
 * button that fired the transfer immediately. There was no confirmation step at
 * all — one click on a screen where the recipient was collapsed into a dropdown
 * moved real money irreversibly to a real person. If the wrong name was
 * selected, the user found out from the success toast.
 *
 * The flow is now recipient → amount → **review** → result, and the review step
 * is not optional. It exists to answer, before anything is irreversible: *who*
 * is getting this, *how much*, and *what will I have left*. Every fintech worth
 * trusting has this step; it is the cheapest possible insurance against the
 * most expensive possible mistake.
 *
 * The steps are also a genuine reduction in what is on screen at once. One
 * decision per screen means the amount keypad is not competing with a
 * scrollable list of names on a phone.
 *
 * What is preserved exactly: the idempotency key, and the server-driven 2FA
 * handoff. Both are correctness-critical and neither is a design concern.
 */
const SendMoney = () => {
    const navigate = useNavigate();
    const { balance, fetchDashboardData } = useAuth();

    const [step, setStep] = useState('recipient');
    const [recipient, setRecipient] = useState(null);
    const [scannerOpen, setScannerOpen] = useState(false);
    const [myCodeOpen, setMyCodeOpen] = useState(false);
    const [resolvingCode, setResolvingCode] = useState(false);

    /**
     * A scanned code resolves to a recipient and stops there (plan.md §9.3).
     * The user still lands on the amount step and confirms, exactly as if they
     * had picked the person from the list — scanning saves typing a name, it
     * does not authorise anything.
     */
    const handleScanned = async (code) => {
        setResolvingCode(true);
        try {
            const { data } = await payeeApi.resolvePaymentCode(code);
            setRecipient(data.recipient);
            setScannerOpen(false);
            setStep('amount');
        } catch (err) {
            toast.error(getErrorMessage(err, 'That payment code did not work.'));
        } finally {
            setResolvingCode(false);
        }
    };
    const [amount, setAmount] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [verifyOpen, setVerifyOpen] = useState(false);

    const numericAmount = Number(amount);
    const isValidAmount = Number.isFinite(numericAmount) && numericAmount > 0;
    const exceedsBalance = isValidAmount && numericAmount > Number(balance || 0);
    const remaining = Number(balance || 0) - (isValidAmount ? numericAmount : 0);

    const recipientName = recipient
        ? `${recipient.firstName ?? ''} ${recipient.lastName ?? ''}`.trim()
        : '';

    const send = async () => {
        if (submitting) return;

        setSubmitting(true);
        setError(null);

        try {
            /**
             * Idempotency key.
             *
             * Without one, a double-tapped button or an axios retry after a
             * network timeout produced two genuine transfers. The server
             * de-duplicates on this key, so a repeat of the *same* attempt is a
             * no-op while a deliberate second transfer (new key) still goes
             * through.
             */
            const { status } = await transactionApi.transfer({
                recipientId: recipient._id,
                amount: numericAmount,
                idempotencyKey: createIdempotencyKey(),
            });

            /**
             * 202 means the risk engine held this for review (plan.md §30.2.2).
             * It is not a success and must never render the "Money sent"
             * screen — no money has moved, and telling someone it has is the
             * single most damaging thing this page could get wrong.
             */
            if (status === 202) {
                setStep('held');
                return;
            }

            setStep('done');
            // Refresh in the background. Blocking the success screen on a
            // profile refetch means the user stares at a spinner *after* their
            // money has already moved, which is the worst possible moment to
            // leave them uncertain.
            fetchDashboardData().catch(() => {});
        } catch (caught) {
            if (caught?.response?.data?.require2FA) {
                /**
                 * The recipient and amount are bound to the OTP challenge on
                 * the server, so this page only has to navigate — there is no
                 * client-side handoff of what is being authorised.
                 */
                navigate(ROUTES.TRANSFER_2FA, {
                    state: {
                        email: caught.response.data.email,
                        method: caught.response.data.method ?? 'email',
                        recipientName,
                        amount: numericAmount,
                    },
                });
                return;
            }

            /**
             * Unverified address (plan.md §31.2.7). Nothing was claimed or
             * moved — the server refuses before the idempotency key — so the
             * useful response is the code prompt, right here on the review
             * step, and then the same Send button again.
             */
            if (caught?.response?.data?.code === 'EMAIL_NOT_VERIFIED') {
                setError('Verify your email, then send again. No money has moved.');
                setVerifyOpen(true);
                return;
            }

            // Blocked outright by the risk engine. A plain error message here
            // would read as "try again", which is exactly what will not help.
            if (caught?.response?.data?.code === 'TRANSFER_BLOCKED') {
                setStep('blocked');
                return;
            }

            setError(getErrorMessage(caught, 'The transfer could not be completed.'));
        } finally {
            setSubmitting(false);
        }
    };

    // ------------------------------------------------------ held / blocked

    /**
     * Both of these outcomes say the same critical thing first: **no money has
     * moved.** That sentence leads, before any explanation, because it is the
     * only fact the reader urgently needs and the one they will otherwise
     * assume the opposite of.
     */
    if (step === 'held' || step === 'blocked') {
        const held = step === 'held';
        return (
            <div className="mx-auto max-w-md py-6 text-center">
                <IconBadge
                    icon={held ? <ShieldCheck size={32} /> : <ShieldAlert size={32} />}
                    tone="warning"
                    size="xl"
                    className="mx-auto"
                />

                <div role="status">
                    <h1 className="mt-4 text-xl font-semibold text-text">
                        {held ? 'We’re checking this transfer' : 'This transfer was stopped'}
                    </h1>
                    <p className="mt-1 text-sm text-text-muted">
                        No money has moved, and your balance is unchanged.
                    </p>
                    <p className="mt-3 text-sm leading-6 text-text-muted">
                        {held
                            ? `Your ${formatCurrency(numericAmount)} to ${recipientName} looked unusual for your account, so someone is reviewing it. Most reviews finish within a day, and we’ll let you know — you can send it again once they do.`
                            : `Your ${formatCurrency(numericAmount)} to ${recipientName} looked unusual enough that we stopped it. If this was you, get in touch and we’ll take another look.`}
                    </p>
                </div>

                <div className="mt-6 flex flex-col gap-2">
                    {!held && (
                        <Button variant="primary" fullWidth onClick={() => navigate(ROUTES.SUPPORT)}>
                            Get help
                        </Button>
                    )}
                    <Button variant={held ? 'primary' : 'ghost'} fullWidth onClick={() => navigate(ROUTES.HOME)}>
                        Back to home
                    </Button>
                </div>
            </div>
        );
    }

    // ---------------------------------------------------------------- success

    if (step === 'done') {
        return (
            <div className="mx-auto max-w-md py-6 text-center">
                <IconBadge
                    icon={<CheckCircle2 size={32} />}
                    tone="positive"
                    size="xl"
                    pulse
                    className="mx-auto"
                />

                {/* `role="status"` so the outcome is announced. A success screen
                    that is only visual leaves a screen reader user unsure
                    whether their money moved. */}
                <div role="status">
                    <h1 className="mt-4 text-xl font-semibold text-text">Money sent</h1>
                    <p className="mt-1 text-sm text-text-muted">
                        <Amount value={numericAmount} size="sm" tone="neutral" /> is on its way to{' '}
                        {recipientName}.
                    </p>
                </div>

                <div className="mt-6 flex flex-col gap-2">
                    <Button variant="primary" fullWidth onClick={() => navigate(ROUTES.ACTIVITY)}>
                        View in activity
                    </Button>
                    <Button
                        variant="ghost"
                        fullWidth
                        onClick={() => {
                            // Reset to a fresh transfer rather than navigating
                            // away: "send another" is the most common next
                            // action, and reloading the page to get it is silly.
                            setStep('recipient');
                            setRecipient(null);
                            setAmount('');
                        }}
                    >
                        Send another
                    </Button>
                </div>
            </div>
        );
    }

    // ------------------------------------------------------------------ steps

    return (
        <div className="mx-auto max-w-md">
            <PageHeader
                title="Send money"
                back={step === 'recipient' ? ROUTES.HOME : true}
            />

            <VerifyEmailBanner className="mb-4" />

            <StepIndicator step={step} />

            {step === 'recipient' && (
                <Card padding="md">
                    <div className="mb-4 flex gap-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            className="flex-1"
                            icon={<ScanLine size={15} />}
                            onClick={() => setScannerOpen(true)}
                        >
                            Scan a code
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="flex-1"
                            icon={<QrCode size={15} />}
                            onClick={() => setMyCodeOpen(true)}
                        >
                            Show my code
                        </Button>
                    </div>

                    <RecipientPicker
                        value={recipient}
                        onChange={(user) => {
                            setRecipient(user);
                            // Advance on selection. Making the user pick a name
                            // and *then* press Continue is a tap that carries no
                            // information — the selection already said it.
                            setStep('amount');
                        }}
                    />
                </Card>
            )}

            <QrScanner
                open={scannerOpen}
                onClose={() => setScannerOpen(false)}
                onResolved={handleScanned}
                resolving={resolvingCode}
            />

            <PaymentCodeSheet open={myCodeOpen} onClose={() => setMyCodeOpen(false)} />

            {step === 'amount' && (
                <div className="space-y-4">
                    <Card padding="md">
                        <div className="flex items-center gap-3">
                            <Avatar name={recipientName} size="md" />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-text">
                                    {recipientName}
                                </p>
                                <p className="text-xs text-text-muted">Recipient</p>
                            </div>
                            <Button size="sm" variant="ghost" onClick={() => setStep('recipient')}>
                                Change
                            </Button>
                        </div>
                    </Card>

                    <Field
                        label="Amount"
                        error={
                            exceedsBalance
                                ? `That's more than your balance. You have ${formatCurrency(balance)} available.`
                                : null
                        }
                        hint={`Balance: ${formatCurrency(balance)}`}
                    >
                        {(props) => (
                            <AmountInput value={amount} onChange={setAmount} autoFocus {...props} />
                        )}
                    </Field>

                    {/* Quick amounts. Most transfers are round numbers, and
                        tapping one is faster and less error-prone than typing
                        on a phone keypad. */}
                    <div className="flex flex-wrap gap-2">
                        {QUICK_SEND_AMOUNTS.map((preset) => (
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

                    {/*
                     * No "note" field, deliberately.
                     *
                     * The obvious thing to put here is an optional message, and
                     * an earlier draft did. But `POST /transactions/transfer`
                     * accepts only `recipientId`, `amount` and
                     * `idempotencyKey` — it writes its own description
                     * ("P2P transfer to <name>") and discards anything else in
                     * the body. So the field would have collected text from the
                     * user, shown it back to them on the review step, and then
                     * silently dropped it. A form control that pretends to
                     * store something and does not is worse than no control.
                     *
                     * Adding it properly is a one-field backend change
                     * (a sanitised `note` persisted onto both ledger rows) and
                     * is listed as a recommendation rather than done here,
                     * since the brief scopes this work to the frontend.
                     */}

                    <Button
                        variant="primary"
                        size="xl"
                        fullWidth
                        disabled={!isValidAmount || exceedsBalance}
                        iconEnd={<ArrowRight size={17} />}
                        onClick={() => setStep('review')}
                    >
                        Review
                    </Button>
                </div>
            )}

            {step === 'review' && (
                <div className="space-y-4">
                    <Card variant="glass" className="text-center">
                        <p className="text-sm text-text-muted">You are sending</p>
                        <div className="mt-1.5">
                            <Amount value={numericAmount} size="display" tone="neutral" />
                        </div>

                        <div className="mt-4 flex items-center justify-center gap-2">
                            <Avatar name={recipientName} size="sm" />
                            <span className="text-sm font-medium text-text">to {recipientName}</span>
                        </div>
                    </Card>

                    <Card padding="md">
                        <dl className="divide-y divide-border">
                            <DetailRow label="Amount" value={formatCurrency(numericAmount)} />
                            <DetailRow label="Fee" value="No fee" />
                            {/* The number that actually prevents regret. */}
                            <DetailRow
                                label="Balance after"
                                value={formatCurrency(remaining)}
                                tone={remaining < 0 ? 'text-danger' : undefined}
                            />
                        </dl>
                    </Card>

                    {error && (
                        <Card padding="md" className="border-danger/30 bg-danger-soft">
                            <p role="alert" className="text-sm text-danger">
                                {error}
                            </p>
                            <p className="mt-1.5 text-xs text-text-secondary">
                                No money has left your account. You can try again.
                            </p>
                        </Card>
                    )}

                    <p className="flex items-center justify-center gap-1.5 text-xs text-text-muted">
                        <ShieldCheck size={14} aria-hidden="true" />
                        Transfers are final and cannot be reversed.
                    </p>

                    <div className="flex flex-col gap-2">
                        <Button
                            variant="primary"
                            size="xl"
                            fullWidth
                            loading={submitting}
                            onClick={send}
                        >
                            Send {formatCurrency(numericAmount)}
                        </Button>
                        <Button
                            variant="ghost"
                            fullWidth
                            disabled={submitting}
                            onClick={() => setStep('amount')}
                        >
                            Back
                        </Button>
                    </div>
                </div>
            )}

            <VerifyEmailSheet open={verifyOpen} onClose={() => setVerifyOpen(false)} onVerified={() => setError(null)} />
        </div>
    );
};

/**
 * Where you are in the flow.
 *
 * Rendered as an ordered list with the current step marked by `aria-current`,
 * so the position is available to a screen reader and not only implied by
 * which dot is filled.
 */
const StepIndicator = ({ step }) => {
    const index = STEPS.indexOf(step);
    const labels = ['Recipient', 'Amount', 'Review'];

    return (
        <ol className="mb-5 flex items-center gap-2" aria-label="Progress">
            {labels.map((label, position) => {
                const state = position < index ? 'done' : position === index ? 'current' : 'upcoming';

                return (
                    <li key={label} className="flex flex-1 items-center gap-2">
                        <span
                            aria-current={state === 'current' ? 'step' : undefined}
                            className={cn(
                                'h-1 flex-1 rounded-pill transition-colors duration-[--duration-normal]',
                                state === 'upcoming' ? 'bg-border' : 'bg-accent'
                            )}
                        />
                        <span className="sr-only">
                            {label}
                            {state === 'current' ? ' (current step)' : state === 'done' ? ' (completed)' : ''}
                        </span>
                    </li>
                );
            })}
        </ol>
    );
};

export default SendMoney;
