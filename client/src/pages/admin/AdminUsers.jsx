import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Search, Users as UsersIcon } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Amount, { LedgerAmount } from '../../components/ui/Amount';
import Button from '../../components/ui/Button';
import Sheet from '../../components/ui/Sheet';
import Field, { Input, Select } from '../../components/ui/Field';
import { DetailRow } from '../../components/ui/List';
import { SkeletonRows } from '../../components/ui/Skeleton';
import EmptyState from '../../components/feedback/EmptyState';
import ErrorState from '../../components/feedback/ErrorState';
import ResponsiveTable, { Pager } from '../../features/admin/ResponsiveTable';
import ReauthSheet from '../../features/admin/ReauthSheet';
import { personName } from '../../features/admin/personName';
import useQuery from '../../hooks/useQuery';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import { useAuth } from '../../context/AuthContext';
import { adminApi } from '../../services/api/endpoints/adminApi';
import { getErrorMessage } from '../../utils/errors';
import { formatDate, formatRelativeTime } from '../../utils/formatters';
import { ACCOUNT_STATUS_TONE, ROLE_LABEL, can } from '../../constants/admin';
import { ROUTES } from '../../constants/routes';
import { amountMinorOf, balanceMinorOf } from '../../lib/money';

const ROLES = ['user', 'support', 'risk', 'admin'];
const EMPTY_ADJUSTMENT = { type: 'Credit', amount: '', reason: '' };

/**
 * User directory (plan.md §28.2 "Users").
 *
 * Every load of this list is audit-logged server-side as a PII access
 * (§28.3 rule 6) — the directory shows balances and email addresses.
 *
 * Actions live in a sheet rather than inline buttons on each row: suspending
 * an account is rare and consequential, and a row of "Suspend" buttons next to
 * a row of names is one mis-tap away from the wrong customer.
 *
 * The sheet loads the account summary (`GET /admin/users/:id`, itself a logged
 * PII read) only when opened, and adds the two §28.2 actions that needed new
 * endpoints: signing an account out everywhere, and a manual adjustment — a
 * new ledger row with a written reason, never an edit to the balance.
 */
