import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import AuthLayout from './AuthLayout';
import Button from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import PasswordField from '../../components/forms/PasswordField';
import PasswordStrengthMeter from '../../components/forms/PasswordStrengthMeter';
import { useAuth } from '../../context/AuthContext';
import { authApi } from '../../services/api/endpoints/authApi';
import { getErrorMessage } from '../../utils/errors';
import { isValidEmail } from '../../utils/validation';
import { getPasswordStrength } from '../../utils/password';
import { ROUTES, HOME_ROUTE } from '../../constants/routes';

/**
 * Create an account.
 *
 * Four fields, which is the true minimum the backend requires. Everything the
 * old screen wrapped around them — the feature list, the trust badges, the
 * gradient panel — is gone.
 *
 * Validation is per-field and on submit, not on every keystroke. Telling
 * someone their email is invalid while they are still typing the domain is
 * technically correct and practically hostile; errors appear when the user
 * indicates they are done.
 *
 * The password requirements are shown *as requirements*, continuously, rather
 * than as a verdict delivered after failure. A user should be able to satisfy
 * the rules on the first attempt, which means the rules have to be visible
 * before the attempt.
 */
const Signup = () => {
    const navigate = useNavigate();
    const { setToken } = useAuth();

    const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' });
    const [errors, setErrors] = useState({});
    const [formError, setFormError] = useState('');
    const [loading, setLoading] = useState(false);

    const update = (key) => (event) => {
        setForm((current) => ({ ...current, [key]: event.target.value }));
        // Clear a field's error as soon as the user starts fixing it, rather
        // than making them submit again to find out whether they succeeded.
        setErrors((current) => ({ ...current, [key]: undefined }));
    };

    const submit = async (event) => {
        event.preventDefault();
        if (loading) return;

        const nextErrors = {};
        if (!form.firstName.trim()) nextErrors.firstName = 'Enter your first name.';
        if (!isValidEmail(form.email)) nextErrors.email = 'Enter a valid email address.';
        if (getPasswordStrength(form.password).score < 3) {
            nextErrors.password = 'Choose a stronger password.';
        }

        setErrors(nextErrors);
        setFormError('');
        if (Object.keys(nextErrors).length > 0) return;

        setLoading(true);
        try {
            const { data } = await authApi.signup({
                firstName: form.firstName.trim(),
                lastName: form.lastName.trim(),
                email: form.email.trim(),
                password: form.password,
            });

            setToken(data.accessToken);
            navigate(HOME_ROUTE, { replace: true });
        } catch (caught) {
            // A 409 is "this email is taken", which is a field-level problem
            // with a field-level fix — showing it at the top of the form makes
            // the user hunt for which input it refers to.
            if (caught.response?.status === 409) {
                setErrors({ email: getErrorMessage(caught, 'That email is already registered.') });
            } else {
                setFormError(getErrorMessage(caught, "We couldn't create your account."));
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout
            title="Create your account"
            subtitle="It takes about a minute."
            footer={
                <span className="text-text-muted">
                    Already have an account?{' '}
                    <Link to={ROUTES.LOGIN} className="font-medium text-accent-text">
                        Sign in
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

                <div className="grid grid-cols-2 gap-3">
                    <Field label="First name" required error={errors.firstName}>
                        {(props) => (
                            <Input
                                value={form.firstName}
                                onChange={update('firstName')}
                                autoComplete="given-name"
                                autoFocus
                                {...props}
                            />
                        )}
                    </Field>

                    <Field label="Last name">
                        {(props) => (
                            <Input
                                value={form.lastName}
                                onChange={update('lastName')}
                                autoComplete="family-name"
                                {...props}
                            />
                        )}
                    </Field>
                </div>

                <Field label="Email" required error={errors.email}>
                    {(props) => (
                        <Input
                            type="email"
                            value={form.email}
                            onChange={update('email')}
                            autoComplete="email"
                            placeholder="you@example.com"
                            {...props}
                        />
                    )}
                </Field>

                <Field
                    label="Password"
                    required
                    error={errors.password}
                    hint={form.password ? undefined : 'At least 8 characters, with a number and a symbol.'}
                >
                    {(props) => (
                        <PasswordField
                            value={form.password}
                            onChange={update('password')}
                            autoComplete="new-password"
                            {...props}
                        />
                    )}
                </Field>

                <PasswordStrengthMeter password={form.password} />

                <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>
                    Create account
                </Button>
            </form>
        </AuthLayout>
    );
};

export default Signup;
