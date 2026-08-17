import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import AuthLayout from './AuthLayout';
import Button from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import PasswordField from '../../components/forms/PasswordField';
import { useAuth } from '../../context/AuthContext';
import { authApi } from '../../services/api/endpoints/authApi';
import { getErrorMessage } from '../../utils/errors';
import { ROUTES, HOME_ROUTE } from '../../constants/routes';

/**
 * Sign in.
 *
 * There is still no client-side IP or location lookup. (An earlier version made
 * a blocking request to an external IP service before every login attempt and
 * posted the result to the server, which ignored it. It could not have been
 * trusted anyway: a client-supplied address would let anyone defeat the
 * new-location challenge by claiming a familiar one.) The request does carry
 * device attributes now — see lib/deviceFingerprint — which are used to
 * recognise this browser, never to locate it.
 *
 * What changed is the failure handling. Errors were previously rendered as a
 * bare red string above the form with no role, so a screen reader user pressed
 * "Sign in", heard nothing, and had no way to discover that their password was
 * wrong. The error is now an alert, and rate-limit responses are distinguished
 * from bad credentials — "too many attempts, wait a moment" and "wrong
 * password" call for completely different behaviour from the user, and
 * collapsing them into one message sends people to reset a password that was
 * never the problem.
 */
const Login = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { setToken } = useAuth();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

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
            // Return the user to whatever page sent them here, if any.
            navigate(location.state?.from || HOME_ROUTE, { replace: true });
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
        <AuthLayout
            title="Sign in"
            subtitle="Welcome back to PayPro."
            footer={
                <span className="text-text-muted">
                    New here?{' '}
                    <Link to={ROUTES.SIGNUP} className="font-medium text-accent-text">
                        Create an account
                    </Link>
                </span>
            }
        >
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

                <Field label="Email">
                    {(props) => (
                        <Input
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            // `autoComplete` and `autoFocus` are not polish:
                            // they are what let a password manager fill this
                            // form, which is the single biggest thing a login
                            // page can do for account security.
                            autoComplete="email"
                            autoFocus
                            placeholder="you@example.com"
                            {...props}
                        />
                    )}
                </Field>

                <Field label="Password">
                    {(props) => (
                        <PasswordField
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            autoComplete="current-password"
                            {...props}
                        />
                    )}
                </Field>

                <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>
                    Sign in
                </Button>
            </form>
        </AuthLayout>
    );
};

export default Login;
