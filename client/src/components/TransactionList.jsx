import React from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDate } from '../utils/formatDate';
import * as LucideIcons from 'lucide-react';

const TransactionList = ({ transactions = [] }) => {
  const navigate = useNavigate();

  const getIcon = (iconName) => {
    const Icon = LucideIcons[iconName];
    return Icon ? <Icon size={18} /> : <LucideIcons.CircleDollarSign size={18} />;
  };

  const getIconTone = (t) => {
    if (t.type === 'Debit') {
      return 'bg-red-400/10 text-red-300';
    }
    return 'bg-emerald-400/10 text-emerald-300';
  };

  const getAmountTone = (t) => {
    return t.type === 'Debit' ? 'text-red-300' : 'text-emerald-300';
  };

  const getSignedAmount = (t) => {
    const amount = Number(t.amount || 0).toLocaleString('en-IN');
    return t.type === 'Debit' ? `-₹${amount}` : `+₹${amount}`;
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-white">
            Recent transactions
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Latest account activity across payments, transfers, and credits.
          </p>
        </div>

        <button
          onClick={() => navigate('/transactions')}
          className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-cyan-300 transition hover:bg-white/[0.08] hover:text-cyan-200"
        >
          See all
        </button>
      </div>

      {transactions.length > 0 ? (
        <div className="space-y-3">
          {transactions.map((t) => (
            <div
              key={t._id}
              className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-all duration-200 hover:bg-white/[0.05] sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-4">
                <div
                  className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl ${getIconTone(t)}`}
                >
                  {getIcon(t.icon)}
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-medium text-white sm:text-base">
                      {t.description || 'Transaction'}
                    </h3>

                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                        t.type === 'Debit'
                          ? 'bg-red-400/10 text-red-300'
                          : 'bg-emerald-400/10 text-emerald-300'
                      }`}
                    >
                      {t.type}
                    </span>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 sm:text-sm">
                    <span>{formatDate(t.createdAt)}</span>
                    {t.category ? (
                      <>
                        <span className="text-slate-600">•</span>
                        <span>{t.category}</span>
                      </>
                    ) : null}
                    {t.invoiceId ? (
                      <>
                        <span className="text-slate-600">•</span>
                        <span className="font-mono">#{t.invoiceId}</span>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 sm:block sm:text-right">
                <p
                  className={`text-base font-semibold tabular-nums sm:text-lg ${getAmountTone(
                    t
                  )}`}
                >
                  {getSignedAmount(t)}
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                  {t.type === 'Debit' ? 'Outgoing' : 'Incoming'}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-400">
            <LucideIcons.ReceiptText size={22} />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-white">
            No recent transactions
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Once account activity starts appearing, your latest transactions will show up here.
          </p>
        </div>
      )}
    </div>
  );
};

export default TransactionList;