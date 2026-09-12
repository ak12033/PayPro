import React, { useState, useEffect, useRef } from 'react';
import {
  TrendingUp, TrendingDown, CreditCard, Send, Plus, ArrowUpRight, ArrowDownLeft,
  Shield, ShieldCheck, Lock, Smartphone, Laptop, Eye, EyeOff, Bell, Search,
  ChevronRight, Filter, Download, DollarSign, Wallet, Activity, RefreshCw,
  CheckCircle2, AlertCircle, X, ChevronDown, Award, PieChart, Check, Globe,
  Copy, Layers, User, MoreVertical, Sliders, Moon, Sun, Cpu
} from 'lucide-react';

// ==========================================
// 1. DATA MODELS & MOCK FINANCIAL ENGINE
// ==========================================

const INITIAL_METRICS = {
  totalBalance: 284562.84,
  monthlyIncome: 18420.00,
  monthlySpending: 7842.18,
  investments: 142680.52,
  savings: 82450.20,
  securityScore: 94
};

const CHART_DATA = {
  '7D': [
    { label: 'Mon', val: 278100 },
    { label: 'Tue', val: 279500 },
    { label: 'Wed', val: 279000 },
    { label: 'Thu', val: 281200 },
    { label: 'Fri', val: 283000 },
    { label: 'Sat', val: 283800 },
    { label: 'Sun', val: 284562 }
  ],
  '1M': [
    { label: 'Week 1', val: 252000 },
    { label: 'Week 2', val: 261400 },
    { label: 'Week 3', val: 273000 },
    { label: 'Week 4', val: 284562 }
  ],
  '3M': [
    { label: 'May', val: 220000 },
    { label: 'Jun', val: 245000 },
    { label: 'Jul', val: 284562 }
  ],
  '6M': [
    { label: 'Feb', val: 195000 },
    { label: 'Mar', val: 210000 },
    { label: 'Apr', val: 230000 },
    { label: 'May', val: 220000 },
    { label: 'Jun', val: 245000 },
    { label: 'Jul', val: 284562 }
  ],
  '1Y': [
    { label: 'Q3 25', val: 140000 },
    { label: 'Q4 25', val: 175000 },
    { label: 'Q1 26', val: 210000 },
    { label: 'Q2 26', val: 284562 }
  ]
};

const INITIAL_TRANSACTIONS = [
  { id: 'TX-9021', merchant: 'Stripe Payout', category: 'Income', amount: 4850.00, type: 'income', status: 'completed', date: 'Today, 2:45 PM', account: 'Main Checking', icon: 'DollarSign' },
  { id: 'TX-9022', merchant: 'Apple Store', category: 'Shopping', amount: 1299.00, type: 'expense', status: 'completed', date: 'Today, 11:30 AM', account: 'Titanium Card', icon: 'Laptop' },
  { id: 'TX-9023', merchant: 'Acme Technologies', category: 'Salary', amount: 8500.00, type: 'income', status: 'completed', date: 'Yesterday', account: 'Main Checking', icon: 'Wallet' },
  { id: 'TX-9024', merchant: 'Airbnb Reserve', category: 'Travel', amount: 840.50, type: 'expense', status: 'completed', date: 'Jul 22, 2026', account: 'Titanium Card', icon: 'Globe' },
  { id: 'TX-9025', merchant: 'Coinbase Deposit', category: 'Investment', amount: 1500.00, type: 'transfer', status: 'completed', date: 'Jul 21, 2026', account: 'Vault', icon: 'Activity' },
  { id: 'TX-9026', merchant: 'Uber Black', category: 'Transportation', amount: 64.20, type: 'expense', status: 'completed', date: 'Jul 20, 2026', account: 'Titanium Card', icon: 'Shield' },
  { id: 'TX-9027', merchant: 'Figma Subscription', category: 'Subscriptions', amount: 45.00, type: 'expense', status: 'pending', date: 'Jul 19, 2026', account: 'Titanium Card', icon: 'Cpu' },
  { id: 'TX-9028', merchant: 'Transfer to Savings', category: 'Transfers', amount: 2000.00, type: 'transfer', status: 'completed', date: 'Jul 18, 2026', account: 'High-Yield Reserve', icon: 'RefreshCw' }
];

const INVESTMENT_ASSETS = [
  { symbol: 'AAPL', name: 'Apple Inc.', price: 234.50, change: 1.84, holdings: 14200.00, sparkline: [220, 224, 222, 228, 231, 234.5] },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', price: 128.90, change: 4.12, holdings: 38400.00, sparkline: [110, 115, 118, 122, 125, 128.9] },
  { symbol: 'MSFT', name: 'Microsoft Corp.', price: 448.20, change: -0.45, holdings: 22100.00, sparkline: [452, 450, 449, 451, 447, 448.2] },
  { symbol: 'BTC', name: 'Bitcoin', price: 68420.00, change: 3.65, holdings: 42100.00, sparkline: [62000, 64000, 63500, 66000, 67800, 68420] },
  { symbol: 'ETH', name: 'Ethereum', price: 3540.80, change: -1.20, holdings: 25880.52, sparkline: [3620, 3600, 3580, 3590, 3520, 3540.8] }
];

