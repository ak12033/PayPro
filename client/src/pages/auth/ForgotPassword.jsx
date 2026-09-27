import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import AuthLayout from './AuthLayout';
import Button from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import IconBadge from '../../components/ui/IconBadge';
import { authApi } from '../../services/api/endpoints/authApi';
import { getErrorMessage } from '../../utils/errors';
import { isValidEmail } from '../../utils/validation';
import { ROUTES } from '../../constants/routes';

/**
 * Request a password reset code.
 *
 * There was previously no way back into the product for a user who forgot
 * their password at all — a genuine lockout from a wallet with real money in
 * it. This is the first of two screens; the code it sends is entered on
 * ResetPassword.jsx along with the new password.
 *
 * The server always answers 200 whether or not the address exists, so this
 * screen shows the same "check your email" state either way — a different
 * response per branch would turn the form into an account-existence oracle.
 */
const ForgotPassword = () => {
    const navigate = useNavigate();

    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);

    const submit = async (event) => {
        event.preventDefault();
        if (loading) return;

        if (!isValidEmail(email)) {
            setError('Enter a valid email address.');
            return;
        }

        setLoading(true);
        setError('');
        try {
            await authApi.forgotPassword({ email: email.trim() });
            setSent(true);
        } catch (caught) {
            setError(getErrorMessage(caught, "We couldn't send that. Try again in a moment."));
        } finally {
            setLoading(false);
        }
    };

    if (sent) {
        return (
            <AuthLayout title="Check your email">
                <div className="text-center">
                    <IconBadge icon={<CheckCircle2 size={22} />} tone="positive" size="lg" className="mx-auto" />
                    <p className="mt-4 text-sm text-text-secondary">
                        If an account exists for <strong className="text-text">{email.trim()}</strong>, a
                        verification code is on its way. It expires in 10 minutes.
                    </p>
                    <Button
                        variant="primary"
                        fullWidth
                        className="mt-6"
                        onClick={() => navigate(ROUTES.RESET_PASSWORD, { state: { email: email.trim() } })}
                    >
                        I have the code
                    </Button>
                    <Link to={ROUTES.LOGIN} className="mt-4 block text-sm text-text-muted hover:text-text">
                        Back to sign in
                    </Link>
                </div>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout
            title="Reset your password"
            subtitle="We'll email you a code to get back in."
            footer={
                <span className="text-text-muted">
                    Remembered it?{' '}
                    <Link to={ROUTES.LOGIN} className="font-medium text-accent-text">
                        Sign in
                    </Link>
                </span>
            }
        >
            <form onSubmit={submit} className="space-y-4" noValidate>
                <Field label="Email" error={error}>
                    {(props) => (
                        <Input
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            autoComplete="email"
                            autoFocus
                            placeholder="you@example.com"
                            {...props}
                        />
                    )}
                </Field>

                <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>
                    Send reset code
                </Button>
            </form>
        </AuthLayout>
    );
};

export default ForgotPassword;
