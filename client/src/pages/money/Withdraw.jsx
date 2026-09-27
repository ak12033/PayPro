import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Landmark, Plus, BadgeCheck, ChevronRight } from 'lucide-react';
import PageHeader, { SectionHeading } from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Amount from '../../components/ui/Amount';
import Skeleton from '../../components/ui/Skeleton';
import IconBadge from '../../components/ui/IconBadge';
import List, { ListRow } from '../../components/ui/List';
import Sheet, { ConfirmSheet } from '../../components/ui/Sheet';
import Field, { AmountInput, Select } from '../../components/ui/Field';
import EmptyState from '../../components/feedback/EmptyState';
import ErrorState from '../../components/feedback/ErrorState';
import BankAccountSheet from '../../features/withdraw/BankAccountSheet';
import DocumentUploader from '../../features/verification/DocumentUploader';
import useQuery from '../../hooks/useQuery';
import { useAuth } from '../../context/AuthContext';
import { withdrawalApi } from '../../services/api/endpoints/withdrawalApi';
import { createIdempotencyKey } from '../../lib/idempotency';
import { getErrorMessage } from '../../utils/errors';
import { formatDateTime, formatRelativeTime } from '../../utils/formatters';
import { ROUTES } from '../../constants/routes';
import { BANK_ACCOUNT_STATUS_META, BANK_DOCUMENT_LABEL, WITHDRAWAL_STATUS_META } from '../../constants/kyc';

/**
 * Withdraw to a bank account (plan.md §0.20.3).
 *
 * The honest version of this screen has to say three things plainly, because
 * each one is different from a transfer:
 *   - a person at PayPro reviews every withdrawal and sends it by bank transfer;
 *   - the money leaves your PayPro balance *now*, and is held until it is sent;
 *   - if it is not sent, it comes back.
 *
 * It is gated in order: identity first, then a verified account, then the form.
 * Each gate says what to do next rather than showing a disabled form.
 */
