import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import Button from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import PasswordField from '../../components/forms/PasswordField';
import { useAuth } from '../../context/AuthContext';
import { authApi } from '../../services/api/endpoints/authApi';
import { getErrorMessage } from '../../utils/errors';
import { ROUTES, HOME_ROUTE } from '../../constants/routes';

/**
 * Sign-in form, shown in AuthPage's dialog. `onSwitch` flips the dialog to
 * the signup form; `onBusyChange` lets the dialog refuse to close mid-request.
 *
 * There is still no client-side IP or location lookup. (An earlier version made
 * a blocking request to an external IP service before every login attempt and
 * posted the result to the server, which ignored it. It could not have been
 * trusted anyway: a client-supplied address would let anyone defeat the
 * new-location challenge by claiming a familiar one.) The request does carry
 * device attributes now — see lib/deviceFingerprint — which are used to
 * recognise this browser, never to locate it.
 *
 * Errors are an alert, and rate-limit responses are distinguished from bad
 * credentials — "too many attempts, wait a moment" and "wrong password" call
 * for completely different behaviour from the user, and collapsing them into
 * one message sends people to reset a password that was never the problem.
 */
const LoginForm = ({ onSwitch, onBusyChange }) => {
    const navigate = useNavigate();
    const { setToken } = useAuth();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => onBusyChange?.(loading), [loading, onBusyChange]);

    const submit = async (event) => {
        event.preventDefault();
        if (loading) return;

        if (!email.trim() || !password) {
            setError('Enter your email and password.');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const { data } = await authApi.login({ email: email.trim(), password });

            setToken(data.accessToken);
            // Always Home, like signup and 2FA. Returning to the page that
            // sent them here meant signing out from Account and back in
            // landed on Account.
            navigate(HOME_ROUTE, { replace: true });
        } catch (caught) {
            if (caught.response?.data?.require2FA) {
                // The challenge id and the reason travel with the navigation:
                // the id is required to complete verification, and the reason
                // is what turns an unexplained interruption into an
                // explanation. Neither is a secret — the code in the user's
                // inbox is the secret.
                navigate(ROUTES.LOGIN_2FA, {
                    state: {
                        email: email.trim(),
                        challengeId: caught.response.data.challengeId,
                        reason: caught.response.data.reason,
                        message: caught.response.data.message,
                        // 'totp': the code is on their phone, not in their inbox.
                        method: caught.response.data.method ?? 'email',
                    },
                });
                return;
            }

            if (caught.response?.status === 429) {
                setError(
                    getErrorMessage(
                        caught,
                        'Too many attempts. Wait a few minutes before trying again.'
                    )
                );
                return;
            }

            setError(getErrorMessage(caught, 'That email and password do not match.'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={submit} className="space-y-4" noValidate>
            {error && (
                <div
                    role="alert"
                    className="flex items-start gap-2 rounded-card border border-danger/30 bg-danger-soft px-3 py-2.5"
                >
                    <AlertCircle size={15} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
                    <p className="text-sm text-text-secondary">{error}</p>
                </div>
            )}

            <Field label="Email address">
                {(props) => (
                    <Input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        // `autoComplete` is not polish: it is what lets
                        // a password manager fill this form, which is
                        // the single biggest thing a login page can do
                        // for account security.
                        autoComplete="email"
                        placeholder="you@example.com"
                        {...props}
                    />
                )}
            </Field>

            <div>
                <Field label="Password">
                    {(props) => (
                        <PasswordField
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            autoComplete="current-password"
                            placeholder="Enter your password"
                            {...props}
                        />
                    )}
                </Field>
                <div className="mt-2 flex justify-end">
                    <Link
                        to={ROUTES.FORGOT_PASSWORD}
                        className="text-xs font-medium text-accent-text"
                    >
                        Forgot password?
                    </Link>
                </div>
            </div>

            <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>
                Login to dashboard
            </Button>

            <div className="flex items-center gap-3 text-xs text-text-muted">
                <div className="h-px flex-1 bg-border" />
                <span className="text-center">Protected by device and location verification</span>
                <div className="h-px flex-1 bg-border" />
            </div>

            <p className="text-center text-sm text-text-muted">
                Don&apos;t have an account?{' '}
                <button type="button" onClick={onSwitch} className="font-semibold text-accent-text">
                    Sign up
                </button>
            </p>
        </form>
    );
};

export default LoginForm;
