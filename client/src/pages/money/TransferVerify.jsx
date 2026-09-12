import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Amount from '../../components/ui/Amount';
import IconBadge from '../../components/ui/IconBadge';
import OtpField from '../../components/forms/OtpField';
import { useAuth } from '../../context/AuthContext';
import { transactionApi } from '../../services/api/endpoints/transactionApi';
import { getErrorMessage } from '../../utils/errors';
import { maskEmail } from '../../utils/formatters';
import { ROUTES } from '../../constants/routes';

const RESEND_COOLDOWN_SECONDS = 30;

/**
 * Transfer verification.
 *
 * Rebuilt as a focused, single-column screen. The previous version was a
 * two-column marketing layout — a 4xl headline, a "Secure confirmation"
 * eyebrow, a paragraph about our security posture and a decorative grid pattern
 * — wrapped around a six-character input. That is a lot of persuasion aimed at
 * someone who has already decided; what they need is the code field, what they
 * are approving, and a way out.
 *
 * Two things it now shows that it did not:
 *
 *   **What is being authorised.** The whole point of this step is that the user
 *   confirms a specific transfer. Showing only "enter your code" asks them to
 *   approve something they cannot see. (The amount and recipient are display-
 *   only and come from navigation state — the server binds the real values to
 *   the challenge, so nothing here can change what gets sent.)
 *
 *   **A resend cooldown.** The resend button was always live, so an anxious
 *   user could tap it repeatedly, invalidate their own previous code each time,
 *   and end up locked out by the server's rate limiter with no explanation.
 */
const TransferVerify = () => {
    const navigate = useNavigate();
    const { state } = useLocation();
    const { fetchDashboardData } = useAuth();

    const [otp, setOtp] = useState('');
    const [verifying, setVerifying] = useState(false);
    const [resending, setResending] = useState(false);
    const [error, setError] = useState(null);
    const [done, setDone] = useState(false);
    const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

    // Arriving here without a pending challenge means a refresh or a direct
    // URL hit; there is nothing to verify.
    useEffect(() => {
        if (!state?.email) navigate(ROUTES.SEND, { replace: true });
    }, [state, navigate]);

    useEffect(() => {
        if (cooldown <= 0) return undefined;
        const id = setTimeout(() => setCooldown((value) => value - 1), 1000);
        return () => clearTimeout(id);
    }, [cooldown]);

    const verify = async () => {
        if (otp.length !== 6 || verifying) return;

        setVerifying(true);
        setError(null);

        try {
            /**
             * Verify and settle in one server call.
             *
             * The recipient and amount live on the server-side challenge, so
             * this page only submits the code. An earlier version read them
             * back out of localStorage and posted them with `skip2FA: true`,
             * which meant the amount actually sent did not have to be the
             * amount the code authorised.
             */
            await transactionApi.verifyTransferOtp({ otp });

            setDone(true);
            fetchDashboardData().catch(() => {});
        } catch (caught) {
            setError(getErrorMessage(caught, 'That code did not work.'));
            // Clear on failure so the next attempt starts from an empty field
            // rather than requiring six backspaces.
            setOtp('');
        } finally {
            setVerifying(false);
        }
    };

    const resend = async () => {
        setResending(true);
        setError(null);

        try {
            await transactionApi.resendTransferOtp();
            setCooldown(RESEND_COOLDOWN_SECONDS);
            setOtp('');
        } catch (caught) {
            setError(getErrorMessage(caught, 'Could not send a new code.'));
        } finally {
            setResending(false);
        }
    };

    if (done) {
        return (
            <Screen>
                <div className="text-center">
                    <IconBadge
                        icon={<CheckCircle2 size={32} />}
                        tone="positive"
                        size="xl"
                        pulse
                        className="mx-auto"
                    />

                    <div role="status">
                        <h1 className="mt-4 text-xl font-semibold text-text">Transfer complete</h1>
                        {state?.recipientName && (
                            <p className="mt-1 text-sm text-text-muted">
                                Sent to {state.recipientName}.
                            </p>
                        )}
                    </div>

                    <Button
                        variant="primary"
                        fullWidth
                        className="mt-6"
                        onClick={() => navigate(ROUTES.ACTIVITY, { replace: true })}
                    >
                        View in activity
                    </Button>
                </div>
            </Screen>
        );
    }

    return (
        <Screen>
            <div className="text-center">
                <IconBadge icon={<ShieldCheck size={22} />} tone="accent" size="lg" className="mx-auto" />
                <h1 className="mt-3 text-xl font-semibold text-text">Confirm this transfer</h1>
                <p className="mt-1 text-sm text-text-muted">
                    We sent a 6-digit code to {maskEmail(state?.email) || 'your email'}.
                </p>
            </div>

            {/* What is being approved. Read-only. */}
            {(state?.amount || state?.recipientName) && (
                <Card variant="sunken" padding="md" className="mt-5 text-center">
                    {state.amount && (
                        <Amount value={state.amount} size="xl" tone="neutral" />
                    )}
                    {state.recipientName && (
                        <p className="mt-0.5 text-sm text-text-muted">to {state.recipientName}</p>
                    )}
                </Card>
            )}

            <div className="mt-5">
                <OtpField
                    value={otp}
                    onChange={setOtp}
                    onSubmit={verify}
                    error={error}
                    disabled={verifying}
                />
            </div>

            <Button
                variant="primary"
                size="xl"
                fullWidth
                className="mt-4"
                loading={verifying}
                disabled={otp.length !== 6}
                onClick={verify}
            >
                Confirm transfer
            </Button>

            <div className="mt-4 text-center">
                <button
                    type="button"
                    onClick={resend}
                    disabled={cooldown > 0 || resending}
                    className="text-sm font-medium text-accent-text disabled:text-text-muted"
                >
                    {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Send a new code'}
                </button>
            </div>

            <button
                type="button"
                onClick={() => navigate(ROUTES.SEND, { replace: true })}
                className="mx-auto mt-6 block text-sm text-text-muted hover:text-text"
            >
                Cancel this transfer
            </button>
        </Screen>
    );
};

/**
 * Full-screen container with no app navigation.
 *
 * Verification is a committed flow: the sidebar and tab bar are removed
 * deliberately so there is exactly one way forward and one clearly labelled way
 * out. Leaving the navigation in place invites a half-finished transfer.
 */
const Screen = ({ children }) => (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-8">
        <div className="w-full max-w-sm">{children}</div>
    </div>
);

export default TransferVerify;
