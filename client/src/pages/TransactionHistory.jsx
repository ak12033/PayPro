import React, { useState, useEffect, useMemo } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../api/api.js';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const TransactionHistory = () => {
  const [transactions, setTransactions] = useState([]);
  const [filter, setFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const { token } = useAuth();

  const filters = ['All', 'Transfer', 'Received', 'Payment'];

  const fetchTransactions = async () => {
    try {
      setLoading(true);

      const res = await api.get('/transactions/history', {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          page: currentPage,
          limit: 5,
          filter,
        },
      });

      setTransactions(res.data.transactions || []);
      setTotalPages(res.data.totalPages || 1);
    } catch (err) {
      console.error(err);
      toast.error('Failed to fetch transactions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchTransactions();
    }
  }, [currentPage, filter, token]);

  const summary = useMemo(() => {
    const total = transactions.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const credits = transactions
      .filter((item) => item.type !== 'Debit')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const debits = transactions
      .filter((item) => item.type === 'Debit')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    return {
      total,
      credits,
      debits,
      count: transactions.length,
    };
  }, [transactions]);

  const formatAmount = (amount) => `₹${Number(amount || 0).toLocaleString('en-IN')}`;

  const formatDate = (value) =>
    new Date(value).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

  const formatTime = (value) =>
    new Date(value).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

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
                  Ledger view
                </p>
                <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  Transaction history
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
                  Review account activity, filter transaction types, and inspect amounts with invoice-level detail.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-row">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Current filter
                  </p>
                  <p className="mt-1 text-sm font-medium text-white">{filter}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Page
                  </p>
                  <p className="mt-1 text-sm font-medium text-white">
                    {currentPage} / {totalPages}
                  </p>
                </div>
              </div>
            </div>

            <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.25)] backdrop-blur-xl">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  Visible transactions
                </p>
                <p className="mt-3 text-2xl font-semibold text-white tabular-nums">
                  {summary.count}
                </p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.25)] backdrop-blur-xl">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  Total volume
                </p>
                <p className="mt-3 text-2xl font-semibold text-white tabular-nums">
                  {formatAmount(summary.total)}
                </p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.25)] backdrop-blur-xl">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  Credits
                </p>
                <p className="mt-3 text-2xl font-semibold text-emerald-300 tabular-nums">
                  {formatAmount(summary.credits)}
                </p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.25)] backdrop-blur-xl">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  Debits
                </p>
                <p className="mt-3 text-2xl font-semibold text-red-300 tabular-nums">
                  {formatAmount(summary.debits)}
                </p>
              </div>
            </div>

            <div className="mb-6 rounded-[28px] border border-white/10 bg-white/[0.05] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">Filters</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Narrow the list to the transaction type you want to review.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  {filters.map((label) => {
                    const active = filter === label;

                    return (
                      <button
                        key={label}
                        onClick={() => {
                          setFilter(label);
                          setCurrentPage(1);
                        }}
                        className={`rounded-full border px-5 py-2.5 text-sm font-medium transition-all duration-200 ${
                          active
                            ? 'border-cyan-300/30 bg-cyan-400/12 text-cyan-300 shadow-[0_0_0_4px_rgba(34,211,238,0.08)]'
                            : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.07] hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.05] shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-6">
                <div>
                  <h2 className="text-lg font-semibold text-white">Recent records</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Detailed transaction entries with invoice and timestamp data.
                  </p>
                </div>

                <div className="hidden rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-400 sm:block">
                  5 items per page
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px] text-left">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-[0.18em] text-slate-500">
                      <th className="px-6 py-4 font-medium">Type</th>
                      <th className="px-6 py-4 font-medium">Category</th>
                      <th className="px-6 py-4 font-medium">Amount</th>
                      <th className="px-6 py-4 font-medium">Date & time</th>
                      <th className="px-6 py-4 font-medium">Invoice ID</th>
                    </tr>
                  </thead>

                  <tbody>
                    {loading ? (
                      [...Array(5)].map((_, index) => (
                        <tr key={index} className="border-b border-white/5">
                          <td className="px-6 py-5">
                            <div className="h-5 w-24 animate-pulse rounded bg-white/10" />
                          </td>
                          <td className="px-6 py-5">
                            <div className="h-5 w-24 animate-pulse rounded bg-white/10" />
                          </td>
                          <td className="px-6 py-5">
                            <div className="h-5 w-20 animate-pulse rounded bg-white/10" />
                          </td>
                          <td className="px-6 py-5">
                            <div className="h-5 w-36 animate-pulse rounded bg-white/10" />
                          </td>
                          <td className="px-6 py-5">
                            <div className="h-5 w-32 animate-pulse rounded bg-white/10" />
                          </td>
                        </tr>
                      ))
                    ) : transactions.length > 0 ? (
                      transactions.map((t) => {
                        const isDebit = t.type === 'Debit';

                        return (
                          <tr
                            key={t._id}
                            className="border-b border-white/5 text-sm text-slate-200 transition-colors duration-200 hover:bg-white/[0.035]"
                          >
                            <td className="px-6 py-5">
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                                  isDebit
                                    ? 'bg-red-400/10 text-red-300'
                                    : 'bg-emerald-400/10 text-emerald-300'
                                }`}
                              >
                                {t.type}
                              </span>
                            </td>

                            <td className="px-6 py-5 text-white">
                              {t.category || 'General'}
                            </td>

                            <td
                              className={`px-6 py-5 font-semibold tabular-nums ${
                                isDebit ? 'text-red-300' : 'text-emerald-300'
                              }`}
                            >
                              {isDebit ? '-' : '+'}
                              {formatAmount(t.amount)}
                            </td>

                            <td className="px-6 py-5">
                              <div className="text-white">{formatDate(t.createdAt)}</div>
                              <div className="mt-1 text-xs text-slate-500">
                                {formatTime(t.createdAt)}
                              </div>
                            </td>

                            <td className="px-6 py-5 font-mono text-sm text-slate-400">
                              {t.invoiceId || '--'}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan="5" className="px-6 py-14 text-center">
                          <div className="mx-auto max-w-md">
                            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-400">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-6 w-6"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={1.8}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M8 7h8M8 11h8M8 15h5M5.75 4h12.5A1.75 1.75 0 0120 5.75v12.5A1.75 1.75 0 0118.25 20H5.75A1.75 1.75 0 014 18.25V5.75A1.75 1.75 0 015.75 4z"
                                />
                              </svg>
                            </div>
                            <h3 className="text-lg font-semibold text-white">
                              No transactions found
                            </h3>
                            <p className="mt-2 text-sm leading-6 text-slate-400">
                              Try changing the filter or come back after new activity is recorded.
                            </p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-4 border-t border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <button
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>

                <div className="text-sm text-slate-400">
                  Page <span className="font-medium text-white">{currentPage}</span> of{' '}
                  <span className="font-medium text-white">{totalPages}</span>
                </div>

                <button
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                  }
                  disabled={currentPage === totalPages}
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TransactionHistory;