const SPENDING_CATEGORIES = [
  { name: 'Shopping', amount: 2450.00, pct: 31, color: '#6366f1' },
  { name: 'Travel & Dining', amount: 1840.50, pct: 23, color: '#8b5cf6' },
  { name: 'Subscriptions', amount: 1120.00, pct: 14, color: '#06b6d4' },
  { name: 'Housing & Utilities', amount: 1450.00, pct: 18, color: '#10b981' },
  { name: 'Transportation', amount: 981.68, pct: 14, color: '#f59e0b' }
];

const FINANCIAL_GOALS = [
  { id: 1, title: 'Emergency Reserve', current: 21500, target: 25000, category: 'Security' },
  { id: 2, title: 'Next Gen Workspace', current: 2400, target: 3500, category: 'Hardware' },
  { id: 3, title: 'Kyoto Sanctuary Fund', current: 6200, target: 8000, category: 'Travel' }
];

const NOTIFICATIONS_DATA = [
  { id: 1, title: 'Large Transfer Alert', desc: 'Received $4,850.00 from Stripe Payout', time: '10m ago', unread: true },
  { id: 2, title: 'Security Check Passed', desc: 'New session authenticated on MacBook Pro 16"', time: '1h ago', unread: true },
  { id: 3, title: 'Dividend Yield Credited', desc: 'NVDA yield of $142.50 deposited', time: '1d ago', unread: false }
];

const CURRENCIES = { USD: '$', EUR: '€', GBP: '£', INR: '₹' };

// ==========================================
// 2. MAIN APPLICATION COMPONENT
// ==========================================

