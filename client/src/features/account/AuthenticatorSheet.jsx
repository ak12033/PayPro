import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Copy, Download, KeyRound, ShieldCheck } from 'lucide-react';
import Sheet from '../../components/ui/Sheet';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import QrSvg from '../../components/ui/QrSvg';
import OtpField from '../../components/forms/OtpField';
import PasswordField from '../../components/forms/PasswordField';
import SecondFactorField from '../../components/forms/SecondFactorField';
import { isCompleteFactor } from '../../lib/secondFactor';
import { Field } from '../../components/ui/Field';
import { useAuth } from '../../context/AuthContext';
import { authApi } from '../../services/api/endpoints/authApi';
import { getErrorMessage } from '../../utils/errors';
import { downloadBlob } from '../../lib/downloadBlob';
import { toQrMatrix } from '../../lib/qr';

/**
 * Authenticator app settings (plan.md §31.2.4).
 *
 * Steps, in order: `status` (what is set up, and the actions) → `scan` (QR plus
 * the key for manual entry, then the first code) → `codes` (the recovery codes,
 * shown once). Removing the app and re-issuing codes happen on `confirm`, which
 * asks for the password and a current code.
 *
 * The recovery codes screen cannot be dismissed by accident: those codes are
 * the only way back in without support if the phone is lost, and they are
 * never shown again. "Done" is enabled only once the holder says they saved them.
 */
