import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Laptop, LogOut, ShieldCheck, ShieldOff, Smartphone, Tablet } from 'lucide-react';
import PageHeader, { SectionHeading } from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { ConfirmSheet } from '../../components/ui/Sheet';
import { SkeletonRows } from '../../components/ui/Skeleton';
import EmptyState from '../../components/feedback/EmptyState';
import ErrorState from '../../components/feedback/ErrorState';
import SecurityScore from '../../features/security/SecurityScore';
import useQuery from '../../hooks/useQuery';
import { useAuth } from '../../context/AuthContext';
import { securityApi } from '../../services/api/endpoints/securityApi';
import { getErrorMessage } from '../../utils/errors';
import { describeAuditAction } from '../../constants/audit';
import { describeDevice, formatRelativeTime, getDeviceKind } from '../../utils/formatters';
import { ROUTES } from '../../constants/routes';
import cn from '../../lib/cn';

/**
 * Security centre.
 *
 * Entirely new on the frontend, and entirely backed by endpoints that already
 * existed. `/security/sessions`, `/security/login-history` and
 * `/auth/logout-all` have been live this whole time and nothing in the UI ever
 * called them. A user could not see where they were signed in, could not sign
 * out a laptop they had lost, and could not see that someone had been failing
 * password attempts against their account — while the server was diligently
 * recording all three.
 *
 * That is the highest-value thing in this redesign, and it is not a design
 * problem at all: the capability was there, it just had no surface.
 *
 * The page is ordered by what a worried user needs, in order: *am I set up
 * safely* (checklist), *who is signed in right now* (sessions, with a revoke
 * button), *has anything odd happened* (history), and *the emergency lever*
 * (sign out everywhere).
 */
const DEVICE_ICONS = { mobile: Smartphone, tablet: Tablet, desktop: Laptop };

const Security = () => {
    const { user, logout } = useAuth();
    const [revoking, setRevoking] = useState(null);
    const [untrusting, setUntrusting] = useState(null);
    const [confirmLogoutAll, setConfirmLogoutAll] = useState(false);
    const [busy, setBusy] = useState(false);

    const sessions = useQuery(async () => (await securityApi.getSessions()).data);
    const devices = useQuery(async () => (await securityApi.getTrustedDevices()).data);
    const history = useQuery(
        async () => (await securityApi.getLoginHistory({ limit: 15 })).data
    );

    const checks = useMemo(() => {
        // Read inside the memo: `user?.preferences ?? {}` computed outside it is
        // a new object literal on every render whenever preferences is absent,
        // which defeats the memo entirely.
        const preferences = user?.preferences ?? {};

        return [
            {
                id: 'transaction-2fa',
                label: 'Confirm transfers with a code',
                description:
                    'Require an emailed code before money leaves your wallet. The single most effective protection here.',
                done: Boolean(preferences.transaction2FA),
                to: ROUTES.ACCOUNT,
            },
            {
                id: 'login-2fa',
                label: 'Verify new sign-ins',
                description: 'Ask for a code when signing in from a new device.',
                done: Boolean(preferences.twoFactorAuth),
                to: ROUTES.ACCOUNT,
            },
            {
                id: 'email-alerts',
                label: 'Email me about account activity',
                description: 'Get told when your password changes or a transfer is sent.',
                done: Boolean(preferences.emailAlerts),
                to: ROUTES.ACCOUNT,
            },
            {
                id: 'passkeys',
                label: 'Sign in with a passkey',
                description:
                    'Use your fingerprint, face or device PIN instead of a password. Phishing-resistant by design.',
                done: false,
                comingSoon: true,
            },
        ];
    }, [user?.preferences]);

    const revokeSession = async () => {
        if (!revoking) return;
        setBusy(true);

        try {
            await securityApi.revokeSession(revoking.id);
            toast.success('Device signed out');
            sessions.refresh();
        } catch (caught) {
            toast.error(getErrorMessage(caught, 'Could not sign that device out.'));
        } finally {
            setBusy(false);
            setRevoking(null);
        }
    };

    const untrustDevice = async () => {
        if (!untrusting) return;
        setBusy(true);

        try {
            await securityApi.revokeTrustedDevice(untrusting.id);
            toast.success('Device removed');
            devices.refresh();
        } catch (caught) {
            toast.error(getErrorMessage(caught, 'Could not remove that device.'));
        } finally {
            setBusy(false);
            setUntrusting(null);
        }
    };

    const logoutEverywhere = async () => {
        setBusy(true);
        try {
            await securityApi.logoutEverywhere();
            // This device is included, so the only correct next step is to end
            // the local session too. Leaving the user on a screen backed by a
            // revoked token produces a confusing cascade of 401s.
            await logout();
        } catch (caught) {
            toast.error(getErrorMessage(caught, 'Could not sign out everywhere.'));
            setBusy(false);
            setConfirmLogoutAll(false);
        }
    };

    const sessionList = sessions.data?.sessions ?? [];
    const deviceList = devices.data?.devices ?? [];
    const historyEntries = history.data?.entries ?? [];

    return (
        <>
            <PageHeader
                title="Security"
                subtitle="Review how your account is protected and where you are signed in."
                back={ROUTES.ACCOUNT}
            />

            <div className="space-y-6">
                <SecurityScore checks={checks} />

                {/* ------------------------------------------------ devices */}
                <section aria-labelledby="devices-heading">
                    <SectionHeading id="devices-heading" title="Signed-in devices" />

                    <Card padding="sm">
                        {sessions.loading ? (
                            <SkeletonRows count={2} />
                        ) : sessions.error ? (
                            <ErrorState
                                title="Could not load your devices"
                                message={sessions.error}
                                reassurance="Your account is still protected."
                                onRetry={sessions.retry}
                            />
                        ) : sessionList.length === 0 ? (
                            <EmptyState
                                icon={<Laptop size={20} />}
                                title="No other devices"
                                description="You are only signed in here."
                            />
                        ) : (
                            <ul className="divide-y divide-border">
                                {sessionList.map((session) => {
                                    const DeviceIcon =
                                        getDeviceKind(session.device) === 'mobile' ? Smartphone : Laptop;

                                    return (
                                    <li
                                        key={session.id}
                                        className="flex items-center gap-3 px-2 py-3"
                                    >
                                        <span
                                            aria-hidden="true"
                                            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-sunken text-text-secondary"
                                        >
                                            <DeviceIcon size={16} />
                                        </span>

                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="text-sm font-medium text-text">
                                                    {describeDevice(session.device)}
                                                </p>
                                                {session.isCurrent && (
                                                    <Badge tone="positive" size="sm">
                                                        This device
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="mt-0.5 text-xs text-text-muted">
                                                {session.ip} · signed in{' '}
                                                {formatRelativeTime(session.signedInAt)}
                                            </p>
                                        </div>

                                        {/* No revoke button on the current
                                            session: tapping it would sign the
                                            user out of the page they are
                                            standing on, which reads as a crash
                                            rather than an intentional action.
                                            "Sign out everywhere" below is the
                                            deliberate version of that. */}
                                        {!session.isCurrent && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setRevoking(session)}
                                            >
                                                Sign out
                                            </Button>
                                        )}
                                    </li>
                                    );
                                })}
                            </ul>
                        )}
                    </Card>
                </section>

                {/* ---------------------------------------- trusted devices */}
                <section aria-labelledby="trusted-heading">
                    <SectionHeading id="trusted-heading" title="Recognised devices" />

                    <p className="mb-2.5 text-xs leading-5 text-text-muted">
                        These devices skip the emailed code when you sign in. Remove any you do not
                        recognise, or that you no longer use.
                    </p>

                    <Card padding="sm">
                        {devices.loading ? (
                            <SkeletonRows count={2} />
                        ) : devices.error ? (
                            <ErrorState
                                title="Could not load your devices"
                                message={devices.error}
                                reassurance="Your account is still protected."
                                onRetry={devices.retry}
                            />
                        ) : deviceList.length === 0 ? (
                            <EmptyState
                                icon={<ShieldCheck size={20} />}
                                title="No recognised devices"
                                description="You will be asked for a code every time you sign in."
                            />
                        ) : (
                            <ul className="divide-y divide-border">
                                {deviceList.map((device) => {
                                    const DeviceIcon = DEVICE_ICONS[device.deviceType] ?? Laptop;

                                    return (
                                        <li key={device.id} className="flex items-center gap-3 px-2 py-3">
                                            <span
                                                aria-hidden="true"
                                                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-sunken text-text-secondary"
                                            >
                                                <DeviceIcon size={16} />
                                            </span>

                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <p className="text-sm font-medium text-text">
                                                        {device.name}
                                                    </p>
                                                    {device.trusted ? (
                                                        <Badge tone="positive" size="sm">Trusted</Badge>
                                                    ) : device.trustExpired ? (
                                                        // Trust lapses after a long gap. Saying so
                                                        // explains a code prompt on a device the
                                                        // user considers theirs.
                                                        <Badge tone="neutral" size="sm">Trust expired</Badge>
                                                    ) : (
                                                        <Badge tone="neutral" size="sm">Not trusted</Badge>
                                                    )}
                                                </div>
                                                <p className="mt-0.5 text-xs text-text-muted">
                                                    {device.lastLocation || 'Unknown location'} · last used{' '}
                                                    {formatRelativeTime(device.lastSeenAt)}
                                                </p>
                                            </div>

                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setUntrusting(device)}
                                            >
                                                Remove
                                            </Button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </Card>
                </section>

                {/* ------------------------------------------------ history */}
                <section aria-labelledby="history-heading">
                    <SectionHeading id="history-heading" title="Recent account activity" />

                    <Card padding="sm">
                        {history.loading ? (
                            <SkeletonRows count={4} />
                        ) : history.error ? (
                            <ErrorState
                                title="Could not load your history"
                                message={history.error}
                                reassurance={null}
                                onRetry={history.retry}
                            />
                        ) : historyEntries.length === 0 ? (
                            <EmptyState
                                icon={<ShieldOff size={20} />}
                                title="Nothing recorded yet"
                                description="Sign-ins and security changes will be listed here."
                            />
                        ) : (
                            <ul className="divide-y divide-border">
                                {historyEntries.map((entry, index) => {
                                    const { label, severity } = describeAuditAction(entry.action);
                                    const failed = entry.outcome === 'failure';

                                    return (
                                        <li
                                            key={`${entry.createdAt}-${index}`}
                                            className="flex items-start gap-3 px-2 py-3"
                                        >
                                            <span
                                                aria-hidden="true"
                                                className={cn(
                                                    'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                                                    severity === 'critical' && 'bg-danger',
                                                    severity === 'warning' && 'bg-warning',
                                                    severity === 'notable' && 'bg-info',
                                                    severity === 'info' && 'bg-border-strong'
                                                )}
                                            />

                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <p className="text-sm text-text">{label}</p>
                                                    {failed && (
                                                        <Badge tone="negative" size="sm">
                                                            Failed
                                                        </Badge>
                                                    )}
                                                </div>
                                                <p className="mt-0.5 text-xs text-text-muted">
                                                    {formatRelativeTime(entry.createdAt)}
                                                    {entry.ip && <> · {entry.ip}</>}
                                                    {entry.userAgent && (
                                                        <> · {describeDevice(entry.userAgent)}</>
                                                    )}
                                                </p>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </Card>
                </section>

                {/* ---------------------------------------------- panic button */}
                <Card className="border-danger/25">
                    <h2 className="text-sm font-semibold text-text">Sign out everywhere</h2>
                    <p className="mt-1 text-sm leading-6 text-text-muted">
                        Ends every session, including this one. Use this if you think someone else
                        has access to your account. You will need to sign in again.
                    </p>
                    <Button
                        variant="danger"
                        className="mt-4"
                        icon={<LogOut size={16} />}
                        onClick={() => setConfirmLogoutAll(true)}
                    >
                        Sign out of all devices
                    </Button>
                </Card>
            </div>

            <ConfirmSheet
                open={Boolean(revoking)}
                onClose={() => setRevoking(null)}
                onConfirm={revokeSession}
                loading={busy}
                variant="danger"
                title="Sign out this device?"
                description={
                    revoking
                        ? `${describeDevice(revoking.device)} will need to sign in again.`
                        : ''
                }
                confirmLabel="Sign out"
            />

            <ConfirmSheet
                open={Boolean(untrusting)}
                onClose={() => setUntrusting(null)}
                onConfirm={untrustDevice}
                loading={busy}
                variant="danger"
                title="Remove this device?"
                description={
                    untrusting
                        ? `${untrusting.name} will need a verification code the next time it signs in. Other devices are not affected.`
                        : ''
                }
                confirmLabel="Remove"
            />

            <ConfirmSheet
                open={confirmLogoutAll}
                onClose={() => setConfirmLogoutAll(false)}
                onConfirm={logoutEverywhere}
                loading={busy}
                variant="danger"
                title="Sign out of all devices?"
                description="Every device, including this one, will be signed out immediately."
                confirmLabel="Sign out everywhere"
            />
        </>
    );
};

export default Security;
