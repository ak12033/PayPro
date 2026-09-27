import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronRight, LogOut, ShieldCheck, UserPen, Download, UserX, LifeBuoy, LayoutDashboard, Smartphone, BadgeCheck } from 'lucide-react';
import PageHeader, { SectionHeading } from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Avatar from '../../components/ui/Avatar';
import IconBadge from '../../components/ui/IconBadge';
import Switch from '../../components/ui/Switch';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { ConfirmSheet } from '../../components/ui/Sheet';
import Field, { Input } from '../../components/ui/Field';
import EditProfileSheet from '../../features/account/EditProfileSheet';
import NotificationPreferencesSheet from '../../features/account/NotificationPreferencesSheet';
import AuthenticatorSheet from '../../features/account/AuthenticatorSheet';
import { PUSH_CATEGORIES, describeQuietHours } from '../../features/account/notificationCategories';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { useTheme } from '../../app/theme/ThemeProvider';
import { userApi } from '../../services/api/endpoints/userApi';
import { transactionApi } from '../../services/api/endpoints/transactionApi';
import { getErrorMessage } from '../../utils/errors';
import { downloadBlob } from '../../lib/downloadBlob';
import { ROUTES } from '../../constants/routes';
import { APP_NAME } from '../../constants/app';
import { isStaff, ROLE_LABEL } from '../../constants/admin';

/**
 * Account.
 *
 * Replaces a 481-line "Update profile" page that combined, on one screen with
 * no visual separation: name editing, email editing, password changing,
 * notification preferences and 2FA toggles. Changing your display name and
 * disabling the security control that guards your money were adjacent form
 * fields of equal weight.
 *
 * The regrouping follows how risky each thing is:
 *
 *   Identity (name, email, password) — behind a sheet, and the two dangerous
 *   fields there are gated on the current password, which the server already
 *   enforces and the UI should not pretend otherwise.
 *
 *   Notifications — safe, instant, toggled in place.
 *
 *   Security — its own screen. It is the only group where the consequence of a
 *   wrong setting is losing money rather than losing convenience.
 *
 *   Appearance — genuinely trivial, so it sits at the bottom where trivia goes.
 */
