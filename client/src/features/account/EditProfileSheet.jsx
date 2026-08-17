import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Lock } from 'lucide-react';
import Sheet from '../../components/ui/Sheet';
import Button from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import PasswordField from '../../components/forms/PasswordField';
import PasswordStrengthMeter from '../../components/forms/PasswordStrengthMeter';
import { userApi } from '../../services/api/endpoints/userApi';
import { getErrorMessage } from '../../utils/errors';
import { isValidEmail } from '../../utils/validation';

/**
 * Editing identity.
 *
 * Split out of the settings page and into a sheet, because these fields are
 * categorically different from the toggles beside them: two of them require
 * re-authentication and one of them signs the user out of every device.
 *
 * The re-authentication field appears **only when it is needed** — that is,
 * only once the email or password has actually been modified. The server
 * requires the current password for those two changes and for nothing else, so
 * asking for it up front would be friction charged to everyone in order to
 * serve the few. It is also explained rather than merely demanded; "we need
 * this because you are changing your email" is the difference between a
 * security control and an obstacle.
 */
const EditProfileSheet = ({ open, onClose, user, onSaved }) => {
    const [form, setForm] = useState({ firstName: '', lastName: '', email: '' });
    const [password, setPassword] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);

    // Reset from the source of truth each time the sheet opens, so a cancelled
    // edit does not leave stale values behind for the next open.
    useEffect(() => {
        if (!open) return;
        setForm({
            firstName: user?.firstName ?? '',
            lastName: user?.lastName ?? '',
            email: user?.email ?? '',
        });
        setPassword('');
        setCurrentPassword('');
        setErrors({});
    }, [open, user]);

    const emailChanged = form.email !== (user?.email ?? '');
    const passwordChanged = password.length > 0;
    const needsReauth = emailChanged || passwordChanged;

    const submit = async (event) => {
        event.preventDefault();
        if (saving) return;

        const nextErrors = {};
        if (!form.firstName.trim()) nextErrors.firstName = 'Your first name is required.';
        if (!isValidEmail(form.email)) nextErrors.email = 'Enter a valid email address.';
        if (needsReauth && !currentPassword) {
            nextErrors.currentPassword = 'Enter your current password to confirm this change.';
        }

        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) return;

        setSaving(true);
        try {
            const { data } = await userApi.updateProfile({
                firstName: form.firstName.trim(),
                lastName: form.lastName.trim(),
                email: form.email.trim(),
                ...(passwordChanged && { password }),
                ...(needsReauth && { currentPassword }),
            });

            toast.success(data.message ?? 'Profile updated');
            onSaved?.();
            onClose();

            /**
             * A password change revokes every session server-side, including
             * this one. Saying so is the difference between "the app logged me
             * out for no reason" and "of course, I just changed my password".
             */
            if (data.requiresReauth) {
                toast('You will need to sign in again with your new password.', {
                    icon: '🔐',
                    duration: 6000,
                });
            }
        } catch (caught) {
            const message = getErrorMessage(caught, 'Could not save your changes.');
            // A 401 here means the re-auth password was wrong — attach it to
            // that field rather than showing a page-level error the user has to
            // map back onto an input themselves.
            if (caught?.response?.status === 401) {
                setErrors({ currentPassword: message });
            } else {
                toast.error(message);
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <Sheet
            open={open}
            onClose={onClose}
            title="Edit profile"
            size="md"
            dismissible={!saving}
            footer={
                <div className="flex gap-2">
                    <Button variant="ghost" fullWidth onClick={onClose} disabled={saving}>
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        fullWidth
                        loading={saving}
                        onClick={submit}
                        type="submit"
                        form="edit-profile-form"
                    >
                        Save
                    </Button>
                </div>
            }
        >
            <form id="edit-profile-form" onSubmit={submit} className="space-y-4" noValidate>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="First name" required error={errors.firstName}>
                        {(props) => (
                            <Input
                                value={form.firstName}
                                onChange={(event) =>
                                    setForm((f) => ({ ...f, firstName: event.target.value }))
                                }
                                autoComplete="given-name"
                                {...props}
                            />
                        )}
                    </Field>

                    <Field label="Last name">
                        {(props) => (
                            <Input
                                value={form.lastName}
                                onChange={(event) =>
                                    setForm((f) => ({ ...f, lastName: event.target.value }))
                                }
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
                            onChange={(event) =>
                                setForm((f) => ({ ...f, email: event.target.value }))
                            }
                            autoComplete="email"
                            {...props}
                        />
                    )}
                </Field>

                <Field
                    label="New password"
                    hint="Leave blank to keep your current password."
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

                {passwordChanged && <PasswordStrengthMeter password={password} />}

                {/* Appears only when the server will actually require it. */}
                {needsReauth && (
                    <div className="rounded-card border border-warning/30 bg-warning-soft p-3">
                        <p className="flex items-start gap-2 text-xs leading-5 text-text-secondary">
                            <Lock size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
                            You are changing your{' '}
                            {emailChanged && passwordChanged
                                ? 'email and password'
                                : emailChanged
                                  ? 'email address'
                                  : 'password'}
                            , so we need to confirm it is you.
                        </p>

                        <Field
                            label="Current password"
                            required
                            error={errors.currentPassword}
                            className="mt-3"
                        >
                            {(props) => (
                                <PasswordField
                                    value={currentPassword}
                                    onChange={(event) => setCurrentPassword(event.target.value)}
                                    autoComplete="current-password"
                                    {...props}
                                />
                            )}
                        </Field>
                    </div>
                )}
            </form>
        </Sheet>
    );
};

export default EditProfileSheet;
