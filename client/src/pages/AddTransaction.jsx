import React, { useMemo, useState } from 'react';
import api from '../api/api.js';
import Sidebar from '../components/Sidebar';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const AddTransaction = () => {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('General');
  const [type, setType] = useState('expense');
  const [loading, setLoading] = useState(false);

  const { token, fetchDashboardData } = useAuth();

  const categories = ['General', 'Food', 'Transport', 'Bills', 'Shopping', 'Health'];
  const numericAmount = Number(amount);
  const isValid = description.trim() && numericAmount > 0;

  const formattedAmount = useMemo(() => {
    if (!numericAmount || numericAmount <= 0) return '₹0';
    return `₹${numericAmount.toLocaleString('en-IN')}`;
  }, [numericAmount]);

  const addTransaction = async () => {
    if (!description || !amount) {
      toast.error('Please fill out both fields.');
      return;
    }

    try {
      setLoading(true);

      await api.post(
        '/transactions/add',
        {
          description,
          amount,
          category,
          type,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success('Transaction successfully added!');
      setDescription('');
      setAmount('');
      setCategory('General');
      setType('expense');

      await fetchDashboardData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add transaction.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#07111f] text-white">
      <Sidebar />

      <div className="relative flex-1 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.10),_transparent_26%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.08),_transparent_28%),linear-gradient(180deg,#08111e_0%,#0b1626_100%)]" />
        <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:72px_72px]" />

        <div className="relative z-10 h-screen overflow-y-auto px-5 py-6 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-6xl">
            <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-[0.24em] text-cyan-300/75">
                  Transaction entry
                </p>
                <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  Add transaction
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
                  Record a new expense or income entry and keep your account activity updated in real time.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-row">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Entry mode
                  </p>
                  <p className="mt-1 text-sm font-medium text-white">Manual</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Sync
                  </p>
                  <p className="mt-1 text-sm font-medium text-emerald-300">Live dashboard</p>
                </div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-8">
                <div className="mb-8 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-white">Transaction details</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      Add a clean description, choose a category, and enter the amount.
                    </p>
                  </div>

                  <div className="hidden h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-300 sm:flex">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-7 w-7"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.8}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 6v12M6 12h12"
                      />
                    </svg>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-200">
                      Description
                    </label>
                    <input
                      className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-[15px] text-white placeholder:text-slate-500 outline-none transition-all duration-200 focus:border-cyan-300/50 focus:bg-white/[0.06] focus:shadow-[0_0_0_4px_rgba(34,211,238,0.08)]"
                      placeholder="e.g. Grocery shopping"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-slate-200">
                        Type
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setType('expense')}
                          className={`rounded-2xl border px-4 py-3 text-sm font-medium transition-all duration-200 ${
                            type === 'expense'
                              ? 'border-red-300/30 bg-red-400/10 text-red-200'
                              : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.07] hover:text-white'
                          }`}
                        >
                          Expense
                        </button>
                        <button
                          type="button"
                          onClick={() => setType('income')}
                          className={`rounded-2xl border px-4 py-3 text-sm font-medium transition-all duration-200 ${
                            type === 'income'
                              ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200'
                              : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.07] hover:text-white'
                          }`}
                        >
                          Income
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-slate-200">
                        Category
                      </label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-[15px] text-white outline-none transition-all duration-200 focus:border-cyan-300/50 focus:bg-white/[0.06] focus:shadow-[0_0_0_4px_rgba(34,211,238,0.08)]"
                      >
                        {categories.map((item) => (
                          <option key={item} value={item} className="bg-[#0b1626] text-white">
                            {item}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-200">
                      Amount
                    </label>

                    <div className="flex items-center rounded-xl border border-white/10 bg-white/[0.04] px-4 transition-all duration-200 focus-within:border-cyan-300/50 focus-within:bg-white/[0.06] focus-within:shadow-[0_0_0_4px_rgba(34,211,238,0.08)]">
                      <span className="mr-3 text-lg font-semibold text-cyan-300">₹</span>
                      <input
                        type="number"
                        min="0"
                        className="w-full bg-transparent py-3.5 text-[15px] text-white placeholder:text-slate-500 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        placeholder="e.g. 1200"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <p className="mb-3 text-sm font-medium text-slate-300">
                      Quick categories
                    </p>
                    <div className="flex flex-wrap gap-3">
                      {categories.map((item) => {
                        const active = category === item;
                        return (
                          <button
                            key={item}
                            type="button"
                            onClick={() => setCategory(item)}
                            className={`rounded-full border px-4 py-2 text-sm transition-all duration-200 ${
                              active
                                ? 'border-cyan-300/40 bg-cyan-400/12 text-cyan-300'
                                : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.07] hover:text-white'
                            }`}
                          >
                            {item}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    onClick={addTransaction}
                    disabled={loading || !isValid}
                    className="group relative inline-flex w-full items-center justify-center overflow-hidden rounded-xl bg-[linear-gradient(135deg,#4ade80_0%,#22c55e_45%,#16a34a_100%)] px-6 py-3.5 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(34,197,94,0.28)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(22,163,74,0.34)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="absolute inset-0 bg-white/0 transition group-hover:bg-white/10" />
                    <span className="relative flex items-center gap-2">
                      {loading ? (
                        <>
                          <Loader2 className="animate-spin" size={18} />
                          Saving transaction...
                        </>
                      ) : (
                        'Add transaction'
                      )}
                    </span>
                  </button>
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-cyan-300/75">
                    Preview
                  </p>

                  <div className="mt-5 rounded-3xl border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm text-slate-400">Description</p>
                        <h3 className="mt-2 text-lg font-semibold text-white">
                          {description || 'Untitled transaction'}
                        </h3>
                      </div>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          type === 'income'
                            ? 'bg-emerald-400/10 text-emerald-300'
                            : 'bg-red-400/10 text-red-300'
                        }`}
                      >
                        {type === 'income' ? 'Income' : 'Expense'}
                      </span>
                    </div>

                    <div className="mt-6 grid gap-4 sm:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          Category
                        </p>
                        <p className="mt-2 text-sm font-medium text-white">{category}</p>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          Amount
                        </p>
                        <p
                          className={`mt-2 text-xl font-semibold tabular-nums ${
                            type === 'income' ? 'text-emerald-300' : 'text-white'
                          }`}
                        >
                          {type === 'income' ? '+' : '-'}
                          {formattedAmount}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 space-y-4">
                    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                      <span className="text-sm text-slate-400">Validation</span>
                      <span className="text-sm font-medium text-white">
                        {isValid ? 'Ready to save' : 'Missing fields'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                      <span className="text-sm text-slate-400">Update mode</span>
                      <span className="text-sm font-medium text-white">Live refresh</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-cyan-300/75">
                    Entry tips
                  </p>

                  <div className="mt-5 space-y-4">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <h3 className="text-sm font-medium text-white">Keep labels clear</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-400">
                        Short descriptions make transaction history easier to scan.
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <h3 className="text-sm font-medium text-white">Choose the right type</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-400">
                        Mark entries as income or expense for cleaner reporting.
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <h3 className="text-sm font-medium text-white">Use categories consistently</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-400">
                        Consistent categorization improves dashboard summaries.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddTransaction;