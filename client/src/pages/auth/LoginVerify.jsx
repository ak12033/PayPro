import React, { useEffect, useId, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from './AuthLayout';
import Button from '../../components/ui/Button';
import OtpField from '../../components/forms/OtpField';
import { useAuth } from '../../context/AuthContext';
import { authApi } from '../../services/api/endpoints/authApi';
import { getErrorMessage } from '../../utils/errors';
import { maskEmail } from '../../utils/formatters';
import { ROUTES, HOME_ROUTE } from '../../constants/routes';

const RESEND_COOLDOWN_SECONDS = 30;

/**
 * Sign-in verification.
 *
 * Reached when the server decides a login needs a second factor — an
 * unrecognised device, a sign-in from somewhere new, or 2FA enabled on the
 * account.
 *
 * Two things carry their weight here.
 *
 * *Saying why.* A verification prompt that arrives unannounced, on a login that
 * worked yesterday, reads as something going wrong; "we did not recognise this
 * device" turns the same interruption into evidence that the account is being
 * watched over. Same friction, opposite feeling — and a user who knows the
 * stated reason is wrong ("but this is my usual laptop") has been handed the
 * one piece of information that tells them not to continue.
 *
 * *Offering to remember.* Without this checkbox the challenge repeats on every
 * sign-in from every device, and a security prompt that fires constantly is one
 * people learn to clear without reading. Trusting the device is what makes the
 * remaining prompts mean something.
 */
const REASON_COPY = {
    new_device: 'We have not seen this device before.',
    untrusted_device: 'This device has not been trusted yet.',
    expired_trust: "It has been a while since you last used this device.",
    different_city: 'You are signing in from somewhere new.',
    different_state: 'You are signing in from somewhere new.',
    different_country: 'You are signing in from a different country.',
    impossible_travel: 'This sign-in is a long way from your last one.',
    suspected_proxy: 'This connection looks like a VPN or proxy.',
    user_preference_2fa: 'Your account asks for a code every time you sign in.',
};

const LoginVerify = () => {
    const navigate = useNavigate();
    const { state } = useLocation();
    const { setToken } = useAuth();
    const trustId = useId();

    const [otp, setOtp] = useState('');
    const [trustDevice, setTrustDevice] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [error, setError] = useState(null);
    const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

    useEffect(() => {
        if (!state?.email) navigate(ROUTES.LOGIN, { replace: true });
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
            const { data } = await authApi.verifyLoginOtp({
                email: state.email,
                otp,
                challengeId: state.challengeId,
                trustDevice,
            });
            setToken(data.accessToken);
            navigate(HOME_ROUTE, { replace: true });
        } catch (caught) {
            setError(getErrorMessage(caught, 'That code did not work.'));
            setOtp('');
        } finally {
            setVerifying(false);
        }
    };

    const resend = async () => {
        try {
            await authApi.resendLoginOtp({ email: state.email });
            setCooldown(RESEND_COOLDOWN_SECONDS);
            setOtp('');
            setError(null);
        } catch (caught) {
            setError(getErrorMessage(caught, 'Could not send a new code.'));
        }
    };

    const explanation = REASON_COPY[state?.reason] ?? "We didn't recognise this sign-in, so we're confirming it's you.";

    return (
        <AuthLayout
            title="Check your email"
            subtitle={`We sent a 6-digit code to ${maskEmail(state?.email) || 'your inbox'}.`}
        >
            <p className="mb-5 rounded-card bg-surface-sunken px-3 py-2.5 text-center text-xs leading-5 text-text-secondary">
                {explanation}
            </p>

            <OtpField value={otp} onChange={setOtp} onSubmit={verify} error={error} />

            {/* A checkbox rather than a toggle: this is part of the form being
                submitted, not a setting that takes effect the moment it moves. */}
            <label
                htmlFor={trustId}
                className="mt-4 flex cursor-pointer items-start gap-3 rounded-card border border-border px-3 py-3"
            >
                <input
                    id={trustId}
                    type="checkbox"
                    checked={trustDevice}
                    onChange={(event) => setTrustDevice(event.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-accent"
                />
                <span className="min-w-0">
                    <span className="block text-sm font-medium text-text">Trust this device</span>
                    <span className="mt-0.5 block text-xs leading-5 text-text-muted">
                        Skip this step next time you sign in here. Leave it off on a shared or
                        public computer.
                    </span>
                </span>
            </label>

            <Button
                variant="primary"
                size="lg"
                fullWidth
                className="mt-4"
                loading={verifying}
                disabled={otp.length !== 6}
                onClick={verify}
            >
                Verify and sign in
            </Button>

            <div className="mt-4 text-center">
                <button
                    type="button"
                    onClick={resend}
                    disabled={cooldown > 0}
                    className="text-sm font-medium text-accent-text disabled:text-text-muted"
                >
                    {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Send a new code'}
                </button>
            </div>

            <button
                type="button"
                onClick={() => navigate(ROUTES.LOGIN, { replace: true })}
                className="mx-auto mt-6 block text-sm text-text-muted hover:text-text"
            >
                Use a different account
            </button>
        </AuthLayout>
    );
};

export default LoginVerify;