const Withdraw = () => {
    const { balanceMinor, user } = useAuth();
    const data = useQuery(async () => {
        const [withdrawals, accounts] = await Promise.all([withdrawalApi.list(), withdrawalApi.listBankAccounts()]);
        return { ...withdrawals.data, accounts: accounts.data.accounts };
    });

    const [adding, setAdding] = useState(false);
    const [saving, setSaving] = useState(false);
    const [accountOpen, setAccountOpen] = useState(null);
    const [removing, setRemoving] = useState(null);
    const [bankAccountId, setBankAccountId] = useState('');
    const [amount, setAmount] = useState('');
    const [confirming, setConfirming] = useState(null);
    const [cancelling, setCancelling] = useState(null);

    const eligibility = data.data?.eligibility;
    const accounts = data.data?.accounts ?? [];
    const withdrawals = data.data?.withdrawals ?? [];
    const verifiedAccounts = accounts.filter((a) => a.status === 'verified');
    const selectedId = bankAccountId || verifiedAccounts[0]?._id || '';
    const selected = verifiedAccounts.find((a) => a._id === selectedId);
    const amountMinor = Math.round(Number(amount || 0) * 100);
    const tooMuch = amountMinor > (balanceMinor ?? 0);
    const tooLittle = amount !== '' && Number(amount) < (eligibility?.minAmount ?? 100);
    const openCount = eligibility?.openWithdrawals ?? 0;
    const atOpenLimit = openCount >= (eligibility?.maxOpenWithdrawals ?? 3);

    const addAccount = async (details) => {
        setSaving(true);
        try {
            const { data: created } = await withdrawalApi.addBankAccount(details);
            toast.success('Account added. Add a cancelled cheque or statement to speed up the check.');
            setAdding(false);
            await data.refresh();
            setAccountOpen(created.account._id);
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not add this account.'));
        } finally {
            setSaving(false);
        }
    };

    const removeAccount = async () => {
        setSaving(true);
        try {
            await withdrawalApi.removeBankAccount(removing._id);
            setRemoving(null);
            setAccountOpen(null);
            data.refresh();
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not remove this account.'));
        } finally {
            setSaving(false);
        }
    };

    const request = async () => {
        setSaving(true);
        try {
            await withdrawalApi.request({ bankAccountId: selectedId, amount: Number(amount), idempotencyKey: confirming.key });
            toast.success('Withdrawal requested. The money is held until we send it.');
            setConfirming(null);
            setAmount('');
            data.refresh();
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not request this withdrawal.'));
            setConfirming(null);
        } finally {
            setSaving(false);
        }
    };

    const cancel = async () => {
        setSaving(true);
        try {
            await withdrawalApi.cancel(cancelling._id);
            toast.success('Cancelled. The money is back in your balance.');
            setCancelling(null);
            data.refresh();
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not cancel this withdrawal.'));
            setCancelling(null);
            data.refresh();
        } finally {
            setSaving(false);
        }
    };

    const detailAccount = accounts.find((a) => a._id === accountOpen);

    return (
        <div className="mx-auto max-w-2xl">
            <PageHeader
                title="Withdraw to bank"
                subtitle="Move money from your PayPro balance to your own bank account. Every withdrawal is checked and sent by our team."
                back={ROUTES.MONEY}
            />

            {data.error ? (
                <ErrorState title="Withdrawals unavailable" message={data.error} onRetry={data.retry} />
            ) : data.loading ? (
                <div className="space-y-4">
                    <Skeleton className="h-28 w-full" rounded="rounded-card" />
                    <Skeleton className="h-40 w-full" rounded="rounded-card" />
                </div>
            ) : !eligibility?.kycVerified ? (
                <Card>
                    <div className="flex items-start gap-3">
                        <IconBadge icon={<BadgeCheck size={18} />} tone="accent" />
                        <div className="min-w-0 flex-1">
                            <p className="text-base font-semibold text-text">Verify your identity first</p>
                            <p className="mt-1 text-sm leading-6 text-text-muted">
                                Money can only leave PayPro for a bank account in your own name, so we need to confirm who you are.
                            </p>
                            <Link to={ROUTES.VERIFICATION} className="mt-3 inline-block">
                                <Button variant="primary" icon={<ChevronRight size={15} />}>Go to identity verification</Button>
                            </Link>
                        </div>
                    </div>
                </Card>
            ) : (
                <div className="space-y-6">
                    {/* ------------------------------------------------ form */}
                    {verifiedAccounts.length > 0 && (
                        <Card>
                            <p className="text-sm text-text-muted">Available balance</p>
                            <div className="mt-1"><Amount minor={balanceMinor} size="lg" /></div>

                            <div className="mt-5 space-y-4">
                                <Field label="To">
                                    {(props) => (
                                        <Select {...props} value={selectedId} onChange={(e) => setBankAccountId(e.target.value)}>
                                            {verifiedAccounts.map((a) => (
                                                <option key={a._id} value={a._id}>
                                                    {(a.bankName || a.ifsc)} · {a.accountNumberMasked}
                                                </option>
                                            ))}
                                        </Select>
                                    )}
                                </Field>
                                <Field
                                    label="Amount"
                                    hint={`Minimum ₹${eligibility.minAmount}.`}
                                    error={tooMuch ? 'More than your available balance' : tooLittle ? `The minimum is ₹${eligibility.minAmount}` : null}
                                >
                                    {(props) => <AmountInput {...props} value={amount} onChange={setAmount} />}
                                </Field>
                                {atOpenLimit && (
                                    <p className="text-sm text-warning">You have {openCount} withdrawals in progress. Wait for one to finish before starting another.</p>
                                )}
                                <Button
                                    variant="primary"
                                    fullWidth
                                    disabled={!amount || tooMuch || tooLittle || atOpenLimit || !selected}
                                    onClick={() => setConfirming({ key: createIdempotencyKey() })}
                                >
                                    Review withdrawal
                                </Button>
                            </div>
                        </Card>
                    )}

                    {/* -------------------------------------------- accounts */}
                    <section>
                        <SectionHeading
                            title="Bank accounts"
                            action={accounts.length < 3 && (
                                <Button variant="ghost" size="sm" icon={<Plus size={14} />} onClick={() => setAdding(true)}>Add</Button>
                            )}
                        />
                        <Card padding="none">
                            {accounts.length ? (
                                <List>
                                    {accounts.map((a) => {
                                        const meta = BANK_ACCOUNT_STATUS_META[a.status];
                                        return (
                                            <ListRow
                                                key={a._id}
                                                leading={<IconBadge icon={<Landmark size={16} />} tone="neutral" size="sm" />}
                                                title={`${a.bankName || a.ifsc} · ${a.accountNumberMasked}`}
                                                subtitle={a.status === 'rejected' && a.userVisibleReason ? a.userVisibleReason : a.holderName}
                                                trailing={<Badge tone={meta?.tone} size="sm" dot>{meta?.label ?? a.status}</Badge>}
                                                onClick={() => setAccountOpen(a._id)}
                                                showChevron
                                            />
                                        );
                                    })}
                                </List>
                            ) : (
                                <EmptyState
                                    icon={<Landmark size={20} />}
                                    title="No bank account yet"
                                    description="Add an account in your own name. We check it before you can withdraw to it."
                                    action={<Button variant="primary" onClick={() => setAdding(true)}>Add a bank account</Button>}
                                />
                            )}
                        </Card>
                        {accounts.length > 0 && verifiedAccounts.length === 0 && (
                            <p className="mt-2 px-1 text-xs leading-5 text-text-muted">
                                You can withdraw once one of your accounts is verified. We will tell you when it is.
                            </p>
                        )}
                    </section>

                    {/* --------------------------------------------- history */}
                    {withdrawals.length > 0 && (
                        <section>
                            <SectionHeading title="Withdrawals" />
                            <Card padding="none">
                                <List>
                                    {withdrawals.map((w) => {
                                        const meta = WITHDRAWAL_STATUS_META[w.status];
                                        return (
                                            <ListRow
                                                key={w._id}
                                                title={<Amount minor={w.amountMinor} size="sm" />}
                                                subtitle={
                                                    w.status === 'paid'
                                                        ? `Sent ${formatDateTime(w.paidAt)} · UTR ${w.payoutReference}`
                                                        : w.userVisibleReason && ['rejected', 'failed'].includes(w.status)
                                                          ? w.userVisibleReason
                                                          : `To ${w.bank?.accountNumberMasked} · ${formatRelativeTime(w.createdAt)}`
                                                }
                                                trailing={
                                                    <span className="flex items-center gap-2">
                                                        <Badge tone={meta?.tone} size="sm" dot>{meta?.label ?? w.status}</Badge>
                                                        {w.status === 'requested' && (
                                                            <Button variant="ghost" size="sm" onClick={() => setCancelling(w)}>Cancel</Button>
                                                        )}
                                                    </span>
                                                }
                                            />
                                        );
                                    })}
                                </List>
                            </Card>
                        </section>
                    )}
                </div>
            )}

            <BankAccountSheet
                open={adding}
                onClose={() => setAdding(false)}
                onSave={addAccount}
                saving={saving}
                defaultHolderName={[user?.firstName, user?.lastName].filter(Boolean).join(' ')}
            />

            <Sheet
                open={Boolean(detailAccount)}
                onClose={() => setAccountOpen(null)}
                title={detailAccount ? `${detailAccount.bankName || detailAccount.ifsc} · ${detailAccount.accountNumberMasked}` : ''}
                description={detailAccount ? `${detailAccount.holderName} · IFSC ${detailAccount.ifsc}` : undefined}
                footer={detailAccount && (
                    <div className="flex justify-end">
                        <Button variant="ghost" onClick={() => setRemoving(detailAccount)}>Remove account</Button>
                    </div>
                )}
            >
                {detailAccount && (
                    <div className="space-y-4">
                        <Badge tone={BANK_ACCOUNT_STATUS_META[detailAccount.status]?.tone} dot>
                            {BANK_ACCOUNT_STATUS_META[detailAccount.status]?.label}
                        </Badge>
                        {detailAccount.status === 'pending' ? (
                            <>
                                <p className="text-sm leading-6 text-text-muted">
                                    A cancelled cheque, a bank statement or your passbook&apos;s first page showing your name and this account number
                                    lets us check it faster.
                                </p>
                                <DocumentUploader
                                    documents={detailAccount.documents}
                                    typeLabels={BANK_DOCUMENT_LABEL}
                                    onUpload={async ({ type, file }) => {
                                        await withdrawalApi.uploadBankDocument(detailAccount._id, { type, file });
                                        toast.success('Uploaded.');
                                        data.refresh();
                                    }}
                                    maxDocuments={3}
                                />
                            </>
                        ) : detailAccount.status === 'rejected' ? (
                            <p className="text-sm leading-6 text-text">{detailAccount.userVisibleReason}</p>
                        ) : (
                            <p className="text-sm leading-6 text-text-muted">You can withdraw to this account.</p>
                        )}
                    </div>
                )}
            </Sheet>

            <ConfirmSheet
                open={Boolean(confirming)}
                onClose={() => setConfirming(null)}
                onConfirm={request}
                title={`Withdraw ₹${Number(amount || 0).toLocaleString('en-IN')}?`}
                description={`To ${selected?.bankName || selected?.ifsc || ''} ${selected?.accountNumberMasked ?? ''}. The money leaves your PayPro balance now and is held while we review it. We send it by bank transfer and tell you the bank reference. If it is not sent, it comes back to your balance.`}
                confirmLabel="Request withdrawal"
                variant="primary"
                loading={saving}
            />

            <ConfirmSheet
                open={Boolean(cancelling)}
                onClose={() => setCancelling(null)}
                onConfirm={cancel}
                title="Cancel this withdrawal?"
                description="The held money goes straight back to your PayPro balance."
                confirmLabel="Cancel withdrawal"
                loading={saving}
            />

            <ConfirmSheet
                open={Boolean(removing)}
                onClose={() => setRemoving(null)}
                onConfirm={removeAccount}
                title="Remove this bank account?"
                description="You will not be able to withdraw to it. Adding it again means it is checked again."
                confirmLabel="Remove"
                loading={saving}
            />
        </div>
    );
};

export default Withdraw;
