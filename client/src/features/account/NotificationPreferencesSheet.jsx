import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { ShieldCheck } from 'lucide-react';
import Sheet from '../../components/ui/Sheet';
import Switch from '../../components/ui/Switch';
import Field, { Select } from '../../components/ui/Field';
import { userApi } from '../../services/api/endpoints/userApi';
import { getErrorMessage } from '../../utils/errors';
import { DEFAULT_QUIET_HOURS, PUSH_CATEGORIES, hourLabel } from './notificationCategories';

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/**
 * Which pushes arrive, and when (plan.md §26.2.4, §26.2.5).
 *
 * Every change saves on its own and reverts if the save fails, the same honesty
 * rule as the switches on Account: a switch that says "off" must mean the
 * server agrees. Muted and quiet-hours notifications are still written to the
 * in-app panel — the copy says so, because "I turned budgets off" should not
 * read as "PayPro stopped tracking my budget".
 */
const NotificationPreferencesSheet = ({ open, onClose, preferences, onSaved, masterPushOn }) => {
    const [pending, setPending] = useState(null);
    const categories = preferences?.pushCategories ?? {};
    const quiet = { ...DEFAULT_QUIET_HOURS, ...(preferences?.quietHours ?? {}) };

    const save = async (key, patch, optimistic) => {
        const previous = preferences;
        onSaved(optimistic);
        setPending(key);
        try {
            const { data } = await userApi.updateSettings(patch);
            if (data?.preferences) onSaved(data.preferences);
        } catch (caught) {
            onSaved(previous);
            toast.error(getErrorMessage(caught, 'Could not save that setting.'));
        } finally {
            setPending(null);
        }
    };

    const setCategory = (key, value) => save(
        `category:${key}`,
        { pushCategories: { [key]: value } },
        { ...preferences, pushCategories: { ...categories, [key]: value } }
    );

    const setQuiet = (patch) => save(
        'quiet',
        { quietHours: patch },
        { ...preferences, quietHours: { ...quiet, ...patch } }
    );

    return (
        <Sheet
            open={open}
            onClose={onClose}
            title="Notification preferences"
            description="Choose which alerts reach this device, and when."
            size="md"
        >
            <div className="space-y-6">
                {!masterPushOn && (
                    <p className="rounded-control bg-surface-sunken p-3 text-xs leading-5 text-text-muted">
                        Push notifications are off on Account, so none of these will be pushed until you turn them on there.
                    </p>
                )}

                <section>
                    <h3 className="text-sm font-semibold text-text">Push alerts</h3>
                    <div className="divide-y divide-border">
                        {PUSH_CATEGORIES.map((category) => (
                            <Switch
                                key={category.key}
                                label={category.label}
                                description={category.description}
                                checked={categories[category.key] !== false}
                                pending={pending === `category:${category.key}`}
                                onChange={(value) => setCategory(category.key, value)}
                            />
                        ))}
                    </div>
                    <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-text-muted">
                        <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                        Security alerts — new sign-ins, password and email changes — always arrive and can't be turned off.
                    </p>
                </section>

                <section>
                    <h3 className="text-sm font-semibold text-text">Quiet hours</h3>
                    <Switch
                        label="Hold alerts overnight"
                        description="Non-security alerts wait in your notification panel instead of buzzing this device. India time."
                        checked={Boolean(quiet.enabled)}
                        pending={pending === 'quiet'}
                        onChange={(value) => setQuiet({ enabled: value })}
                    />
                    {quiet.enabled && (
                        <div className="grid grid-cols-2 gap-3 pt-1">
                            <Field label="From">
                                {(props) => (
                                    <Select {...props} value={quiet.start} disabled={pending === 'quiet'} onChange={(event) => setQuiet({ start: Number(event.target.value) })}>
                                        {HOURS.map((hour) => <option key={hour} value={hour}>{hourLabel(hour)}</option>)}
                                    </Select>
                                )}
                            </Field>
                            <Field label="Until">
                                {(props) => (
                                    <Select {...props} value={quiet.end} disabled={pending === 'quiet'} onChange={(event) => setQuiet({ end: Number(event.target.value) })}>
                                        {HOURS.map((hour) => <option key={hour} value={hour}>{hourLabel(hour)}</option>)}
                                    </Select>
                                )}
                            </Field>
                        </div>
                    )}
                    {quiet.enabled && quiet.start === quiet.end && (
                        <p className="mt-2 text-xs text-warning">Pick different start and end times — as set, nothing is held back.</p>
                    )}
                </section>
            </div>
        </Sheet>
    );
};

export default NotificationPreferencesSheet;
