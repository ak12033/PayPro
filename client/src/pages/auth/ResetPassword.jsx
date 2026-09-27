import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import AuthLayout from './AuthLayout';
import Button from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import PasswordField from '../../components/forms/PasswordField';
import PasswordStrengthMeter from '../../components/forms/PasswordStrengthMeter';
import { authApi } from '../../services/api/endpoints/authApi';
import { getErrorMessage } from '../../utils/errors';
import { isValidEmail } from '../../utils/validation';
import { getPasswordStrength } from '../../utils/password';
import { ROUTES } from '../../constants/routes';

/**
 * Complete a password reset: the code from ForgotPassword.jsx, plus a new
 * password. On success every existing session is revoked server-side (see
 * authController.resetPassword) — the user signs in fresh from here.
 */
const ResetPassword = () => {
    const navigate = useNavigate();
    const { state } = useLocation();

    const [email, setEmail] = useState(state?.email ?? '');
    const [otp, setOtp] = useState('');
    const [password, setPassword] = useState('');
    const [errors, setErrors] = useState({});
    const [formError, setFormError] = useState('');
    const [loading, setLoading] = useState(false);

    // A direct hit on this URL with no prior request still works — the user
    // just has to type the email the code was sent to as well.
    useEffect(() => {
        if (state?.email) setEmail(state.email);
    }, [state]);

    const submit = async (event) => {
        event.preventDefault();
        if (loading) return;

        const nextErrors = {};
        if (!isValidEmail(email)) nextErrors.email = 'Enter the email the code was sent to.';
        if (!otp.trim() || otp.trim().length < 6) nextErrors.otp = 'Enter the 6-digit code.';
        if (getPasswordStrength(password).score < 3) nextErrors.password = 'Choose a stronger password.';

        setErrors(nextErrors);
        setFormError('');
        if (Object.keys(nextErrors).length > 0) return;

        setLoading(true);
        try {
            await authApi.resetPassword({ email: email.trim(), otp: otp.trim(), password });
            navigate(ROUTES.LOGIN, {
                replace: true,
                state: { resetSuccess: true },
            });
        } catch (caught) {
            setFormError(getErrorMessage(caught, 'That code did not work. Request a new one and try again.'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout
            title="Enter your new password"
            subtitle="Along with the code we emailed you."
            footer={
                <span className="text-text-muted">
                    Didn't get a code?{' '}
                    <Link to={ROUTES.FORGOT_PASSWORD} className="font-medium text-accent-text">
                        Send another
                    </Link>
                </span>
            }
        >
            <form onSubmit={submit} className="space-y-4" noValidate>
                {formError && (
                    <div
                        role="alert"
                        className="flex items-start gap-2 rounded-card border border-danger/30 bg-danger-soft px-3 py-2.5"
                    >
                        <AlertCircle size={15} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
                        <p className="text-sm text-text-secondary">{formError}</p>
                    </div>
                )}

                <Field label="Email" required error={errors.email}>
                    {(props) => (
                        <Input
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            autoComplete="email"
                            placeholder="you@example.com"
                            {...props}
                        />
                    )}
                </Field>

                <Field label="Verification code" required error={errors.otp}>
                    {(props) => (
                        <Input
                            value={otp}
                            onChange={(event) => setOtp(event.target.value)}
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={6}
                            placeholder="123456"
                            autoFocus={Boolean(email)}
                            {...props}
                        />
                    )}
                </Field>

                <Field
                    label="New password"
                    required
                    error={errors.password}
                    hint={password ? undefined : 'At least 8 characters, with a number and a symbol.'}
                >
                    {(props) => (
                        <PasswordField
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            autoComplete="new-password"
                            {...props}
                        />
                    )}
                </Field>

                <PasswordStrengthMeter password={password} />

                <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>
                    Reset password
                </Button>
            </form>
        </AuthLayout>
    );
};

export default ResetPassword;
