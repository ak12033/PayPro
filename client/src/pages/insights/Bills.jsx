import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Receipt, Plus } from 'lucide-react';
import LogoMark from '../../components/ui/LogoMark';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import List from '../../components/ui/List';
import Skeleton from '../../components/ui/Skeleton';
import EmptyState from '../../components/feedback/EmptyState';
import ErrorState from '../../components/feedback/ErrorState';
import { ConfirmSheet } from '../../components/ui/Sheet';
import BillRow from '../../features/bills/BillRow';
import BillEditorSheet from '../../features/bills/BillEditorSheet';
import PayBillSheet from '../../features/bills/PayBillSheet';
import { billPaymentApi } from '../../services/api/endpoints/billPaymentApi';
import RecurringList from '../../features/recurring/RecurringList';
import useQuery from '../../hooks/useQuery';
import { billApi } from '../../services/api/endpoints/billApi';
import { recurringApi } from '../../services/api/endpoints/recurringApi';
import { getErrorMessage } from '../../utils/errors';
import { BILL_DISCLAIMER } from '../../constants/recurring';

/**
 * Bills and repeat payments (plan.md §18.3, §19.2).
 *
 * The two live on one screen because they are two views of the same fact: this
 * money goes out regularly. Detection notices it; a bill reminder is the user
 * promoting one of those observations (or their own knowledge) into something
 * that will nudge them.
 *
 * What this screen must never do is imply PayPro pays anything. The disclaimer
 * sits under the heading rather than in a tooltip, and the row action reads
 * "Mark paid".
 */
const Bills = () => {
    const bills = useQuery(async () => (await billApi.list()).data?.bills ?? [], { key: 'bills:list' });
    const recurring = useQuery(async () => (await recurringApi.list('active')).data?.recurring ?? [], { key: 'recurring:active' });
    // Paying through PayPro exists only when a provider does (plan.md §19.3);
    // without one this stays a reminders screen and shows no pay button at all.
    const payments = useQuery(async () => (await billPaymentApi.status()).data, { key: 'bills:payments-status' });
    const [paying, setPaying] = useState(false);

    const [editing, setEditing] = useState(null);
    const [editorOpen, setEditorOpen] = useState(false);
    const [markingPaid, setMarkingPaid] = useState(null);
    const [saving, setSaving] = useState(false);
    const [detecting, setDetecting] = useState(false);

    const openEditor = (bill = null) => {
        setEditing(bill);
        setEditorOpen(true);
    };

    const handleSave = async (payload) => {
        setSaving(true);
        try {
            if (editing) await billApi.update(editing._id, payload);
            else await billApi.create(payload);
            setEditorOpen(false);
            setEditing(null);
            bills.refresh();
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not save this reminder.'));
        } finally {
            setSaving(false);
        }
    };

    const handleMarkPaid = async () => {
        setSaving(true);
        try {
            await billApi.markPaid(markingPaid._id);
            toast.success('Marked as paid.');
            setMarkingPaid(null);
            bills.refresh();
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not update this reminder.'));
        } finally {
            setSaving(false);
        }
    };

    const handleDismissRecurring = async (item) => {
        try {
            await recurringApi.dismiss(item._id);
            recurring.refresh();
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not dismiss this.'));
        }
    };

    const handleDetect = async () => {
        setDetecting(true);
        try {
            await recurringApi.detect();
            recurring.refresh();
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not check for repeat payments.'));
        } finally {
            setDetecting(false);
        }
    };

    const handleSeed = async () => {
        setSaving(true);
        try {
            const { data } = await billApi.seedFromRecurring();
            toast.success(
                data.seeded > 0
                    ? `Added ${data.seeded} reminder${data.seeded === 1 ? '' : 's'}.`
                    : 'Nothing new to add — you already have reminders for these.'
            );
            bills.refresh();
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not add reminders.'));
        } finally {
            setSaving(false);
        }
    };

    const billList = bills.data ?? [];
    const hasDetections = (recurring.data ?? []).length > 0;

    return (
        <>
            <PageHeader
                title="Bills & repeat payments"
                subtitle={BILL_DISCLAIMER}
                back={true}
                action={
                    <div className="flex gap-2">
                        {payments.data?.enabled && (
                            <Button variant="ghost" size="sm" onClick={() => setPaying(true)}>
                                {payments.data.mode === 'demo' ? 'Pay a bill (Demo)' : 'Pay a bill'}
                            </Button>
                        )}
                        <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => openEditor()}>
                            Add reminder
                        </Button>
                    </div>
                }
            />

            <div className="space-y-4">
                <Card>
                    {bills.error ? (
                        <ErrorState title="Reminders unavailable" message={bills.error} onRetry={bills.retry} />
                    ) : bills.loading ? (
                        <div className="space-y-3">
                            <Skeleton className="h-16 w-full" rounded="rounded-card" />
                            <Skeleton className="h-16 w-full" rounded="rounded-card" />
                        </div>
                    ) : billList.length ? (
                        <List>
                            {billList.map((bill) => (
                                <BillRow
                                    key={bill._id}
                                    bill={bill}
                                    onMarkPaid={setMarkingPaid}
                                    onOpen={openEditor}
                                />
                            ))}
                        </List>
                    ) : (
                        <EmptyState
                            variant="first-run"
                            icon={<Receipt size={20} />}
                            title="No reminders yet"
                            description="Add the bills you pay elsewhere and PayPro will remind you before they're due. It won't pay them."
                            action={
                                <Button variant="primary" onClick={() => openEditor()}>
                                    Add your first reminder
                                </Button>
                            }
                            secondaryAction={
                                hasDetections && (
                                    <Button variant="ghost" icon={<LogoMark size={14} />} onClick={handleSeed} loading={saving}>
                                        Use what we spotted
                                    </Button>
                                )
                            }
                        />
                    )}
                </Card>

                <RecurringList
                    query={recurring}
                    onDismiss={handleDismissRecurring}
                    onDetect={handleDetect}
                    detecting={detecting}
                />
            </div>

            <BillEditorSheet
                open={editorOpen}
                onClose={() => { setEditorOpen(false); setEditing(null); }}
                onSave={handleSave}
                bill={editing}
                saving={saving}
            />

            <PayBillSheet
                open={paying}
                onClose={() => setPaying(false)}
                mode={payments.data?.mode}
                onPaid={bills.refresh}
            />

            <ConfirmSheet
                open={Boolean(markingPaid)}
                onClose={() => setMarkingPaid(null)}
                onConfirm={handleMarkPaid}
                title="Mark this as paid?"
                description={`This records that you've paid ${markingPaid?.billerName ?? 'this bill'} somewhere else. It doesn't move any money, and your balance won't change.`}
                confirmLabel="Mark paid"
                loading={saving}
            />
        </>
    );
};

export default Bills;
