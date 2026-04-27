import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { FaChartPie } from 'react-icons/fa';

const TransactionChart = ({ sent = 0, received = 0, added = 0 }) => {
  const data = [
    { name: 'Sent', value: Number(sent || 0), color: '#f87171', tone: 'text-red-300 bg-red-400/10' },
    { name: 'Received', value: Number(received || 0), color: '#34d399', tone: 'text-emerald-300 bg-emerald-400/10' },
    { name: 'Added', value: Number(added || 0), color: '#38bdf8', tone: 'text-cyan-300 bg-cyan-400/10' },
  ];

  const total = data.reduce((sum, item) => sum + item.value, 0);

  const formatCurrency = (value) =>
    `₹${Number(value || 0).toLocaleString('en-IN')}`;

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;

    const item = payload[0]?.payload;
    if (!item) return null;

    const percent = total ? ((item.value / total) * 100).toFixed(1) : '0.0';

    return (
      <div className="rounded-2xl border border-white/10 bg-[#0f1a2b]/95 px-4 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        <p className="text-sm font-medium text-white">{item.name}</p>
        <p className="mt-1 text-sm text-slate-400">{formatCurrency(item.value)}</p>
        <p className="mt-1 text-xs text-slate-500">{percent}% of total volume</p>
      </div>
    );
  };

  return (
    <div className="mt-10 rounded-[30px] border border-white/10 bg-white/[0.05] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-300">
            <FaChartPie size={20} />
          </div>

          <div>
            <h2 className="text-xl font-semibold tracking-tight text-white">
              Transaction summary
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Distribution of sent, received, and added funds.
            </p>
          </div>
        </div>

        <div className="hidden rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 sm:block">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
            Total volume
          </p>
          <p className="mt-1 text-sm font-medium text-white tabular-nums">
            {formatCurrency(total)}
          </p>
        </div>
      </div>

      <div className="grid gap-8 xl:grid-cols-[1fr_280px] xl:items-center">
        <div className="relative h-[320px] w-full">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="flex h-32 w-32 flex-col items-center justify-center rounded-full border border-white/10 bg-[#0b1523]/80 text-center shadow-[0_10px_30px_rgba(0,0,0,0.25)] backdrop-blur-xl">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                Total
              </p>
              <p className="mt-2 text-lg font-semibold text-white tabular-nums">
                {formatCurrency(total)}
              </p>
            </div>
          </div>

          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                innerRadius={78}
                outerRadius={115}
                paddingAngle={4}
                stroke="rgba(255,255,255,0.05)"
                strokeWidth={2}
              >
                {data.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>

              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="space-y-3">
          {data.map((item) => {
            const percent = total ? ((item.value / total) * 100).toFixed(1) : '0.0';

            return (
              <div
                key={item.name}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <p className="text-sm font-medium text-white">{item.name}</p>
                  </div>

                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${item.tone}`}>
                    {percent}%
                  </span>
                </div>

                <div className="mt-3 flex items-end justify-between gap-3">
                  <p className="text-lg font-semibold text-white tabular-nums">
                    {formatCurrency(item.value)}
                  </p>
                  <p className="text-xs text-slate-500">Share of total</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default TransactionChart;