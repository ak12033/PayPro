import React, { useState, useEffect, useMemo } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../api/api.js';
import toast from 'react-hot-toast';
import { FiChevronDown, FiUser, FiSearch } from 'react-icons/fi';
import { ImSpinner2 } from 'react-icons/im';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const P2PTransfer = () => {
  const [users, setUsers] = useState([]);
  const [amount, setAmount] = useState('');
  const [recipientId, setRecipientId] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [search, setSearch] = useState('');

  const navigate = useNavigate();
  const { token, fetchDashboardData } = useAuth();

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);
      const res = await api.get('/users/all', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUsers(res.data.users || []);
    } catch (err) {
      toast.error('Failed to fetch users');
    } finally {
      setLoadingUsers(false);
    }
  };

  const sendMoney = async () => {
    if (!amount || !recipientId) {
      toast.error('Please enter amount and select a user');
      return;
    }

    try {
      setLoading(true);

      await api.post(
        '/transactions/transfer',
        { recipientId, amount },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success('Money sent successfully!');
      setAmount('');
      setRecipientId('');
      setSearch('');

      await fetchDashboardData();
    } catch (err) {
      if (err.response?.data?.require2FA) {
        localStorage.setItem(
          'pendingTransfer',
          JSON.stringify({ recipientId, amount })
        );
        toast.error(err.response.data.message);
        navigate('/verify-otp', { state: { email: err.response.data.email } });
        return;
      }

      toast.error(err.response?.data?.message || 'Transfer failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchUsers();
    }
  }, [token]);

  const selectedUser = useMemo(
    () => users.find((u) => u._id === recipientId),
    [users, recipientId]
  );

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return users;

    return users.filter((u) => {
      const fullName = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
      const email = (u.email || '').toLowerCase();
      return fullName.includes(query) || email.includes(query);
    });
  }, [users, search]);

  const parsedAmount = Number(amount || 0);
  const formattedAmount =
    parsedAmount > 0 ? `₹${parsedAmount.toLocaleString('en-IN')}` : '₹0';

  return (
    <div className="flex min-h-screen bg-[#07111f] text-white">
      <Sidebar />

      <div className="relative flex-1 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.10),_transparent_26%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.08),_transparent_28%),linear-gradient(180deg,#08111e_0%,#0b1626_100%)]" />
        <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:72px_72px]" />

        <div className="relative z-10 h-screen overflow-y-auto px-5 py-6 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-7xl">
            <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-[0.24em] text-cyan-300/75">
                  Payments
                </p>
                <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  P2P transfer
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
                  Send money instantly to another user with secure verification and live account updates.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-row">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Transfer type
                  </p>
                  <p className="mt-1 text-sm font-medium text-white">Internal P2P</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Security
                  </p>
                  <p className="mt-1 text-sm font-medium text-emerald-300">OTP protected</p>
                </div>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-[30px] border border-white/10 bg-white/[0.05] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-6">
                <div className="mb-6">
                  <h2 className="text-lg font-semibold text-white">Transfer details</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Enter an amount and choose the recipient you want to send money to.
                  </p>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-200">
                      Amount
                    </label>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition-all duration-200 focus-within:border-cyan-300/40 focus-within:bg-white/[0.06] focus-within:shadow-[0_0_0_4px_rgba(34,211,238,0.08)]">
                      <div className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                        Transfer amount
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-2xl font-semibold text-cyan-300">₹</span>
                        <input
                          type="number"
                          min="0"
                          placeholder="0.00"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          className="w-full bg-transparent text-3xl font-semibold tracking-tight text-white placeholder:text-slate-600 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="relative z-[120]">
                    <label className="mb-2 block text-sm font-medium text-slate-200">
                      Recipient
                    </label>

                    <button
                      type="button"
                      onClick={() => setDropdownOpen((prev) => !prev)}
                      className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 text-left transition-all duration-200 hover:bg-white/[0.06]"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-cyan-400/10 text-cyan-300">
                          <FiUser size={18} />
                        </div>

                        <div className="min-w-0">
                          {selectedUser ? (
                            <>
                              <p className="truncate text-sm font-medium text-white">
                                {selectedUser.firstName} {selectedUser.lastName}
                              </p>
                              <p className="truncate text-xs text-slate-400">
                                {selectedUser.email}
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="text-sm font-medium text-white">
                                Select recipient
                              </p>
                              <p className="text-xs text-slate-400">
                                Choose from your available users
                              </p>
                            </>
                          )}
                        </div>
                      </div>

                      <FiChevronDown
                        className={`text-slate-400 transition-transform duration-200 ${
                          dropdownOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    {dropdownOpen && (
                      <div className="absolute z-[150] mt-3 w-full rounded-2xl border border-white/10 bg-[#0c1726]/95 p-3 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
                        <div className="mb-3 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3">
                          <FiSearch className="text-slate-500" />
                          <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search name or email"
                            className="w-full bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
                          />
                        </div>

                        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                          {loadingUsers ? (
                            [...Array(4)].map((_, idx) => (
                              <div
                                key={idx}
                                className="rounded-xl border border-white/5 bg-white/[0.03] p-4"
                              >
                                <div className="h-4 w-28 animate-pulse rounded bg-white/10" />
                                <div className="mt-3 h-3 w-40 animate-pulse rounded bg-white/10" />
                              </div>
                            ))
                          ) : filteredUsers.length > 0 ? (
                            filteredUsers.map((u) => {
                              const isActive = recipientId === u._id;

                              return (
                                <button
                                  key={u._id}
                                  type="button"
                                  onClick={() => {
                                    setRecipientId(u._id);
                                    setDropdownOpen(false);
                                  }}
                                  className={`flex w-full items-center gap-4 rounded-xl border px-4 py-3 text-left transition-all duration-200 ${
                                    isActive
                                      ? 'border-cyan-300/30 bg-cyan-400/10'
                                      : 'border-white/5 bg-white/[0.03] hover:bg-white/[0.06]'
                                  }`}
                                >
                                  <div
                                    className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full ${
                                      isActive
                                        ? 'bg-cyan-400/15 text-cyan-300'
                                        : 'bg-white/[0.06] text-slate-300'
                                    }`}
                                  >
                                    <FiUser size={18} />
                                  </div>

                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-white">
                                      {u.firstName} {u.lastName}
                                    </p>
                                    <p className="truncate text-xs text-slate-400">
                                      {u.email}
                                    </p>
                                  </div>
                                </button>
                              );
                            })
                          ) : (
                            <div className="rounded-xl border border-white/5 bg-white/[0.03] px-4 py-6 text-center">
                              <p className="text-sm font-medium text-white">No users found</p>
                              <p className="mt-1 text-xs text-slate-400">
                                Try a different name or email search.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={sendMoney}
                    disabled={loading || !amount || !recipientId}
                    className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[linear-gradient(135deg,#67e8f9_0%,#38bdf8_45%,#3b82f6_100%)] px-5 py-4 text-sm font-semibold text-slate-950 shadow-[0_14px_34px_rgba(59,130,246,0.34)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(59,130,246,0.42)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <ImSpinner2 className="animate-spin" size={18} />
                        Sending transfer...
                      </>
                    ) : (
                      `Send ${parsedAmount > 0 ? formattedAmount : 'money'}`
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-[30px] border border-white/10 bg-white/[0.05] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                  <div className="mb-5">
                    <h2 className="text-lg font-semibold text-white">Transfer summary</h2>
                    <p className="mt-1 text-sm text-slate-400">
                      Review the details before you continue.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                    <div className="mb-5 flex items-center justify-between">
                      <span className="text-sm text-slate-400">Amount</span>
                      <span className="text-2xl font-semibold text-white tabular-nums">
                        {formattedAmount}
                      </span>
                    </div>

                    <div className="space-y-4 border-t border-white/10 pt-4">
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-sm text-slate-400">Recipient</span>
                        <div className="text-right">
                          <p className="text-sm font-medium text-white">
                            {selectedUser
                              ? `${selectedUser.firstName} ${selectedUser.lastName}`
                              : '--'}
                          </p>
                          <p className="text-xs text-slate-500">
                            {selectedUser?.email || 'Select a user'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-400">Transfer mode</span>
                        <span className="text-sm font-medium text-white">Instant internal</span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-400">Verification</span>
                        <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
                          2FA enabled
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-[30px] border border-white/10 bg-white/[0.05] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                  <h2 className="text-lg font-semibold text-white">Transfer notes</h2>
                  <div className="mt-4 space-y-3">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-sm font-medium text-white">Secure verification</p>
                      <p className="mt-1 text-sm leading-6 text-slate-400">
                        Some transfers may require OTP confirmation based on your security policy.
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-sm font-medium text-white">Live dashboard refresh</p>
                      <p className="mt-1 text-sm leading-6 text-slate-400">
                        After a successful transfer, balances and recent activity are refreshed automatically.
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-sm font-medium text-white">Recipient check</p>
                      <p className="mt-1 text-sm leading-6 text-slate-400">
                        Double-check the selected user and amount before submitting the transfer.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {dropdownOpen && (
          <button
            type="button"
            aria-label="Close recipient selector"
            onClick={() => setDropdownOpen(false)}
            className="fixed inset-0 z-[90] cursor-default bg-transparent"
          />
        )}
      </div>
    </div>
  );
};

export default P2PTransfer;