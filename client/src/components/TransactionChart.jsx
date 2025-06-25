import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { FaChartPie } from 'react-icons/fa';

const TransactionChart = ({ sent, received, added }) => {
    const data = [
        { name: 'Sent', value: sent },
        { name: 'Received', value: received },
        { name: 'Added', value: added },
    ];

    return (
        <div className="mt-10 p-10 bg-gradient-to-br from-[#f8fafc]/70 via-white/60 to-[#e2e8f0]/50 backdrop-blur-3xl rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.08)] hover:shadow-[0_24px_70px_rgba(0,0,0,0.12)] transition duration-500">
            <div className="flex items-center gap-4 mb-8">
                <div className="p-5 bg-gradient-to-tr from-indigo-500 via-purple-600 to-pink-500 text-white rounded-2xl shadow">
                    <FaChartPie size={24} />
                </div>
                <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">Transaction Summary</h2>
            </div>

            <ResponsiveContainer width="100%" height={340}>
                <PieChart>
                    <defs>
                        <linearGradient id="gradSent" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#f43f5e" />
                            <stop offset="100%" stopColor="#ec4899" />
                        </linearGradient>
                        <linearGradient id="gradReceived" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#14b8a6" />
                            <stop offset="100%" stopColor="#22c55e" />
                        </linearGradient>
                        <linearGradient id="gradAdded" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#facc15" />
                            <stop offset="100%" stopColor="#f59e0b" />
                        </linearGradient>
                        <radialGradient id="gradBg" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="#ffffff" />
                            <stop offset="100%" stopColor="#f1f5f9" />
                        </radialGradient>
                    </defs>

                    <Pie
                        dataKey="value"
                        data={data}
                        cx="50%"
                        cy="50%"
                        outerRadius={110}
                        innerRadius={55}
                        fill="url(#gradBg)"
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                        labelRadius={125}
                        className="transition-transform duration-300"
                    >
                        <Cell fill="url(#gradSent)" />
                        <Cell fill="url(#gradReceived)" />
                        <Cell fill="url(#gradAdded)" />
                    </Pie>

                    <Tooltip
                        contentStyle={{
                            borderRadius: '16px',
                            background: '#ffffffdd',
                            boxShadow: '0 0 16px rgba(0,0,0,0.1)',
                            backdropFilter: 'blur(8px)',
                        }}
                        itemStyle={{ fontSize: '14px', color: '#374151' }}
                    />

                    <Legend
                        verticalAlign="bottom"
                        height={50}
                        iconType="circle"
                        wrapperStyle={{
                            fontSize: '15px',
                            color: '#334155',
                            marginTop: '20px',
                            padding: '0 30px',
                        }}
                    />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
};

export default TransactionChart;
