import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronRight, LogOut, ShieldCheck, UserPen } from 'lucide-react';
import PageHeader, { SectionHeading } from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Avatar from '../../components/ui/Avatar';
import Switch from '../../components/ui/Switch';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { ConfirmSheet } from '../../components/ui/Sheet';
import EditProfileSheet from '../../features/account/EditProfileSheet';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { useTheme } from '../../app/theme/ThemeProvider';
import { userApi } from '../../services/api/endpoints/userApi';
import { getErrorMessage } from '../../utils/errors';
import { ROUTES } from '../../constants/routes';
import { APP_NAME } from '../../constants/app';

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
                                <span
                                    aria-hidden="true"
                                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-positive-soft text-positive"
                                >
                                    <ShieldCheck size={17} />
                                </span>
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
                        </div>
                    </Card>
                </section>

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
        </>
    );
};

export default Account;
