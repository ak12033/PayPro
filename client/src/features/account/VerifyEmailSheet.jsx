import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Sheet from '../../components/ui/Sheet';
import Button from '../../components/ui/Button';
import OtpField from '../../components/forms/OtpField';
import { useAuth } from '../../context/AuthContext';
import { authApi } from '../../services/api/endpoints/authApi';
import { getErrorMessage } from '../../utils/errors';

/**
 * Confirm the account's email address (plan.md §31.2.7).
 *
 * Signup already sent a code, so the sheet opens straight onto the input
 * rather than a "send me a code" step — the user most likely has the email in
 * front of them. Resending is one tap below it.
 *
 * On success the profile is updated in place: the server's check is read
 * fresh on every request, so the very next "Send" works without re-signing in,
 * and the UI should not claim otherwise by waiting on a refetch.
 */
const VerifyEmailSheet = ({ open, onClose, onVerified }) => {
    const { user, setUser } = useAuth();
    const [code, setCode] = useState('');
    const [error, setError] = useState(null);
    const [verifying, setVerifying] = useState(false);
    const [resending, setResending] = useState(false);

    useEffect(() => {
        if (!open) {
            setCode('');
            setError(null);
        }
    }, [open]);

    const verify = async (value = code) => {
        if (value.length !== 6 || verifying) return;
        setVerifying(true);
        setError(null);
        try {
            await authApi.verifyEmail({ otp: value });
            setUser((current) => (current ? { ...current, emailVerified: true } : current));
            toast.success('Email verified.');
            onVerified?.();
            onClose();
        } catch (caught) {
            setError(getErrorMessage(caught, 'That code did not work.'));
        } finally {
            setVerifying(false);
        }
    };

    const resend = async () => {
        setResending(true);
        setError(null);
        try {
            const { data } = await authApi.sendEmailVerification();
            if (data.emailVerified) {
                setUser((current) => (current ? { ...current, emailVerified: true } : current));
                onVerified?.();
                onClose();
                return;
            }
            toast.success(data.message ?? 'A new code is on its way.');
        } catch (caught) {
            toast.error(getErrorMessage(caught, 'Could not send a new code.'));
        } finally {
            setResending(false);
        }
    };

    return (
        <Sheet
            open={open}
            onClose={onClose}
            title="Verify your email"
            description={user?.email ? `Enter the 6-digit code we sent to ${user.email}.` : undefined}
            size="sm"
            dismissible={!verifying}
            footer={
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                    <Button variant="ghost" onClick={resend} loading={resending} disabled={verifying}>
                        Send a new code
                    </Button>
                    <Button variant="primary" onClick={() => verify()} loading={verifying} disabled={code.length !== 6}>
                        Verify
                    </Button>
                </div>
            }
        >
            <div className="space-y-3">
                <p className="text-sm leading-6 text-text-muted">
                    Confirming your address lets you send and add money. It proves the account belongs to whoever
                    owns this inbox — the place your security codes and payment alerts go.
                </p>
                <OtpField
                    value={code}
                    onChange={setCode}
                    onSubmit={verify}
                    error={error}
                    disabled={verifying}
                />
            </div>
        </Sheet>
    );
};

export default VerifyEmailSheet;