export default function App() {
  const [activeTab, setActiveTab] = useState('Overview');
  const [currency, setCurrency] = useState('USD');
  const [chartPeriod, setChartPeriod] = useState('1M');
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [transactions, setTransactions] = useState(INITIAL_TRANSACTIONS);
  const [notifications, setNotifications] = useState(NOTIFICATIONS_DATA);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [balance, setBalance] = useState(INITIAL_METRICS.totalBalance);
  
  // Ambient Mouse Follow Effect
  useEffect(() => {
    const handleMouseMove = (e) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const currSymbol = CURRENCIES[currency];

  const formatCurr = (val) => {
    let multiplier = 1;
    if (currency === 'EUR') multiplier = 0.92;
    if (currency === 'GBP') multiplier = 0.78;
    if (currency === 'INR') multiplier = 83.5;
    const computed = val * multiplier;
    return `${currSymbol}${computed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="relative min-h-screen bg-[#050816] text-slate-100 font-sans antialiased overflow-x-hidden selection:bg-indigo-500 selection:text-white">
      
      {/* Dynamic Inline Styles for Scaffolding & Dynamic CSS */}
      <style>{`
        @keyframes subtlePulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.05); }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        .animate-shimmer {
          animation: shimmer 3.5s infinite linear;
        }
        .perspective-1000 {
          perspective: 1000px;
        }
        .transform-style-3d {
          transform-style: preserve-3d;
        }
        .backface-hidden {
          backface-visibility: hidden;
        }
        .rotate-y-180 {
          transform: rotateY(180deg);
        }
        .glass-panel {
          background: rgba(17, 25, 54, 0.55);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4);
        }
        .glass-card {
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.06);
        }
        .glass-card:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(99, 102, 241, 0.3);
        }
        /* Hide scrollbars for slick look */
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #050816; }
        ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(99, 102, 241, 0.4); }
      `}</style>

      {/* AURORA & AMBIENT BACKGROUND SYSTEM */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div 
          className="absolute -top-[10%] -left-[10%] w-[50vw] h-[50vw] rounded-full bg-indigo-900/20 blur-[130px] transition-all duration-1000 ease-out"
          style={{ animation: 'subtlePulse 12s infinite ease-in-out' }}
        />
        <div 
          className="absolute top-[30%] -right-[10%] w-[45vw] h-[45vw] rounded-full bg-violet-900/15 blur-[140px] transition-all duration-1000 ease-out"
          style={{ animation: 'subtlePulse 16s infinite ease-in-out 2s' }}
        />
        <div 
          className="absolute -bottom-[10%] left-[20%] w-[40vw] h-[40vw] rounded-full bg-cyan-900/15 blur-[120px] transition-all duration-1000 ease-out"
        />
        {/* Interactive Mouse Gradient Glow */}
        <div 
          className="hidden md:block absolute w-[600px] h-[600px] rounded-full bg-indigo-500/5 blur-[100px] transition-transform duration-300 pointer-events-none"
          style={{
            transform: `translate(${mousePos.x - 300}px, ${mousePos.y - 300}px)`
          }}
        />
        {/* Micro Grid Overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
      </div>

      {/* APPLICATION CONTAINER */}
      <div className="relative z-10 flex min-h-screen">
        
        {/* SIDEBAR NAVIGATION */}
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

        {/* MAIN CONTENT AREA */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          
          {/* HEADER */}
          <Header 
            currency={currency} 
            setCurrency={setCurrency} 
            isNotifOpen={isNotifOpen} 
            setIsNotifOpen={setIsNotifOpen}
            notifications={notifications}
          />

          {/* DASHBOARD BODY */}
          <main className="flex-1 p-4 sm:p-6 md:p-8 max-w-[1600px] w-full mx-auto space-y-8">
            
            {/* HERO BALANCE SECTION */}
            <HeroSection 
              balance={balance} 
              formatCurr={formatCurr} 
              onSendClick={() => setIsSendModalOpen(true)}
              onAddClick={() => setIsAddModalOpen(true)}
            />

            {/* METRIC CARDS ROW */}
            <MetricGrid metrics={INITIAL_METRICS} formatCurr={formatCurr} />

            {/* MAIN CHART & VIRTUAL CARD GRID */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-8">
                <FinancialChart 
                  period={chartPeriod} 
                  setPeriod={setChartPeriod} 
                  formatCurr={formatCurr} 
                />
              </div>
              <div className="lg:col-span-4 space-y-6">
                <VirtualCard3D formatCurr={formatCurr} />
                <QuickTransferWidget />
              </div>
            </div>

            {/* SECONDARY SECTION: TRANSACTIONS & SPENDING ANALYTICS */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8">
                <TransactionList 
                  transactions={transactions} 
                  formatCurr={formatCurr} 
                />
              </div>
              <div className="lg:col-span-4 space-y-6">
                <SpendingAnalytics formatCurr={formatCurr} />
                <GoalsWidget formatCurr={formatCurr} />
              </div>
            </div>

            {/* TERTIARY SECTION: INVESTMENTS & SECURITY */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8">
                <InvestmentPortfolio formatCurr={formatCurr} />
              </div>
              <div className="lg:col-span-4">
                <SecurityOverview score={INITIAL_METRICS.securityScore} />
              </div>
            </div>

          </main>

          {/* FOOTER */}
          <footer className="py-6 px-8 border-t border-slate-800/40 text-xs text-slate-500 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span>Aether Engine v4.8 • Quantum End-to-End Encrypted</span>
            </div>
            <div>© 2026 AETHER FINTECH CORP. ALL RIGHTS RESERVED.</div>
          </footer>

        </div>
      </div>

      {/* NOTIFICATION PANEL SLIDE-OUT */}
      {isNotifOpen && (
        <NotificationPanel 
          notifications={notifications} 
          setNotifications={setNotifications}
          onClose={() => setIsNotifOpen(false)} 
        />
      )}

      {/* SEND MONEY MODAL */}
      {isSendModalOpen && (
        <SendMoneyModal 
          onClose={() => setIsSendModalOpen(false)} 
          formatCurr={formatCurr}
          onSuccess={(amount) => {
            setBalance(prev => prev - amount);
            const newTx = {
              id: `TX-${Math.floor(1000 + Math.random() * 9000)}`,
              merchant: 'Outgoing Transfer',
              category: 'Transfers',
              amount: parseFloat(amount),
              type: 'expense',
              status: 'completed',
              date: 'Just now',
              account: 'Main Checking',
              icon: 'Send'
            };
            setTransactions([newTx, ...transactions]);
          }}
        />
      )}

      {/* ADD MONEY MODAL */}
      {isAddModalOpen && (
        <AddMoneyModal 
          onClose={() => setIsAddModalOpen(false)} 
          formatCurr={formatCurr}
          onSuccess={(amount) => {
            setBalance(prev => prev + amount);
            const newTx = {
              id: `TX-${Math.floor(1000 + Math.random() * 9000)}`,
              merchant: 'Vault Deposit',
              category: 'Income',
              amount: parseFloat(amount),
              type: 'income',
              status: 'completed',
              date: 'Just now',
              account: 'Main Checking',
              icon: 'Plus'
            };
            setTransactions([newTx, ...transactions]);
          }}
        />
      )}

    </div>
  );
}

// ==========================================
// 3. NAVIGATION & HEADER COMPONENTS
// ==========================================

function Sidebar({ activeTab, setActiveTab }) {
  const navItems = [
    { label: 'Overview', icon: LayoutDashboardIcon },
    { label: 'Transactions', icon: RefreshCw },
    { label: 'Analytics', icon: PieChart },
    { label: 'Investments', icon: TrendingUp },
    { label: 'Cards', icon: CreditCard },
    { label: 'Security', icon: ShieldCheck },
    { label: 'Settings', icon: Sliders }
  ];

  return (
    <aside className="hidden lg:flex flex-col w-64 glass-panel border-r border-slate-800/60 p-5 space-y-8 z-20">
      {/* BRAND LOGO */}
      <div className="flex items-center gap-3 px-2">
        <div className="relative w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-violet-600 to-cyan-400 p-[1px] flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <div className="w-full h-full bg-[#050816] rounded-[11px] flex items-center justify-center">
            <Layers className="w-5 h-5 text-indigo-400" />
          </div>
        </div>
        <div>
          <span className="font-bold text-lg tracking-wider text-white">AETHER</span>
          <span className="text-[10px] block text-indigo-400 font-mono tracking-widest uppercase">PRO PLATFORM</span>
        </div>
      </div>

      {/* NAVIGATION LINKS */}
      <nav className="flex-1 space-y-1.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.label;
          return (
            <button
              key={item.label}
              onClick={() => setActiveTab(item.label)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 group relative ${
                isActive 
                  ? 'text-white bg-gradient-to-r from-indigo-600/20 to-violet-600/10 border border-indigo-500/30 shadow-lg shadow-indigo-500/10' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 transition-transform duration-200 group-hover:scale-110 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>
              {isActive && (
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 shadow-[0_0_8px_#818cf8]" />
              )}
            </button>
          );
        })}
      </nav>

      {/* SYSTEM STATUS CARD */}
      <div className="p-4 rounded-xl glass-card space-y-3 relative overflow-hidden">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">Vault Security</span>
          <span className="text-emerald-400 font-mono">ENCRYPTED</span>
        </div>
        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-500 to-emerald-400 h-full w-[94%]" />
        </div>
        <p className="text-[11px] text-slate-500">Node ID: 0x948...A9F2</p>
      </div>

      {/* USER PROFILE */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-800/60 px-2">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 to-cyan-400 p-[1px]">
              <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center font-bold text-xs text-white">
                AX
              </div>
            </div>
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#050816]" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-slate-200 leading-none">Alex Mercer</p>
            <p className="text-[11px] text-slate-500 mt-1">Prime Account</p>
          </div>
        </div>
        <MoreVertical className="w-4 h-4 text-slate-500 cursor-pointer hover:text-white" />
      </div>
    </aside>
  );
}

function LayoutDashboardIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  );
}

function Header({ currency, setCurrency, isNotifOpen, setIsNotifOpen, notifications }) {
  const unreadCount = notifications.filter(n => n.unread).length;

  return (
    <header className="sticky top-0 z-30 glass-panel border-b border-slate-800/60 px-4 sm:px-8 py-4 flex items-center justify-between">
      {/* SEARCH BAR */}
      <div className="relative w-48 sm:w-72">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input 
          type="text" 
          placeholder="Search transactions, assets..." 
          className="w-full bg-slate-900/60 border border-slate-800/80 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all"
        />
      </div>

      {/* CONTROLS & NOTIFICATIONS */}
      <div className="flex items-center gap-3">
        {/* CURRENCY SELECTOR */}
        <div className="relative">
          <select 
            value={currency} 
            onChange={(e) => setCurrency(e.target.value)}
            className="bg-slate-900/60 border border-slate-800/80 rounded-xl px-3 py-2 text-xs font-mono text-slate-300 focus:outline-none focus:border-indigo-500/50 cursor-pointer hover:bg-slate-800/40 transition-colors"
          >
            <option value="USD">USD ($)</option>
            <option value="EUR">EUR (€)</option>
            <option value="GBP">GBP (£)</option>
            <option value="INR">INR (₹)</option>
          </select>
        </div>

        {/* NOTIFICATION BUTTON */}
        <button 
          onClick={() => setIsNotifOpen(!isNotifOpen)}
          className="relative p-2 rounded-xl bg-slate-900/60 border border-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-800/40 transition-all"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
          )}
        </button>

        {/* QUICK LIVE STATUS */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>MARKET OPEN</span>
        </div>
      </div>
    </header>
  );
}

// ==========================================
// 4. HERO SECTION & ACTION CARDS
// ==========================================

function HeroSection({ balance, formatCurr, onSendClick, onAddClick }) {
  return (
    <div className="relative overflow-hidden rounded-3xl glass-panel p-6 sm:p-8 border border-slate-800/80">
      {/* Background Ambient Glow & Shimmer Line */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/10 rounded-full blur-[90px] pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent animate-shimmer pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-slate-400 text-xs font-medium tracking-wide">
            <span>GOOD EVENING, ALEX</span>
            <span className="text-slate-600">•</span>
            <span className="text-indigo-400">PRIME TIER</span>
          </div>
          
          <div className="mt-2 flex items-baseline gap-4 flex-wrap">
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white font-mono">
              <CountUpValue value={balance} formatFn={formatCurr} />
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
              <TrendingUp className="w-3.5 h-3.5" />
              +12.84% this month
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">Net Liquid Capital across 4 connected accounts</p>
        </div>

        {/* QUICK ACTION BUTTONS */}
        <div className="flex items-center gap-3">
          <button 
            onClick={onSendClick}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-medium text-xs shadow-lg shadow-indigo-500/25 transition-all duration-200 active:scale-95 group"
          >
            <Send className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            <span>Send Money</span>
          </button>
          <button 
            onClick={onAddClick}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl glass-card hover:bg-slate-800/60 text-slate-200 font-medium text-xs border border-slate-700/50 transition-all duration-200 active:scale-95"
          >
            <Plus className="w-4 h-4 text-indigo-400" />
            <span>Add Funds</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// Smooth Count Up animation component for Financial Values
function CountUpValue({ value, formatFn }) {
  const [displayVal, setDisplayVal] = useState(0);

  useEffect(() => {
    let start = 0;
    const duration = 1200; // ms
    const stepTime = 16;
    const steps = duration / stepTime;
    const increment = (value - start) / steps;
    
    const timer = setInterval(() => {
      start += increment;
      if (start >= value) {
        setDisplayVal(value);
        clearInterval(timer);
      } else {
        setDisplayVal(start);
      }
    }, stepTime);

    return () => clearInterval(timer);
  }, [value]);

  return <span>{formatFn(displayVal)}</span>;
}

// ==========================================
// 5. METRICS GRID & OVERVIEW
// ==========================================

function MetricGrid({ metrics, formatCurr }) {
  const cards = [
    { title: 'Monthly Income', val: metrics.monthlyIncome, change: '+8.2%', positive: true, icon: ArrowDownLeft, color: 'emerald' },
    { title: 'Monthly Spending', val: metrics.monthlySpending, change: '-3.1%', positive: true, icon: ArrowUpRight, color: 'indigo' },
    { title: 'Investments', val: metrics.investments, change: '+14.6%', positive: true, icon: TrendingUp, color: 'cyan' },
    { title: 'Savings Portfolio', val: metrics.savings, change: '+4.0%', positive: true, icon: Wallet, color: 'violet' }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c, idx) => {
        const Icon = c.icon;
        return (
          <div 
            key={idx} 
            className="glass-card rounded-2xl p-5 border border-slate-800/60 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-950/20 group relative overflow-hidden"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">{c.title}</span>
              <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 text-indigo-400 group-hover:scale-110 transition-transform">
                <Icon className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-4">
              <h3 className="text-xl font-bold font-mono text-white tracking-tight">
                {formatCurr(c.val)}
              </h3>
              <div className="mt-2 flex items-center gap-1.5 text-xs">
                <span className={c.positive ? 'text-emerald-400' : 'text-rose-400'}>{c.change}</span>
                <span className="text-slate-500">vs last month</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ==========================================
// 6. INTERACTIVE MAIN FINANCIAL CHART (SVG)
// ==========================================

function FinancialChart({ period, setPeriod, formatCurr }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const data = CHART_DATA[period];

  const minVal = Math.min(...data.map(d => d.val)) * 0.95;
  const maxVal = Math.max(...data.map(d => d.val)) * 1.05;

  const width = 700;
  const height = 240;
  const padding = 40;

  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((d.val - minVal) / (maxVal - minVal)) * (height - padding * 2);
    return { x, y, val: d.val, label: d.label };
  });

  const pathD = points.reduce((acc, p, i) => {
    return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
  }, '');

  const areaD = `${pathD} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;

  return (
    <div className="glass-panel rounded-3xl p-6 border border-slate-800/80 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span>Portfolio Performance</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
          </h2>
          <p className="text-xs text-slate-400">Real-time valuation trajectories across selected timeframe</p>
        </div>

        {/* PERIOD SELECTOR */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900/80 border border-slate-800 self-start sm:self-auto">
          {['7D', '1M', '3M', '6M', '1Y'].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                period === p 
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* SVG CHART CONTAINER */}
      <div className="relative w-full overflow-hidden">
        <svg 
          viewBox={`0 0 ${width} ${height}`} 
          className="w-full h-auto overflow-visible"
        >
          <defs>
            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
            </linearGradient>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Horizontal Gridlines */}
          {[0, 0.33, 0.66, 1].map((ratio, idx) => {
            const y = padding + ratio * (height - padding * 2);
            return (
              <line 
                key={idx} 
                x1={padding} 
                y1={y} 
                x2={width - padding} 
                y2={y} 
                stroke="rgba(255,255,255,0.05)" 
                strokeDasharray="4 4" 
              />
            );
          })}

          {/* Area Fill */}
          <path d={areaD} fill="url(#chartGradient)" />

          {/* Glowing Line */}
          <path 
            d={pathD} 
            fill="none" 
            stroke="#6366f1" 
            strokeWidth="3" 
            filter="url(#glow)" 
          />

          {/* Data Points */}
          {points.map((p, i) => (
            <g key={i}>
              <circle 
                cx={p.x} 
                cy={p.y} 
                r={hoverIndex === i ? "6" : "4"} 
                fill="#050816" 
                stroke="#818cf8" 
                strokeWidth="2.5" 
                className="transition-all duration-200 cursor-pointer"
                onMouseEnter={() => setHoverIndex(i)}
                onMouseLeave={() => setHoverIndex(null)}
              />
            </g>
          ))}
        </svg>

        {/* INTERACTIVE TOOLTIP */}
        {hoverIndex !== null && (
          <div 
            className="absolute z-20 pointer-events-none glass-card p-3 rounded-xl border border-indigo-500/40 shadow-xl -translate-x-1/2 -translate-y-full transition-all duration-150"
            style={{ 
              left: `${(points[hoverIndex].x / width) * 100}%`, 
              top: `${(points[hoverIndex].y / height) * 100 - 10}%` 
            }}
          >
            <div className="text-[10px] text-slate-400 font-mono uppercase">{points[hoverIndex].label}</div>
            <div className="text-sm font-bold text-white font-mono">{formatCurr(points[hoverIndex].val)}</div>
          </div>
        )}
      </div>

      {/* AXIS LABELS */}
      <div className="flex justify-between px-6 text-xs text-slate-500 font-mono border-t border-slate-800/40 pt-4">
        {points.map((p, i) => (
          <span key={i}>{p.label}</span>
        ))}
      </div>
    </div>
  );
}