const AdminUsers = () => {
    const { user: me } = useAuth();
    const role = me?.role;

    const [search, setSearch] = useState('');
    const debounced = useDebouncedValue(search);
    const [page, setPage] = useState(1);
    const [selected, setSelected] = useState(null);
    const [pending, setPending] = useState(null); // { kind: 'suspend'|'reactivate'|'role'|'logout'|'adjust'|'reset2fa' }
    const [resetReason, setResetReason] = useState('');
    const [adjustment, setAdjustment] = useState(EMPTY_ADJUSTMENT);
    const [nextRole, setNextRole] = useState('user');
    const [saving, setSaving] = useState(false);

    const users = useQuery(
        async () => (await adminApi.listUsers({ search: debounced.trim(), page })).data,
        { deps: [debounced, page] }
    );

    const detail = useQuery(
        async () => (await adminApi.getUser(selected._id)).data,
        { deps: [selected?._id], enabled: Boolean(selected?._id) && can(role, 'viewUserDetail') }
    );

    const openUser = (row) => {
        setSelected(row);
        setNextRole(row.role ?? 'user');
        setAdjustment(EMPTY_ADJUSTMENT);
    };

    const adjustmentProblem = () => {
        const amount = Number(adjustment.amount);
        if (!(amount > 0)) return 'Enter an amount above zero.';
        if (adjustment.reason.trim().length < 10) return 'Write a reason of at least 10 characters — it is shown in the audit log.';
        return null;
    };

    const confirm = async (currentPassword) => {
        setSaving(true);
        try {
            let result;
            if (pending.kind === 'suspend') result = await adminApi.suspend(selected._id, { currentPassword });
            if (pending.kind === 'reactivate') result = await adminApi.reactivate(selected._id, { currentPassword });
            if (pending.kind === 'role') result = await adminApi.setRole(selected._id, { role: nextRole, currentPassword });
            if (pending.kind === 'logout') result = await adminApi.forceLogout(selected._id, { currentPassword });
            if (pending.kind === 'reset2fa') {
                if (resetReason.trim().length < 10) {
                    toast.error('Record how you verified the customer (at least 10 characters).');
                    return;
                }
                result = await adminApi.resetTwoFactor(selected._id, { currentPassword, reason: resetReason.trim() });
                setResetReason('');
            }
            if (pending.kind === 'adjust') {
                const problem = adjustmentProblem();
                if (problem) {
                    toast.error(problem);
                    return;
                }
                result = await adminApi.adjustBalance({
                    userId: selected._id,
                    type: adjustment.type,
                    amount: adjustment.amount,
                    reason: adjustment.reason.trim(),
                    currentPassword,
                });
                setSelected((current) => current && { ...current, accountBalance: result.data.newBalance, balanceMinor: result.data.newBalanceMinor });
                setAdjustment(EMPTY_ADJUSTMENT);
            }
            toast.success(result?.data?.message ?? 'Saved.');
            if (result?.data?.user) setSelected((current) => current && { ...current, ...result.data.user });
            setPending(null);
            users.refresh();
            detail.refresh();
        } catch (err) {
            toast.error(getErrorMessage(err, 'That change was not saved.'));
        } finally {
            setSaving(false);
        }
    };

    const isSelf = selected && String(selected._id) === String(me?._id);
    const rows = users.data?.users ?? [];

    return (
        <>
            <PageHeader title="Users" subtitle="Search by email. Opening this list is recorded in the audit log." />

            <div className="mb-4">
                <Input
                    type="search"
                    value={search}
                    onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                    placeholder="Search by email address"
                    aria-label="Search users by email"
                    prefix={<Search size={15} />}
                />
            </div>

            <Card padding="none">
                {users.error ? (
                    <ErrorState title="Users unavailable" message={users.error} onRetry={users.retry} reassurance={null} />
                ) : users.loading ? (
                    <SkeletonRows count={6} />
                ) : rows.length === 0 ? (
                    <EmptyState
                        variant="filtered"
                        icon={<UsersIcon size={20} />}
                        title="No matching users"
                        description={debounced ? `Nobody's email contains “${debounced}”.` : 'There are no users yet.'}
                    />
                ) : (
                    <>
                        <ResponsiveTable
                            caption="Users"
                            rows={rows}
                            onRowClick={openUser}
                            columns={[
                                {
                                    key: 'name',
                                    header: 'User',
                                    render: (row) => (
                                        <>
                                            <p className="font-medium">{personName(row)}</p>
                                            <p className="text-xs text-text-muted">{row.email}</p>
                                        </>
                                    ),
                                },
                                { key: 'role', header: 'Role', render: (row) => ROLE_LABEL[row.role] ?? row.role },
                                {
                                    key: 'status',
                                    header: 'Status',
                                    render: (row) => (
                                        <span className="flex flex-wrap gap-1.5">
                                            <Badge tone={ACCOUNT_STATUS_TONE[row.status]} size="sm" dot>{row.status}</Badge>
                                            {!row.emailVerified && <Badge tone="neutral" size="sm">Email unverified</Badge>}
                                        </span>
                                    ),
                                },
                                { key: 'balance', header: 'Balance', render: (row) => <Amount minor={balanceMinorOf(row)} size="sm" /> },
                                { key: 'joined', header: 'Joined', className: 'text-text-muted', render: (row) => formatDate(row.createdAt) },
                            ]}
                            mobileRow={(row) => ({
                                title: personName(row),
                                subtitle: `${row.email} · ${ROLE_LABEL[row.role] ?? row.role}`,
                                trailing: <Badge tone={ACCOUNT_STATUS_TONE[row.status]} size="sm">{row.status}</Badge>,
                            })}
                        />
                        <Pager
                            page={users.data.currentPage}
                            totalPages={users.data.totalPages}
                            total={users.data.total}
                            onChange={setPage}
                        />
                    </>
                )}
            </Card>

            <Sheet
                open={Boolean(selected) && !pending}
                onClose={() => setSelected(null)}
                title={selected ? personName(selected) : 'User'}
                description={selected?.email}
                size="md"
            >
                {selected && (
                    <div className="space-y-5">
                        <dl className="divide-y divide-border">
                            <DetailRow label="Role" value={ROLE_LABEL[selected.role] ?? selected.role} />
                            <DetailRow label="Status" value={selected.status} />
                            <DetailRow label="Email" value={selected.emailVerified ? 'Verified' : 'Not verified'} />
                            <DetailRow label="KYC tier" value={selected.kycTier} />
                            <DetailRow label="Balance" value={<Amount minor={balanceMinorOf(selected)} size="sm" />} />
                            <DetailRow label="Joined" value={formatDate(selected.createdAt)} />
                            {detail.data && !detail.loading && (
                                <>
                                    <DetailRow label="Signed-in sessions" value={detail.data.activeSessions} />
                                    <DetailRow label="Open risk cases" value={detail.data.openRiskCases} />
                                    <DetailRow label="Open support tickets" value={detail.data.openTickets} />
                                    {detail.data.user.locked && <DetailRow label="Sign-in" value="Temporarily locked (failed attempts)" />}
                                </>
                            )}
                        </dl>

                        {detail.error && (
                            <p className="text-xs text-text-muted">Account summary unavailable: {detail.error}</p>
                        )}

                        {!detail.loading && detail.data?.recentTransactions?.length > 0 && (
                            <section>
                                <h3 className="mb-1 text-sm font-semibold text-text">Recent activity</h3>
                                <ul className="divide-y divide-border">
                                    {detail.data.recentTransactions.slice(0, 5).map((tx) => (
                                        <li key={tx._id} className="flex items-center justify-between gap-3 py-2 text-sm">
                                            <span className="min-w-0">
                                                <span className="block truncate text-text">{tx.description}</span>
                                                <span className="text-xs text-text-muted">
                                                    {tx.status !== 'SUCCESS' ? `${tx.status} · ` : ''}{formatRelativeTime(tx.createdAt)}
                                                </span>
                                            </span>
                                            <LedgerAmount type={tx.type} minor={amountMinorOf(tx)} size="sm" />
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}

                        <div className="flex flex-wrap gap-2">
                            {can(role, 'searchTransactions') && (
                                <Link
                                    to={`${ROUTES.ADMIN_TRANSACTIONS}?userId=${selected._id}`}
                                    className="rounded-control border border-border px-3 py-2 text-sm font-medium text-text hover:bg-surface-hover"
                                >
                                    All transactions
                                </Link>
                            )}
                            {can(role, 'viewAuditLog') && (
                                <Link
                                    to={`${ROUTES.ADMIN_AUDIT}?userId=${selected._id}`}
                                    className="rounded-control border border-border px-3 py-2 text-sm font-medium text-text hover:bg-surface-hover"
                                >
                                    Audit history
                                </Link>
                            )}
                            {can(role, 'viewReconciliation') && (
                                <Link
                                    to={`${ROUTES.ADMIN_RECONCILIATION}?userId=${selected._id}`}
                                    className="rounded-control border border-border px-3 py-2 text-sm font-medium text-text hover:bg-surface-hover"
                                >
                                    Check balance against ledger
                                </Link>
                            )}
                        </div>

                        {isSelf ? (
                            <p className="rounded-control bg-surface-sunken p-3 text-xs leading-5 text-text-muted">
                                This is your own account. Role and status changes to yourself are not offered here —
                                ask another admin, so no one can quietly widen or lock in their own access.
                            </p>
                        ) : (
                            <>
                                {can(role, 'suspendUsers') && selected.status !== 'closed' && (
                                    <section className="space-y-2">
                                        <h3 className="text-sm font-semibold text-text">Account access</h3>
                                        {selected.status === 'active' ? (
                                            <Button variant="danger" onClick={() => setPending({ kind: 'suspend' })}>
                                                Suspend account
                                            </Button>
                                        ) : (
                                            <Button variant="secondary" onClick={() => setPending({ kind: 'reactivate' })}>
                                                Reactivate account
                                            </Button>
                                        )}
                                        <p className="text-xs leading-5 text-text-muted">
                                            Takes effect on the customer's very next request — their existing session stops working.
                                        </p>
                                    </section>
                                )}

                                {can(role, 'forceLogout') && selected.status !== 'closed' && (
                                    <section className="space-y-2">
                                        <h3 className="text-sm font-semibold text-text">Sessions</h3>
                                        <Button variant="secondary" onClick={() => setPending({ kind: 'logout' })}>
                                            Sign out everywhere
                                        </Button>
                                        <p className="text-xs leading-5 text-text-muted">
                                            Ends every session and push registration. The account stays usable — they can sign in again.
                                        </p>
                                    </section>
                                )}

                                {/* The last step of authenticator recovery: the customer has
                                    lost both the app and their recovery codes. */}
                                {can(role, 'resetTwoFactor') && detail.data?.user?.totpEnabled && (
                                    <section className="space-y-2">
                                        <h3 className="text-sm font-semibold text-text">Authenticator app</h3>
                                        <Button variant="secondary" onClick={() => { setResetReason(''); setPending({ kind: 'reset2fa' }); }}>
                                            Reset 2FA…
                                        </Button>
                                        <p className="text-xs leading-5 text-text-muted">
                                            Only after verifying the customer another way. Removes their authenticator, signs them out
                                            everywhere, and emails them. Their codes are emailed until they set it up again.
                                        </p>
                                    </section>
                                )}

                                {can(role, 'adjustBalances') && selected.status !== 'closed' && (
                                    <section className="space-y-2">
                                        <h3 className="text-sm font-semibold text-text">Balance adjustment</h3>
                                        <Button variant="secondary" onClick={() => setPending({ kind: 'adjust' })}>
                                            Credit or debit…
                                        </Button>
                                        <p className="text-xs leading-5 text-text-muted">
                                            Writes a new, visible ledger row with your reason. It never edits past transactions.
                                        </p>
                                    </section>
                                )}

                                {can(role, 'changeRoles') && (
                                    <section className="space-y-2">
                                        <h3 className="text-sm font-semibold text-text">Role</h3>
                                        <div className="flex flex-col gap-2 sm:flex-row">
                                            <Select
                                                aria-label="New role"
                                                value={nextRole}
                                                onChange={(event) => setNextRole(event.target.value)}
                                                className="sm:max-w-48"
                                            >
                                                {ROLES.map((value) => (
                                                    <option key={value} value={value}>{ROLE_LABEL[value]}</option>
                                                ))}
                                            </Select>
                                            <Button
                                                variant="secondary"
                                                disabled={nextRole === selected.role}
                                                onClick={() => setPending({ kind: 'role' })}
                                            >
                                                Change role
                                            </Button>
                                        </div>
                                    </section>
                                )}
                            </>
                        )}
                    </div>
                )}
            </Sheet>

            <ReauthSheet
                open={Boolean(pending)}
                onClose={() => setPending(null)}
                onConfirm={confirm}
                loading={saving}
                variant={['suspend', 'logout', 'reset2fa'].includes(pending?.kind) ? 'danger' : 'primary'}
                title={REAUTH_COPY[pending?.kind]?.title(selected, nextRole) ?? ''}
                description={REAUTH_COPY[pending?.kind]?.description(selected) ?? ''}
                confirmLabel={REAUTH_COPY[pending?.kind]?.confirm ?? 'Confirm'}
            >
                {pending?.kind === 'adjust' && (
                    <AdjustmentFields value={adjustment} onChange={setAdjustment} balance={selected?.accountBalance} />
                )}
                {pending?.kind === 'reset2fa' && (
                    <Field label="How did you verify them?" hint="At least 10 characters, e.g. “video call, matched ID and last three transactions”. Goes to the audit log.">
                        {(props) => (
                            <Input {...props} maxLength={500} value={resetReason} onChange={(event) => setResetReason(event.target.value)} />
                        )}
                    </Field>
                )}
            </ReauthSheet>
        </>
    );
};

const REAUTH_COPY = {
    suspend: {
        title: () => 'Suspend this account?',
        description: (user) => `${user?.email} will be signed out and blocked from every action, including moving money, until reactivated.`,
        confirm: 'Suspend',
    },
    reactivate: {
        title: () => 'Reactivate this account?',
        description: (user) => `${user?.email} will be able to sign in and use their account again.`,
        confirm: 'Reactivate',
    },
    role: {
        title: (user, nextRole) => `Make ${user ? personName(user) : 'this user'} ${ROLE_LABEL[nextRole]}?`,
        description: () => "Roles grant access to other customers' data. This change is audit-logged under your name.",
        confirm: 'Change role',
    },
    logout: {
        title: () => 'Sign this account out everywhere?',
        description: (user) => `Every session ${user?.email} has is ended now, including the one they may be using. Use this when an account may be in someone else's hands.`,
        confirm: 'Sign out everywhere',
    },
    reset2fa: {
        title: () => 'Reset this customer’s authenticator?',
        description: (user) => `${user?.email} loses their authenticator app and recovery codes and is signed out everywhere. Anyone who can read their email can then sign in with an emailed code, so be sure it is them.`,
        confirm: 'Reset 2FA',
    },
    adjust: {
        title: () => 'Adjust this balance',
        description: (user) => `A new ledger row on ${user?.email}'s account, shown in their activity and your audit trail. A debit cannot take the balance below zero.`,
        confirm: 'Apply adjustment',
    },
};

const AdjustmentFields = ({ value, onChange, balance }) => {
    const set = (key) => (event) => onChange((current) => ({ ...current, [key]: event.target.value }));
    return (
        <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Direction">
                    {(props) => (
                        <Select {...props} value={value.type} onChange={set('type')}>
                            <option value="Credit">Credit — add money</option>
                            <option value="Debit">Debit — take money back</option>
                        </Select>
                    )}
                </Field>
                <Field label="Amount (₹)" hint={`Current balance ₹${Number(balance ?? 0).toFixed(2)}`}>
                    {(props) => (
                        <Input
                            {...props}
                            inputMode="decimal"
                            autoComplete="off"
                            value={value.amount}
                            onChange={(event) => /^\d*\.?\d{0,2}$/.test(event.target.value) && set('amount')(event)}
                        />
                    )}
                </Field>
            </div>
            <Field label="Reason" hint="At least 10 characters. The customer sees it in their activity; your name goes to the audit log only.">
                {(props) => (
                    <Input {...props} maxLength={280} value={value.reason} onChange={set('reason')} />
                )}
            </Field>
        </div>
    );
};

export default AdminUsers;