const Account = () => {
    const { user, userName, logout, fetchDashboardData } = useAuth();
    const { pushPermission, enablePush } = useNotifications();
    const { preference, setTheme } = useTheme();

    const [editing, setEditing] = useState(false);
    const [confirmLogout, setConfirmLogout] = useState(false);
    const [pendingKey, setPendingKey] = useState(null);
    const [preferences, setPreferences] = useState(() => user?.preferences ?? {});
    const [exporting, setExporting] = useState(false);
    const [closing, setClosing] = useState(false);
    const [confirmClose, setConfirmClose] = useState(false);
    const [closePassword, setClosePassword] = useState('');
    const [notificationSheetOpen, setNotificationSheetOpen] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();
    const [authenticatorOpen, setAuthenticatorOpen] = useState(false);

    // `?setup=authenticator` is where the console sends staff who have not
    // enrolled yet (requireStaffTotp → TOTP_ENROLMENT_REQUIRED).
    useEffect(() => {
        if (searchParams.get('setup') === 'authenticator') setAuthenticatorOpen(true);
    }, [searchParams]);

    const closeAuthenticator = () => {
        setAuthenticatorOpen(false);
        if (searchParams.has('setup')) setSearchParams({}, { replace: true });
    };

    // Keep local state in step when the profile refetches (a socket
    // `profile_updated` event, or a save from the edit sheet).
    React.useEffect(() => {
        if (user?.preferences) setPreferences(user.preferences);
    }, [user?.preferences]);

    /**
     * Optimistic, but reverted on failure.
     *
     * These toggles include security controls. Showing "transaction 2FA is off"
     * because a request failed would tell the user they had removed a
     * protection that is in fact still active — or worse, the reverse. The
     * pending state and the revert are what make the switch honest.
     */
    const updatePreference = async (key, value) => {
        const previous = preferences[key];
        setPreferences((current) => ({ ...current, [key]: value }));
        setPendingKey(key);

        try {
            const { data } = await userApi.updateSettings({ [key]: value });
            setPreferences(data.preferences ?? { ...preferences, [key]: value });
        } catch (caught) {
            setPreferences((current) => ({ ...current, [key]: previous }));
            toast.error(getErrorMessage(caught, 'Could not save that setting.'));
        } finally {
            setPendingKey(null);
        }
    };

    /**
     * Push is two separate permissions and the switch has to satisfy both.
     *
     * The server preference decides whether we *send* a push; the browser
     * permission decides whether this device can *receive* one. The toggle used
     * to set only the first, so a user could turn push on, save it happily, and
     * never receive anything — the browser had never been asked. Turning it on
     * now asks the browser too, from this tap, which is the only context in
     * which Safari will show the prompt at all.
     */
    const updatePushPreference = async (value) => {
        if (!value) {
            await updatePreference('pushNotifications', false);
            return;
        }

        setPendingKey('pushNotifications');
        const outcome = await enablePush();
        setPendingKey(null);

        if (outcome === 'granted') {
            await updatePreference('pushNotifications', true);
            return;
        }

        if (outcome === 'denied') {
            toast.error('Notifications are blocked in your browser settings for this site.');
        } else if (outcome === 'unsupported') {
            toast.error('This browser cannot show push notifications.');
        } else {
            toast('Notifications were not enabled.');
        }
    };

    const pushBlocked = pushPermission === 'denied' || pushPermission === 'unsupported';

    const handleExportData = async () => {
        setExporting(true);
        try {
            const { data } = await userApi.exportData();
            downloadBlob(
                data,
                `paypro-data-export-${new Date().toISOString().slice(0, 10)}.json`,
                'application/json'
            );
        } catch (caught) {
            toast.error(getErrorMessage(caught, 'Could not export your data.'));
        } finally {
            setExporting(false);
        }
    };

    const handleDownloadStatement = async () => {
        setPendingKey('statement');
        try {
            const month = new Date().toISOString().slice(0, 7);
            const { data } = await transactionApi.getStatement({ month, format: 'pdf' });
            downloadBlob(data, `paypro-statement-${month}.pdf`, 'application/pdf');
        } catch (caught) {
            toast.error(getErrorMessage(caught, 'Could not download your statement.'));
        } finally {
            setPendingKey(null);
        }
    };

    const handleCloseAccount = async () => {
        if (!closePassword) {
            toast.error('Enter your current password to close your account.');
            return;
        }
        setClosing(true);
        try {
            await userApi.closeAccount({ currentPassword: closePassword });
            toast.success('Your account has been closed.');
            logout();
        } catch (caught) {
            toast.error(getErrorMessage(caught, 'Could not close your account.'));
        } finally {
            setClosing(false);
        }
    };

    return (
        <>
            <PageHeader title="Account" />

            <div className="space-y-6">
                {/* ----------------------------------------------- identity */}
                <Card>
                    <div className="flex items-center gap-3">
                        <Avatar name={userName} size="xl" />
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-base font-semibold text-text">
                                {[user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
                                    'Your account'}
                            </p>
                            <p className="truncate text-sm text-text-muted">{user?.email}</p>
                        </div>
                    </div>

                    <Button
                        variant="secondary"
                        fullWidth
                        className="mt-4"
                        icon={<UserPen size={16} />}
                        onClick={() => setEditing(true)}
                    >
                        Edit profile
                    </Button>
                </Card>

                {/* ----------------------------------------------- security */}
                <section>
                    <SectionHeading title="Security" />
                    <Link to={ROUTES.SECURITY} className="block">
                        <Card padding="md" className="transition-colors hover:bg-surface-hover">
                            <div className="flex items-center gap-3">
                                <IconBadge icon={<ShieldCheck size={17} />} tone="positive" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-text">Security centre</p>
                                    <p className="text-xs text-text-muted">
                                        Devices, sign-in history, and account protections
                                    </p>
                                </div>
                                <ChevronRight size={16} className="shrink-0 text-text-muted" aria-hidden="true" />
                            </div>
                        </Card>
                    </Link>
                    <button type="button" onClick={() => setAuthenticatorOpen(true)} className="mt-2 block w-full text-left">
                        <Card padding="md" className="transition-colors hover:bg-surface-hover">
                            <div className="flex items-center gap-3">
                                <IconBadge icon={<Smartphone size={17} />} tone={user?.totpEnabled ? 'positive' : 'accent'} />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-text">Authenticator app</p>
                                    <p className="text-xs text-text-muted">
                                        {user?.totpEnabled
                                            ? 'On: codes come from your phone'
                                            : isStaff(user?.role)
                                              ? 'Required for the operations console'
                                              : 'Off: codes are emailed to you'}
                                    </p>
                                </div>
                                <ChevronRight size={16} className="shrink-0 text-text-muted" aria-hidden="true" />
                            </div>
                        </Card>
                    </button>
                    <Link to={ROUTES.VERIFICATION} className="mt-2 block">
                        <Card padding="md" className="transition-colors hover:bg-surface-hover">
                            <div className="flex items-center gap-3">
                                <IconBadge icon={<BadgeCheck size={17} />} tone={user?.kycTier && user.kycTier !== 'unverified' ? 'positive' : 'accent'} />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-text">Identity verification</p>
                                    <p className="text-xs text-text-muted">
                                        {user?.kycTier && user.kycTier !== 'unverified'
                                            ? 'Verified: higher limits and bank withdrawals'
                                            : 'Raise your limits and withdraw to your bank'}
                                    </p>
                                </div>
                                <ChevronRight size={16} className="shrink-0 text-text-muted" aria-hidden="true" />
                            </div>
                        </Card>
                    </Link>
                    <AuthenticatorSheet open={authenticatorOpen} onClose={closeAuthenticator} />
                </section>

                {/* ---------------------------------------- operations (staff) */}
                {/* The console's only entry point on a phone, where the sidebar
                    does not exist and the tab bar is full at four. */}
                {isStaff(user?.role) && (
                    <section>
                        <SectionHeading title="Operations" />
                        <Link to={ROUTES.ADMIN} className="block">
                            <Card padding="md" className="transition-colors hover:bg-surface-hover">
                                <div className="flex items-center gap-3">
                                    <IconBadge icon={<LayoutDashboard size={17} />} tone="warning" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-text">Operations console</p>
                                        <p className="text-xs text-text-muted">
                                            {ROLE_LABEL[user.role]} tools: queues, users and reconciliation
                                        </p>
                                    </div>
                                    <ChevronRight size={16} className="shrink-0 text-text-muted" aria-hidden="true" />
                                </div>
                            </Card>
                        </Link>
                    </section>
                )}

                {/* --------------------------------------------------- help */}
                <section>
                    <SectionHeading title="Help" />
                    <Link to={ROUTES.SUPPORT} className="block">
                        <Card padding="md" className="transition-colors hover:bg-surface-hover">
                            <div className="flex items-center gap-3">
                                <IconBadge icon={<LifeBuoy size={17} />} tone="accent" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-text">Get help</p>
                                    <p className="text-xs text-text-muted">
                                        Common questions, and a way to reach us
                                    </p>
                                </div>
                                <ChevronRight size={16} className="shrink-0 text-text-muted" aria-hidden="true" />
                            </div>
                        </Card>
                    </Link>
                </section>

                {/* ------------------------------------------ notifications */}
                <section>
                    <SectionHeading title="Notifications" />
                    <Card padding="md">
                        <div className="divide-y divide-border">
                            <Switch
                                label="Push notifications"
                                description={
                                    pushPermission === 'denied'
                                        ? 'Blocked in your browser settings for this site. Allow notifications there first.'
                                        : pushPermission === 'unsupported'
                                          ? 'This browser cannot show push notifications.'
                                          : 'Alerts on this device when money moves, even when PayPro is closed.'
                                }
                                checked={
                                    Boolean(preferences.pushNotifications) &&
                                    pushPermission === 'granted'
                                }
                                disabled={pushBlocked}
                                pending={pendingKey === 'pushNotifications'}
                                onChange={updatePushPreference}
                            />
                            <Switch
                                label="Email alerts"
                                description="Receipts and security notices by email."
                                checked={Boolean(preferences.emailAlerts)}
                                pending={pendingKey === 'emailAlerts'}
                                onChange={(value) => updatePreference('emailAlerts', value)}
                            />
                            <Switch
                                label="Budget alerts"
                                description="Notify me when I'm getting close to a budget limit."
                                checked={Boolean(preferences.budgetAlerts)}
                                pending={pendingKey === 'budgetAlerts'}
                                onChange={(value) => updatePreference('budgetAlerts', value)}
                            />
                            <button
                                type="button"
                                onClick={() => setNotificationSheetOpen(true)}
                                className="flex w-full items-center justify-between gap-4 py-3 text-left"
                            >
                                <span className="min-w-0">
                                    <span className="block text-sm font-medium text-text">Alert types &amp; quiet hours</span>
                                    <span className="mt-0.5 block text-xs leading-5 text-text-muted">
                                        {notificationSummary(preferences)}
                                    </span>
                                </span>
                                <ChevronRight size={16} className="shrink-0 text-text-muted" aria-hidden="true" />
                            </button>
                        </div>
                    </Card>
                </section>

                <NotificationPreferencesSheet
                    open={notificationSheetOpen}
                    onClose={() => setNotificationSheetOpen(false)}
                    preferences={preferences}
                    onSaved={setPreferences}
                    masterPushOn={Boolean(preferences.pushNotifications)}
                />

                {/* --------------------------------------------- appearance */}
                <section>
                    <SectionHeading title="Appearance" />
                    <Card padding="md">
                        {/*
                         * Stacks below the label on narrow screens.
                         *
                         * Side by side at every width, the three-option control
                         * could not shrink past its content and the last option
                         * was clipped by the card edge on a phone — so "Auto",
                         * the default, was the one you could not read.
                         */}
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-text">Theme</p>
                                <p className="mt-0.5 text-xs text-text-muted">
                                    "Auto" follows your device setting.
                                </p>
                            </div>
                            <SegmentedControl
                                label="Theme"
                                size="sm"
                                value={preference}
                                onChange={setTheme}
                                className="w-full sm:w-auto"
                                options={[
                                    { value: 'light', label: 'Light' },
                                    { value: 'dark', label: 'Dark' },
                                    { value: 'system', label: 'Auto' },
                                ]}
                            />
                        </div>
                    </Card>
                </section>

                {/* ------------------------------------------- data & privacy */}
                <section>
                    <SectionHeading title="Data & privacy" />
                    <Card padding="md" className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-text">Export your data</p>
                                <p className="mt-0.5 text-xs leading-5 text-text-muted">
                                    Download a copy of your profile, transactions, budgets and goals.
                                </p>
                            </div>
                            <Button
                                variant="secondary"
                                size="sm"
                                icon={<Download size={15} />}
                                loading={exporting}
                                onClick={handleExportData}
                            >
                                Export
                            </Button>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-text">This month's statement</p>
                                <p className="mt-0.5 text-xs leading-5 text-text-muted">
                                    A PDF summary of this month's transactions.
                                </p>
                            </div>
                            <Button
                                variant="secondary"
                                size="sm"
                                icon={<Download size={15} />}
                                loading={pendingKey === 'statement'}
                                onClick={handleDownloadStatement}
                            >
                                Download
                            </Button>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-text">Close account</p>
                                <p className="mt-0.5 text-xs leading-5 text-text-muted">
                                    Your transaction history is retained for financial record-keeping; everything else is removed.
                                </p>
                            </div>
                            <Button
                                variant="secondary"
                                size="sm"
                                icon={<UserX size={15} />}
                                onClick={() => setConfirmClose(true)}
                            >
                                Close account
                            </Button>
                        </div>
                    </Card>
                </section>

                {/* ------------------------------------------------- sign out */}
                <Button
                    variant="secondary"
                    fullWidth
                    icon={<LogOut size={16} />}
                    onClick={() => setConfirmLogout(true)}
                >
                    Sign out
                </Button>

                <p className="pb-2 text-center text-xs text-text-muted">
                    {APP_NAME} · Your money is held in your wallet balance
                </p>
            </div>

            <EditProfileSheet
                open={editing}
                onClose={() => setEditing(false)}
                user={user}
                onSaved={fetchDashboardData}
            />

            <ConfirmSheet
                open={confirmLogout}
                onClose={() => setConfirmLogout(false)}
                onConfirm={logout}
                title="Sign out?"
                description="You will need to sign in again on this device."
                confirmLabel="Sign out"
            />

            <ConfirmSheet
                open={confirmClose}
                onClose={() => { setConfirmClose(false); setClosePassword(''); }}
                onConfirm={handleCloseAccount}
                title="Close your account?"
                description="This cannot be undone. Enter your current password to confirm."
                confirmLabel="Close account"
                variant="danger"
                loading={closing}
            >
                <Field label="Current password" required>
                    {(props) => (
                        <Input
                            {...props}
                            type="password"
                            autoComplete="current-password"
                            value={closePassword}
                            onChange={(e) => setClosePassword(e.target.value)}
                        />
                    )}
                </Field>
            </ConfirmSheet>
        </>
    );
};

/** One line under the row: what is muted, and when it's quiet. */
const notificationSummary = (preferences) => {
    const muted = PUSH_CATEGORIES.filter((c) => preferences.pushCategories?.[c.key] === false).length;
    const quiet = describeQuietHours(preferences.quietHours);
    const parts = [
        muted === 0 ? 'All alert types on' : `${muted} alert type${muted === 1 ? '' : 's'} muted`,
        quiet ? `quiet ${quiet}` : null,
    ].filter(Boolean);
    return parts.join(' · ');
};

export default Account;