// ==========================================
// 7. 3D VIRTUAL DEBIT CARD (TILT & FLIP)
// ==========================================

function VirtualCard3D({ formatCurr }) {
  const [flipped, setFlipped] = useState(false);
  const [rotate, setRotate] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e) => {
    if (flipped) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    setRotate({ x: -y / 12, y: x / 12 });
  };

  const handleMouseLeave = () => {
    setRotate({ x: 0, y: 0 });
  };

  return (
    <div className="glass-panel rounded-3xl p-6 border border-slate-800/80 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">Aether Black Card</h3>
        <button 
          onClick={() => setFlipped(!flipped)}
          className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Flip Card</span>
        </button>
      </div>

      {/* 3D CARD WRAPPER */}
      <div 
        className="w-full h-52 perspective-1000 cursor-pointer"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={() => setFlipped(!flipped)}
      >
        <div 
          className={`relative w-full h-full rounded-2xl transition-transform duration-700 transform-style-3d shadow-2xl ${
            flipped ? 'rotate-y-180' : ''
          }`}
          style={{
            transform: flipped 
              ? 'rotateY(180deg)' 
              : `rotateX(${rotate.x}deg) rotateY(${rotate.y}deg)`
          }}
        >
          {/* FRONT FACE */}
          <div className="absolute inset-0 w-full h-full rounded-2xl p-6 backface-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 border border-slate-700/50 shadow-2xl flex flex-col justify-between overflow-hidden">
            {/* Ambient Dynamic Glow overlay */}
            <div className="absolute -top-12 -right-12 w-40 h-40 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none" />
            
            <div className="flex items-center justify-between z-10">
              <span className="font-bold text-sm tracking-widest text-white">AETHER</span>
              <span className="text-xs font-mono text-indigo-400">DEBIT / PLATINUM</span>
            </div>

            {/* CARD CHIP & CONTACTLESS */}
            <div className="flex items-center gap-4 z-10">
              <div className="w-11 h-8 rounded-md bg-gradient-to-r from-amber-200 to-amber-400 border border-amber-500/50 flex items-center justify-center shadow-inner">
                <div className="w-full h-[1px] bg-amber-600/60" />
              </div>
              <WifiIcon className="w-5 h-5 text-slate-400" />
            </div>

            {/* NUMBER & HOLDER */}
            <div className="z-10 space-y-2">
              <div className="font-mono text-lg tracking-[0.2em] text-white">
                •••• •••• •••• 9482
              </div>
              <div className="flex justify-between items-end text-[11px] font-mono text-slate-400">
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-slate-500">Cardholder</div>
                  <div className="text-slate-200 uppercase font-sans font-medium">Alex Mercer</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-slate-500">Expires</div>
                  <div className="text-slate-200 font-mono">08/29</div>
                </div>
              </div>
            </div>
          </div>

          {/* BACK FACE */}
          <div className="absolute inset-0 w-full h-full rounded-2xl backface-hidden rotate-y-180 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 border border-slate-700/50 p-6 flex flex-col justify-between shadow-2xl">
            <div className="w-full h-9 bg-slate-900 -mx-6 mt-2 border-y border-slate-800" />
            <div className="space-y-2">
              <div className="text-[10px] text-slate-400 font-mono text-right">AUTHORIZED SIGNATURE</div>
              <div className="w-full bg-slate-800 h-8 rounded flex items-center justify-end px-3">
                <span className="font-mono text-xs font-bold text-slate-900 bg-white px-2 py-0.5 rounded">942</span>
              </div>
            </div>
            <div className="text-[9px] text-slate-500 text-center">
              Issued by Aether Global Bank N.A. Member FDIC. 24/7 Concierge +1 (800) 555-0199
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WifiIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.12 14.71a6 6 0 017.76 0M4.93 11.52a10 10 0 0114.14 0M1.74 8.33a14 14 0 0120.52 0M12 18h.01" />
    </svg>
  );
}