const AuthenticatorSheet = ({ open, onClose }) => {
    const { user, setUser } = useAuth();
    const [step, setStep] = useState('status');
    const [status, setStatus] = useState(null);
    const [setup, setSetup] = useState(null);
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [recoveryCodes, setRecoveryCodes] = useState(null);
    const [savedCodes, setSavedCodes] = useState(false);
    const [confirming, setConfirming] = useState(null); // 'disable' | 'regenerate'
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!open) return;
        setStep('status');
        setSetup(null);
        setCode('');
        setPassword('');
        setRecoveryCodes(null);
        setSavedCodes(false);
        setConfirming(null);
        setError(null);
        setStatus(null);
        authApi.getTotpStatus()
            .then(({ data }) => setStatus(data))
            .catch((caught) => setError(getErrorMessage(caught, 'Could not load your settings.')));
    }, [open]);

    const matrix = useMemo(() => (setup?.otpauthUri ? toQrMatrix(setup.otpauthUri) : null), [setup]);

    const markEnabled = (enabled) => {
        setUser((current) => (current ? { ...current, totpEnabled: enabled } : current));
    };

    const start = async () => {
        setBusy(true);
        setError(null);
        try {
            const { data } = await authApi.startTotpSetup();
            setSetup(data);
            setCode('');
            setStep('scan');
        } catch (caught) {
            setError(getErrorMessage(caught, 'Could not start setup.'));
        } finally {
            setBusy(false);
        }
    };

    const confirmSetup = async (value = code) => {
        if (value.length !== 6 || busy) return;
        setBusy(true);
        setError(null);
        try {
            const { data } = await authApi.enableTotp({ code: value });
            setRecoveryCodes(data.recoveryCodes);
            setSetup(null);
            markEnabled(true);
            setStep('codes');
        } catch (caught) {
            setError(getErrorMessage(caught, 'That code did not match.'));
            setCode('');
        } finally {
            setBusy(false);
        }
    };

    const submitConfirm = async () => {
        if (!password || !isCompleteFactor(code) || busy) return;
        setBusy(true);
        setError(null);
        try {
            if (confirming === 'disable') {
                await authApi.disableTotp({ currentPassword: password, code });
                markEnabled(false);
                toast.success('Authenticator app removed. Codes will be emailed to you.');
                onClose();
            } else {
                const { data } = await authApi.regenerateRecoveryCodes({ currentPassword: password, code });
                setRecoveryCodes(data.recoveryCodes);
                setSavedCodes(false);
                setStep('codes');
            }
        } catch (caught) {
            setError(getErrorMessage(caught, 'That did not work.'));
            setCode('');
        } finally {
            setBusy(false);
        }
    };

    const codesText = recoveryCodes
        ? `PayPro recovery codes for ${user?.email ?? 'your account'}\nEach code works once.\n\n${recoveryCodes.join('\n')}\n`
        : '';

    const copyCodes = async () => {
        try {
            await navigator.clipboard.writeText(codesText);
            toast.success('Copied');
        } catch {
            toast.error('Could not copy. Download them instead.');
        }
    };

    // ------------------------------------------------------------- recovery codes
    if (step === 'codes') {
        return (
            <Sheet
                open={open}
                onClose={savedCodes ? onClose : undefined}
                dismissible={savedCodes}
                title="Save your recovery codes"
                description="If you lose your phone, each of these gets you in once. They will not be shown again."
                size="sm"
                footer={
                    <Button variant="primary" fullWidth disabled={!savedCodes} onClick={onClose}>
                        Done
                    </Button>
                }
            >
                <ul
                    aria-label="Recovery codes"
                    className="grid grid-cols-2 gap-2 rounded-card bg-surface-sunken p-3 font-mono text-sm text-text"
                >
                    {recoveryCodes.map((c) => <li key={c} className="text-center">{c}</li>)}
                </ul>
                <div className="mt-3 flex gap-2">
                    <Button variant="secondary" size="sm" icon={<Copy size={14} />} onClick={copyCodes}>
                        Copy
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        icon={<Download size={14} />}
                        onClick={() => downloadBlob(codesText, 'paypro-recovery-codes.txt', 'text/plain')}
                    >
                        Download
                    </Button>
                </div>
                <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-card border border-border px-3 py-3">
                    <input
                        type="checkbox"
                        checked={savedCodes}
                        onChange={(event) => setSavedCodes(event.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-accent"
                    />
                    <span className="text-sm text-text">
                        I have saved these somewhere other than this phone.
                    </span>
                </label>
            </Sheet>
        );
    }

    // ------------------------------------------------------------------- scan
    if (step === 'scan') {
        return (
            <Sheet
                open={open}
                onClose={onClose}
                dismissible={!busy}
                title="Set up your authenticator app"
                description="Scan this with Google Authenticator, Microsoft Authenticator, 1Password or any app that shows 6-digit codes."
                size="sm"
            >
                <div className="flex flex-col items-center gap-3">
                    {matrix && (
                        <div className="rounded-card bg-white p-3">
                            <QrSvg matrix={matrix} size={200} label="Authenticator setup code, as a QR code" />
                        </div>
                    )}
                    <details className="w-full text-sm">
                        <summary className="cursor-pointer text-center font-medium text-accent-text">
                            Can't scan? Enter the key instead
                        </summary>
                        <p className="mt-2 break-all rounded-card bg-surface-sunken px-3 py-2 text-center font-mono text-xs tracking-wider text-text">
                            {setup?.secret?.replace(/(.{4})/g, '$1 ').trim()}
                        </p>
                    </details>
                </div>
                <div className="mt-5">
                    <OtpField
                        label="Then enter the 6-digit code it shows"
                        value={code}
                        onChange={setCode}
                        onSubmit={() => confirmSetup()}
                        error={error}
                        disabled={busy}
                        autoFocus={false}
                    />
                </div>
                <Button variant="primary" fullWidth className="mt-4" loading={busy} disabled={code.length !== 6} onClick={() => confirmSetup()}>
                    Turn on
                </Button>
            </Sheet>
        );
    }

    // ---------------------------------------------------------------- confirm
    if (confirming) {
        const disabling = confirming === 'disable';
        return (
            <Sheet
                open={open}
                onClose={onClose}
                dismissible={!busy}
                title={disabling ? 'Remove authenticator app' : 'Create new recovery codes'}
                description={disabling
                    ? 'Codes will be emailed to you instead, which is less secure.'
                    : 'Your current recovery codes will stop working.'}
                size="sm"
                footer={
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <Button variant="ghost" onClick={() => { setConfirming(null); setError(null); setCode(''); setPassword(''); }} disabled={busy}>
                            Back
                        </Button>
                        <Button
                            variant={disabling ? 'danger' : 'primary'}
                            loading={busy}
                            disabled={!password || !isCompleteFactor(code)}
                            onClick={submitConfirm}
                        >
                            {disabling ? 'Remove' : 'Create new codes'}
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4">
                    <Field label="Current password">
                        {(props) => (
                            <PasswordField
                                {...props}
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                autoComplete="current-password"
                            />
                        )}
                    </Field>
                    <SecondFactorField method="totp" value={code} onChange={setCode} error={error} disabled={busy} />
                </div>
            </Sheet>
        );
    }

    // ----------------------------------------------------------------- status
    return (
        <Sheet
            open={open}
            onClose={onClose}
            title="Authenticator app"
            description="A code from an app on your phone, instead of an emailed code, when a sign-in or transfer needs a second step."
            size="sm"
        >
            {!status && !error && <div className="flex justify-center py-6"><Spinner /></div>}
            {error && !status && <p role="alert" className="text-sm text-danger">{error}</p>}

            {status && !status.enabled && (
                <div className="space-y-4">
                    {status.required && (
                        <p className="rounded-card border border-warning/30 bg-warning-soft px-3 py-2.5 text-sm text-text-secondary">
                            Staff accounts need an authenticator app before they can use the operations console.
                        </p>
                    )}
                    <p className="text-sm leading-6 text-text-secondary">
                        An emailed code is only as safe as your email account. A code from your phone
                        means someone who gets into your inbox still cannot sign in or send money.
                    </p>
                    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
                    <Button variant="primary" fullWidth icon={<ShieldCheck size={16} />} loading={busy} onClick={start}>
                        Set up authenticator app
                    </Button>
                </div>
            )}

            {status?.enabled && (
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm text-text">
                        <ShieldCheck size={16} className="text-positive" aria-hidden="true" />
                        On since {new Date(status.enabledAt).toLocaleDateString()}
                    </div>
                    <p className={`text-sm ${status.recoveryCodesRemaining <= 2 ? 'text-warning' : 'text-text-muted'}`}>
                        {status.recoveryCodesRemaining} of 10 recovery codes left.
                    </p>
                    <div className="flex flex-col gap-2">
                        <Button variant="secondary" icon={<KeyRound size={16} />} onClick={() => { setConfirming('regenerate'); setError(null); }}>
                            Create new recovery codes
                        </Button>
                        {status.required ? (
                            <p className="text-xs leading-5 text-text-muted">
                                Staff accounts cannot remove their authenticator. If you are replacing your
                                phone, ask an admin to reset it.
                            </p>
                        ) : (
                            <Button variant="ghost" className="text-danger" onClick={() => { setConfirming('disable'); setError(null); }}>
                                Remove authenticator app
                            </Button>
                        )}
                    </div>
                </div>
            )}
        </Sheet>
    );
};

export default AuthenticatorSheet;
