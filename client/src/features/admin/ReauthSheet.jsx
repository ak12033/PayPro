import React, { useEffect, useState } from 'react';
import { ConfirmSheet } from '../../components/ui/Sheet';
import Field, { Input } from '../../components/ui/Field';

/**
 * Confirmation that asks for the acting staff member's own password
 * (plan.md §28.3 rule 4).
 *
 * The server refuses suspend, reactivate and role changes without
 * `currentPassword`; this is the shape of asking for it. The password is
 * cleared whenever the sheet closes, so it never sits in component state
 * behind a dismissed dialog.
 */
const ReauthSheet = ({
    open,
    onClose,
    onConfirm,
    title,
    description,
    confirmLabel,
    variant = 'danger',
    loading = false,
    children,
}) => {
    const [password, setPassword] = useState('');

    useEffect(() => {
        if (!open) setPassword('');
    }, [open]);

    return (
        <ConfirmSheet
            open={open}
            onClose={onClose}
            onConfirm={() => password && onConfirm(password)}
            title={title}
            description={description}
            confirmLabel={confirmLabel}
            variant={variant}
            loading={loading}
        >
            <div className="space-y-4">
                {children}
                <Field label="Your password" hint="Required for this action. It is checked, not stored.">
                    {(props) => (
                        <Input
                            {...props}
                            type="password"
                            autoComplete="current-password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' && password) onConfirm(password);
                            }}
                        />
                    )}
                </Field>
            </div>
        </ConfirmSheet>
    );
};

export default ReauthSheet;
