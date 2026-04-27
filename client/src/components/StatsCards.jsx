import React from 'react';
import {
  FaWallet,
  FaExchangeAlt,
  FaArrowUp,
  FaArrowDown,
} from 'react-icons/fa';

const StatsCards = ({
  balance = 0,
  totalTransactions = 0,
  totalSent = 0,
  totalReceived = 0,
}) => {
  const formatCurrency = (value) =>
    `₹${Number(value || 0).toLocaleString('en-IN')}`;

  const formatNumber = (value) =>
    Number(value || 0).toLocaleString('en-IN');

  const cards = [
    {
      title: 'Current balance',
      value: formatCurrency(balance),
      icon: FaWallet,
      iconClass: 'bg-emerald-400/12 text-emerald-300',
      meta: 'Available funds',
    },
    {
      title: 'Total transactions',
      value: formatNumber(totalTransactions),
      icon: FaExchangeAlt,
      iconClass: 'bg-cyan-400/12 text-cyan-300',
      meta: 'All recorded entries',
    },
    {
      title: 'Total sent',
      value: formatCurrency(totalSent),
      icon: FaArrowUp,
      iconClass: 'bg-red-400/12 text-red-300',
      meta: 'Outgoing transfers',
    },
    {
      title: 'Total received',
      value: formatCurrency(totalReceived),
      icon: FaArrowDown,
      iconClass: 'bg-violet-400/12 text-violet-300',
      meta: 'Incoming transfers',
    },
  ];

  return (
    <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;

        return (
          <div
            key={card.title}
            className="group relative overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.05] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:bg-white/[0.07] hover:shadow-[0_24px_60px_rgba(0,0,0,0.34)]"
          >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                  {card.title}
                </p>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white tabular-nums">
                  {card.value}
                </h2>
              </div>

              <div
                className={`flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 ${card.iconClass}`}
              >
                <Icon size={18} />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
              <span className="text-sm text-slate-400">{card.meta}</span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-slate-500">
                Live
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default StatsCards;