function QuickTransferWidget() {
  return (
    <div className="glass-panel rounded-3xl p-6 border border-slate-800/80 space-y-4">
      <h3 className="text-xs font-bold text-white uppercase tracking-wider">Quick Transfer</h3>
      <div className="flex items-center gap-3 overflow-x-auto pb-2">
        {['Elena R.', 'Marcus K.', 'Sarah W.', 'David P.'].map((name, i) => (
          <button key={i} className="flex flex-col items-center space-y-2 group flex-shrink-0">
            <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700/60 flex items-center justify-center font-medium text-xs text-indigo-300 group-hover:border-indigo-500 transition-colors">
              {name.split(' ').map(n=>n[0]).join('')}
            </div>
            <span className="text-[11px] text-slate-400 group-hover:text-white transition-colors">{name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ==========================================
// 8. TRANSACTION SYSTEM COMPONENT
// ==========================================

function TransactionList({ transactions, formatCurr }) {
  const [filter, setFilter] = useState('all');

  const filtered = transactions.filter(t => {
    if (filter === 'income') return t.type === 'income';
    if (filter === 'expense') return t.type === 'expense';
    return true;
  });

  return (
    <div className="glass-panel rounded-3xl p-6 border border-slate-800/80 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white">Recent Ledger</h2>
          <p className="text-xs text-slate-400">Live transaction stream with real-time settlement tracking</p>
        </div>

        {/* FILTER TAB */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900/80 border border-slate-800">
          {['all', 'income', 'expense'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs font-medium rounded-lg capitalize transition-all ${
                filter === f 
                  ? 'bg-slate-800 text-white shadow-sm' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* TRANSACTIONS LIST */}
      <div className="space-y-2">
        {filtered.map((tx) => (
          <div 
            key={tx.id}
            className="flex items-center justify-between p-4 rounded-2xl glass-card transition-all duration-200 hover:scale-[1.01] group cursor-pointer"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-center text-indigo-400 group-hover:border-indigo-500/40 transition-colors">
                <TransactionIcon name={tx.icon} />
              </div>
              <div>
                <div className="text-sm font-semibold text-white group-hover:text-indigo-300 transition-colors">{tx.merchant}</div>
                <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                  <span>{tx.category}</span>
                  <span>•</span>
                  <span>{tx.date}</span>
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className={`text-sm font-mono font-bold ${
                tx.type === 'income' ? 'text-emerald-400' : 'text-slate-200'
              }`}>
                {tx.type === 'income' ? '+' : '-'}{formatCurr(tx.amount)}
              </div>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5 capitalize">
                {tx.status}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TransactionIcon({ name }) {
  switch(name) {
    case 'Laptop': return <Laptop className="w-4 h-4" />;
    case 'Wallet': return <Wallet className="w-4 h-4" />;
    case 'Globe': return <Globe className="w-4 h-4" />;
    case 'Activity': return <Activity className="w-4 h-4" />;
    case 'Shield': return <Shield className="w-4 h-4" />;
    case 'Cpu': return <Cpu className="w-4 h-4" />;
    case 'Send': return <Send className="w-4 h-4" />;
    case 'Plus': return <Plus className="w-4 h-4" />;
    default: return <DollarSign className="w-4 h-4" />;
  }
}

// ==========================================
// 9. SPENDING ANALYTICS & GOALS
// ==========================================

function SpendingAnalytics({ formatCurr }) {
  return (
    <div className="glass-panel rounded-3xl p-6 border border-slate-800/80 space-y-4">
      <h3 className="text-sm font-bold text-white uppercase tracking-wider">Spending Breakdown</h3>
      <div className="space-y-3">
        {SPENDING_CATEGORIES.map((cat, i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-slate-300 font-medium">{cat.name}</span>
              <span className="text-slate-400 font-mono">{formatCurr(cat.amount)} ({cat.pct}%)</span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden">
              <div 
                className="h-full rounded-full transition-all duration-1000"
                style={{ width: `${cat.pct}%`, backgroundColor: cat.color }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GoalsWidget({ formatCurr }) {
  return (
    <div className="glass-panel rounded-3xl p-6 border border-slate-800/80 space-y-4">
      <h3 className="text-sm font-bold text-white uppercase tracking-wider">Financial Goals</h3>
      <div className="space-y-3">
        {FINANCIAL_GOALS.map((goal) => {
          const pct = Math.round((goal.current / goal.target) * 100);
          return (
            <div key={goal.id} className="p-3.5 rounded-2xl glass-card space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-200">{goal.title}</span>
                <span className="text-indigo-400 font-mono font-bold">{pct}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-slate-900 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>{formatCurr(goal.current)}</span>
                <span>Target: {formatCurr(goal.target)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==========================================
// 10. INVESTMENT PORTFOLIO & SECURITY
// ==========================================

function InvestmentPortfolio({ formatCurr }) {
  return (
    <div className="glass-panel rounded-3xl p-6 border border-slate-800/80 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Investment Assets</h2>
          <p className="text-xs text-slate-400">Equities & Crypto positions with continuous pricing</p>
        </div>
        <button className="text-xs text-indigo-400 hover:text-indigo-300 font-medium">View All Markets →</button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800/60 text-[11px] text-slate-500 font-mono uppercase">
              <th className="pb-3 font-medium">Asset</th>
              <th className="pb-3 font-medium">Price</th>
              <th className="pb-3 font-medium">24h Change</th>
              <th className="pb-3 font-medium text-right">Holdings</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40 text-sm">
            {INVESTMENT_ASSETS.map((asset) => (
              <tr key={asset.symbol} className="hover:bg-slate-800/20 transition-colors">
                <td className="py-3.5 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center font-bold text-xs text-indigo-400 font-mono">
                    {asset.symbol[0]}
                  </div>
                  <div>
                    <div className="font-semibold text-white">{asset.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono">{asset.symbol}</div>
                  </div>
                </td>
                <td className="py-3.5 font-mono text-slate-200">{formatCurr(asset.price)}</td>
                <td className="py-3.5 font-mono">
                  <span className={`inline-flex items-center text-xs ${asset.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {asset.change >= 0 ? '+' : ''}{asset.change}%
                  </span>
                </td>
                <td className="py-3.5 font-mono text-right font-bold text-white">{formatCurr(asset.holdings)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SecurityOverview({ score }) {
  return (
    <div className="glass-panel rounded-3xl p-6 border border-slate-800/80 space-y-6">
      <h3 className="text-sm font-bold text-white uppercase tracking-wider">Vault Security</h3>

      {/* CIRCULAR PROGRESS */}
      <div className="flex flex-col items-center justify-center py-2">
        <div className="relative w-32 h-32 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
            <path
              className="text-slate-800"
              strokeWidth="3.5"
              stroke="currentColor"
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <path
              className="text-emerald-400"
              strokeDasharray={`${score}, 100`}
              strokeWidth="3.5"
              strokeLinecap="round"
              stroke="currentColor"
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
          </svg>
          <div className="absolute flex flex-col items-center">
            <span className="text-2xl font-bold font-mono text-white">{score}</span>
            <span className="text-[9px] text-slate-500 font-mono uppercase">SAFE SCORE</span>
          </div>
        </div>
      </div>

      <div className="space-y-2 text-xs">
        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-emerald-400" />
            <span className="text-slate-300">Biometrics MFA</span>
          </div>
          <span className="text-emerald-400 text-[10px] font-mono">ACTIVE</span>
        </div>
        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-indigo-400" />
            <span className="text-slate-300">Hardware Key</span>
          </div>
          <span className="text-emerald-400 text-[10px] font-mono">VERIFIED</span>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 11. MODALS & SLIDE-OUT PANELS
// ==========================================

function SendMoneyModal({ onClose, formatCurr, onSuccess }) {
  const [step, setStep] = useState(1);
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');

  const handleSend = () => {
    if (!amount || !recipient) return;
    setStep(3); // Loading step
    setTimeout(() => {
      setStep(4); // Success step
      onSuccess(parseFloat(amount));
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-md glass-panel rounded-3xl border border-slate-700/60 p-6 space-y-6 relative shadow-2xl">
        <button onClick={onClose} className="absolute top-5 right-5 text-slate-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>

        {step === 1 && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white">Send Capital</h3>
            <div className="space-y-3">
              <label className="text-xs text-slate-400">Recipient Identifier / Wallet Address</label>
              <input 
                type="text" 
                placeholder="e.g. alex@aether.io or 0x94F..." 
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <button 
              disabled={!recipient}
              onClick={() => setStep(2)}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-xs transition-all"
            >
              Continue to Amount
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white">Specify Amount</h3>
            <div className="space-y-3">
              <input 
                type="number" 
                placeholder="0.00" 
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-2xl font-mono text-white focus:outline-none focus:border-indigo-500 text-center"
              />
            </div>
            <button 
              disabled={!amount}
              onClick={handleSend}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-medium text-xs transition-all"
            >
              Authorize Transaction
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="py-12 flex flex-col items-center justify-center space-y-4">
            <RefreshCw className="w-10 h-10 text-indigo-400 animate-spin" />
            <p className="text-sm font-mono text-slate-300">Broadcasting transaction to consensus network...</p>
          </div>
        )}

        {step === 4 && (
          <div className="py-8 flex flex-col items-center justify-center space-y-4 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Check className="w-8 h-8" />
            </div>
            <h4 className="text-xl font-bold text-white">Transfer Settled</h4>
            <p className="text-xs text-slate-400">Successfully sent {formatCurr(parseFloat(amount))} to {recipient}</p>
            <button 
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs mt-4"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function AddMoneyModal({ onClose, formatCurr, onSuccess }) {
  const [amount, setAmount] = useState('');

  const handleAdd = () => {
    if (!amount) return;
    onSuccess(parseFloat(amount));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-md glass-panel rounded-3xl border border-slate-700/60 p-6 space-y-6 relative shadow-2xl">
        <button onClick={onClose} className="absolute top-5 right-5 text-slate-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-lg font-bold text-white">Deposit Liquid Funds</h3>
        <div className="space-y-3">
          <label className="text-xs text-slate-400">Amount to Deposit</label>
          <input 
            type="number" 
            placeholder="0.00" 
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-2xl font-mono text-white focus:outline-none focus:border-indigo-500 text-center"
          />
        </div>
        <button 
          onClick={handleAdd}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium text-xs transition-all"
        >
          Confirm Deposit
        </button>
      </div>
    </div>
  );
}

function NotificationPanel({ notifications, setNotifications, onClose }) {
  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm glass-panel border-l border-slate-800/80 p-6 shadow-2xl space-y-6 animate-slideLeft">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">Activity Center</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-3">
        {notifications.map((n) => (
          <div key={n.id} className="p-3.5 rounded-2xl glass-card space-y-1">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-white">{n.title}</span>
              <span className="text-[10px] text-slate-500 font-mono">{n.time}</span>
            </div>
            <p className="text-xs text-slate-400">{n.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}