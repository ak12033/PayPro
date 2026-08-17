import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  ArrowUpRight, ArrowDownRight, Activity, ShieldCheck, Zap, Globe, 
  Search, Bell, Sun, Moon, ChevronDown, Layers, CreditCard, 
  TrendingUp, RefreshCw, Filter, ArrowRight, Lock, CheckCircle2, 
  ExternalLink, BarChart3, Clock, DollarSign, PieChart, Sliders, 
  Sparkles, X, Menu, Server, Cpu, Database, Command, HelpCircle,
  Copy, Check, ArrowUp, ArrowDown, Repeat, ShieldAlert, Radio
} from 'lucide-react';

// ==========================================
// MOCK DATA & FINANCIAL MODELS
// ==========================================

const TIMEFRAME_DATA = {
  '1D': {
    change: '+1.42%',
    changeVal: '+$2,084,120.40',
    isPositive: true,
    points: [146800000, 147100000, 146950000, 147600000, 147400000, 148100000, 148500000, 148920410]
  },
  '1W': {
    change: '+3.85%',
    changeVal: '+$5,520,100.00',
    isPositive: true,
    points: [143400000, 144200000, 145100000, 144800000, 146200000, 147800000, 148920410]
  },
  '1M': {
    change: '+8.12%',
    changeVal: '+$11,180,450.20',
    isPositive: true,
    points: [137700000, 139100000, 138500000, 142000000, 144500000, 146100000, 148920410]
  },
  '3M': {
    change: '+18.45%',
    changeVal: '+$23,190,000.00',
    isPositive: true,
    points: [125700000, 128400000, 132100000, 13100000, 138900000, 143200000, 148920410]
  },
  '1Y': {
    change: '+42.10%',
    changeVal: '+$44,110,200.00',
    isPositive: true,
    points: [104800000, 112000000, 119500000, 124800000, 133100000, 141200000, 148920410]
  }
};

const VAULT_ASSETS = [
  { id: 'v1', name: 'USDC Sovereign Liquidity', symbol: 'USDC', balance: '$62,450,120.00', allocation: 41.9, yield: '5.12% APY', health: 'Optimal', change: '+0.02%' },
  { id: 'v2', name: 'EUR Stable Settlement', symbol: 'EURS', balance: '$34,180,900.50', allocation: 22.9, yield: '3.84% APY', health: 'Optimal', change: '+0.01%' },
  { id: 'v3', name: 'Treasury Yield Note (90D)', symbol: 'US-T90', balance: '$28,900,000.00', allocation: 19.4, yield: '5.45% APY', health: 'Locked', change: '0.00%' },
  { id: 'v4', name: 'GBP Instant Rail Pool', symbol: 'GBPT', balance: '$14,210,000.00', allocation: 9.5, yield: '4.21% APY', health: 'Optimal', change: '-0.04%' },
  { id: 'v5', name: 'Tokyo Liquidity Node', symbol: 'JPYT', balance: '$9,179,390.02', allocation: 6.3, yield: '1.15% APY', health: 'Rebalancing', change: '+0.15%' }
];

const TRANSACTIONS = [
  { id: 'tx-9081', counterparty: 'JPMorgan Chase NY', type: 'Cross-Border Clear', amount: '$4,250,000.00', currency: 'USD', status: 'Settled', latency: '3.2ms', time: '12 seconds ago', category: 'Institutional' },
  { id: 'tx-9080', counterparty: 'Standard Chartered SG', type: 'FX Liquidity Sweep', amount: '$1,820,400.00', currency: 'EUR', status: 'Settled', latency: '4.1ms', time: '1 minute ago', category: 'FX Sweep' },
  { id: 'tx-9079', counterparty: 'Barclays London Hub', type: 'Automated Yield Route', amount: '$950,000.00', currency: 'GBP', status: 'Processing', latency: '--', time: '3 minutes ago', category: 'Treasury' },
  { id: 'tx-9078', counterparty: 'DBS Bank Singapore', type: 'Instant Settlement', amount: '$12,400,000.00', currency: 'USD', status: 'Settled', latency: '2.8ms', time: '8 minutes ago', category: 'Institutional' },
  { id: 'tx-9077', counterparty: 'BNP Paribas Paris', type: 'Rebalance Sweep', amount: '$3,110,000.00', currency: 'EUR', status: 'Settled', latency: '5.0ms', time: '14 minutes ago', category: 'Treasury' }
];

const LIVE_NODES = [
  { city: 'New York', code: 'US-EST', latency: '1.2ms', status: 'Active', load: '34%' },
  { city: 'London', code: 'UK-LDN', latency: '3.8ms', status: 'Active', load: '58%' },
  { city: 'Frankfurt', code: 'EU-FRA', latency: '4.1ms', status: 'Active', load: '42%' },
  { city: 'Tokyo', code: 'JP-TYO', latency: '11.4ms', status: 'Active', load: '21%' },
  { city: 'Singapore', code: 'SG-SIN', latency: '9.2ms', status: 'Active', load: '49%' }
];

// ==========================================
// 3D CANVAS COMPONENT (WebGL Interactive Sphere Grid)
// ==========================================

const ThreeCanvas = ({ theme }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;
    let width = (canvas.width = canvas.offsetWidth * window.devicePixelRatio);
    let height = (canvas.height = canvas.offsetHeight * window.devicePixelRatio);

    const particles = [];
    const particleCount = 65;
    const isDark = theme === 'dark';

    // Generate financial node mesh
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: (Math.random() - 0.5) * width * 0.8,
        y: (Math.random() - 0.5) * height * 0.8,
        z: Math.random() * width * 0.5,
        radius: Math.random() * 2 + 1,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        vz: (Math.random() - 0.5) * 0.4,
        pulse: Math.random() * Math.PI * 2
      });
    }

    let mouseX = 0;
    let mouseY = 0;

    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = (e.clientX - rect.left - rect.width / 2) * 0.5;
      mouseY = (e.clientY - rect.top - rect.height / 2) * 0.5;
    };

    window.addEventListener('mousemove', handleMouseMove);

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2 + mouseX * 0.2;
      const cy = height / 2 + mouseY * 0.2;

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        const p1 = particles[i];
        
        p1.x += p1.vx;
        p1.y += p1.vy;
        p1.z += p1.vz;
        p1.pulse += 0.02;

        if (Math.abs(p1.x) > width * 0.45) p1.vx *= -1;
        if (Math.abs(p1.y) > height * 0.45) p1.vy *= -1;
        if (p1.z < 0 || p1.z > width * 0.5) p1.vz *= -1;

        const scale1 = 300 / (300 + p1.z);
        const px1 = cx + p1.x * scale1;
        const py1 = cy + p1.y * scale1;

        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const scale2 = 300 / (300 + p2.z);
          const px2 = cx + p2.x * scale2;
          const py2 = cy + p2.y * scale2;

          const dx = px1 - px2;
          const dy = py1 - py2;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 130) {
            const alpha = (1 - dist / 130) * 0.25;
            ctx.beginPath();
            ctx.moveTo(px1, py1);
            ctx.lineTo(px2, py2);
            ctx.strokeStyle = isDark 
              ? `rgba(6, 182, 212, ${alpha})` 
              : `rgba(14, 165, 233, ${alpha * 0.8})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }

        // Draw particle node
        const nodeAlpha = 0.4 + Math.sin(p1.pulse) * 0.3;
        ctx.beginPath();
        ctx.arc(px1, py1, p1.radius * scale1 * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = isDark 
          ? `rgba(52, 211, 153, ${nodeAlpha})` 
          : `rgba(16, 185, 129, ${nodeAlpha})`;
        ctx.fill();

        // Node halo
        if (i % 7 === 0) {
          ctx.beginPath();
          ctx.arc(px1, py1, (p1.radius * scale1 * 4) + Math.sin(p1.pulse) * 3, 0, Math.PI * 2);
          ctx.fillStyle = isDark ? 'rgba(6, 182, 212, 0.08)' : 'rgba(14, 165, 233, 0.06)';
          ctx.fill();
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    const handleResize = () => {
      width = canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      height = canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
    };
  }, [theme]);

  return (
    <canvas 
      ref={canvasRef} 
      className="absolute inset-0 w-full h-full pointer-events-none opacity-80 z-0"
    />
  );
};

// ==========================================
// MAIN APP COMPONENT
// ==========================================

export default function AetherFintechApp() {
  const [theme, setTheme] = useState('dark');
  const [timeframe, setTimeframe] = useState('1D');
  const [activeTab, setActiveTab] = useState('overview');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isScrolled, setIsScrolled] = useState(false);
  const [selectedTx, setSelectedTx] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [yieldRate, setYieldRate] = useState(5.2);
  const [capitalInput, setCapitalInput] = useState(10000000);
  const [copiedKey, setCopiedKey] = useState(false);
  const [rebalancing, setRebalancing] = useState(false);
  const [rebalanceComplete, setRebalanceComplete] = useState(false);

  // Toggle Dark/Light Mode
  useEffect(() => {
    const savedTheme = localStorage.getItem('aether_theme') || 'dark';
    setTheme(savedTheme);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('aether_theme', nextTheme);
  };

  // Scroll listener for glass navbar
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 20) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Keyboard shortcut Cmd+K / Ctrl+K for search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setSelectedTx(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Calculate annual return for simulator
  const projectedReturn = useMemo(() => {
    return (capitalInput * (yieldRate / 100)).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    });
  }, [capitalInput, yieldRate]);

  // Handle mock instant rebalance action
  const handleTriggerRebalance = () => {
    setRebalancing(true);
    setTimeout(() => {
      setRebalancing(false);
      setRebalanceComplete(true);
      setTimeout(() => setRebalanceComplete(false), 4000);
    }, 1800);
  };

  // SVG Chart Generator based on active timeframe data
  const chartPoints = TIMEFRAME_DATA[timeframe].points;
  const minVal = Math.min(...chartPoints) * 0.995;
  const maxVal = Math.max(...chartPoints) * 1.005;
  
  const svgPath = useMemo(() => {
    const width = 800;
    const height = 220;
    const len = chartPoints.length;
    
    return chartPoints.map((val, idx) => {
      const x = (idx / (len - 1)) * width;
      const y = height - ((val - minVal) / (maxVal - minVal)) * height;
      return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
  }, [chartPoints, minVal, maxVal]);

  const svgArea = useMemo(() => {
    return `${svgPath} L 800 220 L 0 220 Z`;
  }, [svgPath]);

  // Theme styling helpers
  const isDark = theme === 'dark';

  return (
    <div className={`min-h-screen font-sans transition-colors duration-300 ${
      isDark ? 'bg-[#07090E] text-slate-100 selection:bg-cyan-500/30' : 'bg-[#F8FAFC] text-slate-900 selection:bg-sky-200'
    }`}>
      
      {/* GLOBAL BACKGROUND NOISE & MESH GLOWS */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className={`absolute -top-40 -left-40 w-96 h-96 rounded-full blur-[128px] opacity-20 ${
          isDark ? 'bg-cyan-500' : 'bg-sky-400'
        }`} />
        <div className={`absolute top-1/3 -right-40 w-[30rem] h-[30rem] rounded-full blur-[160px] opacity-15 ${
          isDark ? 'bg-emerald-500' : 'bg-teal-300'
        }`} />
        <div className={`absolute -bottom-40 left-1/3 w-[35rem] h-[35rem] rounded-full blur-[180px] opacity-10 ${
          isDark ? 'bg-indigo-600' : 'bg-blue-300'
        }`} />
      </div>

      {/* ==========================================
          NAVIGATION BAR
      ========================================== */}
      <header className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 border-b ${
        isScrolled 
          ? isDark 
            ? 'bg-[#07090E]/80 backdrop-blur-xl border-slate-800/80 shadow-2xl shadow-black/40' 
            : 'bg-white/85 backdrop-blur-xl border-slate-200 shadow-sm' 
          : 'bg-transparent border-transparent'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          
          {/* Brand Logo */}
          <div className="flex items-center gap-8">
            <a href="#overview" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 via-teal-400 to-emerald-400 p-[1px] shadow-lg shadow-cyan-500/20 group-hover:scale-105 transition-transform duration-200">
                <div className={`w-full h-full rounded-[7px] flex items-center justify-center font-bold text-xs tracking-tighter ${
                  isDark ? 'bg-[#07090E] text-white' : 'bg-white text-slate-900'
                }`}>
                  Æ
                </div>
              </div>
              <div className="flex flex-col">
                <span className="font-semibold tracking-wider text-base uppercase font-mono text-cyan-400 flex items-center gap-1.5">
                  AETHER
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                </span>
                <span className="text-[10px] tracking-tight font-mono -mt-1 opacity-60">SOVEREIGN RAIL v4.2</span>
              </div>
            </a>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {['overview', 'liquidity', 'yield-engine', 'settlements', 'node-network'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-all duration-150 ${
                    activeTab === tab
                      ? isDark
                        ? 'bg-slate-800/90 text-cyan-400 shadow-inner border border-slate-700/50'
                        : 'bg-slate-200/80 text-slate-900 border border-slate-300/50'
                      : isDark
                        ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {tab.replace('-', ' ')}
                </button>
              ))}
            </nav>
          </div>

          {/* Right Action Tools */}
          <div className="flex items-center gap-3">
            {/* Quick Search Button Trigger */}
            <button
              onClick={() => setSearchOpen(true)}
              className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono transition-all ${
                isDark 
                  ? 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200' 
                  : 'bg-slate-100 border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-800'
              }`}
            >
              <Search size={14} className="text-slate-400" />
              <span>Search rail / hash</span>
              <kbd className="px-1.5 py-0.5 text-[10px] bg-slate-800 text-slate-300 rounded border border-slate-700 font-sans">
                ⌘K
              </kbd>
            </button>

            {/* Network Status Badge */}
            <div className={`hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-full border text-[11px] font-mono ${
              isDark 
                ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-400' 
                : 'bg-emerald-50 border-emerald-200 text-emerald-700'
            }`}>
              <Radio size={12} className="animate-pulse text-emerald-400" />
              <span>4.82ms Latency</span>
            </div>

            {/* Dark / Light Theme Toggle */}
            <button
              onClick={toggleTheme}
              aria-label="Toggle visual theme"
              className={`p-2 rounded-lg border transition-all ${
                isDark 
                  ? 'bg-slate-900 border-slate-800 text-amber-400 hover:bg-slate-800' 
                  : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            {/* Institutional Portal Launch Button */}
            <button className="hidden sm:inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-500 text-slate-950 hover:brightness-110 transition-all shadow-md shadow-cyan-500/20 active:scale-95">
              <span>Institution Portal</span>
              <ArrowUpRight size={14} />
            </button>

            {/* Mobile Menu Toggle Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg border border-slate-800 text-slate-400 hover:text-white"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className={`md:hidden border-b px-4 py-4 space-y-2 ${
            isDark ? 'bg-[#07090E] border-slate-800' : 'bg-white border-slate-200'
          }`}>
            {['overview', 'liquidity', 'yield-engine', 'settlements', 'node-network'].map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  setMobileMenuOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium capitalize ${
                  activeTab === tab
                    ? 'bg-cyan-500/10 text-cyan-400 font-semibold'
                    : isDark ? 'text-slate-400' : 'text-slate-600'
                }`}
              >
                {tab.replace('-', ' ')}
              </button>
            ))}
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
              <span className="text-xs font-mono text-slate-400">STATUS: ALL NODES ONLINE</span>
              <button className="px-3 py-1.5 text-xs bg-cyan-500 text-slate-950 font-bold rounded-md">
                Launch App
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ==========================================
          HERO SECTION + 3D NETWORK BACKDROP
      ========================================== */}
      <section className="relative pt-28 pb-12 md:pt-36 md:pb-20 overflow-hidden">
        {/* Interactive 3D WebGL / Canvas Mesh Background */}
        <ThreeCanvas theme={theme} />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          {/* Top Pill Status Badge */}
          <div className="flex justify-start">
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-mono mb-6 backdrop-blur-md shadow-lg ${
              isDark 
                ? 'bg-slate-900/80 border-slate-700/80 text-cyan-300 shadow-cyan-950/30' 
                : 'bg-white/90 border-slate-300 text-slate-800 shadow-slate-200'
            }`}>
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              <span className="font-semibold text-[11px] uppercase tracking-wider">Aether Core v4.2 Live</span>
              <span className="text-slate-500">|</span>
              <span className="text-slate-400">$148.9M Instant Clearing Capacity</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            
            {/* Left Headline Column */}
            <div className="lg:col-span-7 space-y-6">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1]">
                Autonomous Liquidity &{' '}
                <span className="bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400 bg-clip-text text-transparent">
                  Sub-Millisecond Settlement
                </span>
              </h1>

              <p className={`text-base sm:text-lg max-w-2xl leading-relaxed ${
                isDark ? 'text-slate-300' : 'text-slate-600'
              }`}>
                Re-architecting institutional cash management. Automatically route treasury reserves, optimize yield across global sovereign liquidity pools, and clear multi-currency transfers without counterparty delay.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <button className="px-6 py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-500 text-slate-950 hover:shadow-lg hover:shadow-cyan-500/25 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2">
                  <span>Connect Treasury Vault</span>
                  <ArrowRight size={16} />
                </button>

                <button 
                  onClick={() => setActiveTab('yield-engine')}
                  className={`px-6 py-3 rounded-xl font-semibold text-sm border backdrop-blur-md transition-all flex items-center gap-2 ${
                    isDark 
                      ? 'bg-slate-900/60 border-slate-700 text-slate-200 hover:bg-slate-800/80 hover:border-slate-600' 
                      : 'bg-white/80 border-slate-300 text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <Sparkles size={16} className="text-cyan-400" />
                  <span>Explore Yield Engine</span>
                </button>
              </div>

              {/* Security Trust Badges */}
              <div className="pt-6 border-t border-slate-800/60 flex flex-wrap items-center gap-6 text-xs text-slate-400 font-mono">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={16} className="text-emerald-400" />
                  <span>SOC2 TYPE II CERTIFIED</span>
                </div>
                <div className="flex items-center gap-2">
                  <Lock size={16} className="text-cyan-400" />
                  <span>MPC ZERO-KNOWLEDGE VAULTS</span>
                </div>
                <div className="flex items-center gap-2">
                  <Activity size={16} className="text-teal-400" />
                  <span>99.999% RAIL UPTIME</span>
                </div>
              </div>
            </div>

            {/* Right Hero Glass Widget - Live Financial Metric Node */}
            <div className="lg:col-span-5">
              <div className={`p-6 rounded-2xl border backdrop-blur-xl relative shadow-2xl transition-all duration-300 ${
                isDark 
                  ? 'bg-slate-900/70 border-slate-800/80 shadow-cyan-950/20' 
                  : 'bg-white/80 border-slate-200/90 shadow-slate-200'
              }`}>
                {/* Decorative Glass Edge Highlight */}
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />

                <div className="flex items-center justify-between pb-4 border-b border-slate-800/40">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
                      LIVE SYSTEM TREASURY
                    </span>
                  </div>
                  <span className="text-xs font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                    REAL-TIME SYNC
                  </span>
                </div>

                <div className="mt-5 space-y-1">
                  <span className="text-xs font-mono text-slate-400">Total Liquidity Orchestrated</span>
                  <div className="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight text-slate-100 flex items-baseline gap-2">
                    <span>$148,920,410</span>
                    <span className="text-lg text-slate-400 font-normal">.52</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 pt-1">
                    <TrendingUp size={14} />
                    <span>+$2,084,120.40 (1.42%) today</span>
                  </div>
                </div>

                {/* Quick Stats Grid */}
                <div className="grid grid-cols-2 gap-3 mt-6 pt-5 border-t border-slate-800/40 font-mono text-xs">
                  <div className={`p-3 rounded-lg border ${
                    isDark ? 'bg-slate-950/50 border-slate-800/60' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="text-slate-400 text-[10px] uppercase">Active Vaults</div>
                    <div className="text-base font-bold text-slate-100 mt-0.5">5 Sovereign Pools</div>
                  </div>
                  <div className={`p-3 rounded-lg border ${
                    isDark ? 'bg-slate-950/50 border-slate-800/60' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="text-slate-400 text-[10px] uppercase">Blended Yield</div>
                    <div className="text-base font-bold text-emerald-400 mt-0.5">4.88% Net APY</div>
                  </div>
                </div>

                {/* Instant Rebalance Callout */}
                <div className="mt-4 pt-2">
                  <button
                    onClick={handleTriggerRebalance}
                    disabled={rebalancing}
                    className={`w-full py-2.5 px-4 rounded-lg font-mono text-xs font-semibold border transition-all flex items-center justify-center gap-2 ${
                      rebalanceComplete
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                        : isDark
                          ? 'bg-slate-800/80 border-slate-700 text-slate-200 hover:bg-slate-700/80'
                          : 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200'
                    }`}
                  >
                    <RefreshCw size={14} className={rebalancing ? 'animate-spin text-cyan-400' : ''} />
                    <span>
                      {rebalancing 
                        ? 'Optimizing Vault Routes...' 
                        : rebalanceComplete 
                          ? '✓ Vault Routing Optimized (+0.14% APY Yield)' 
                          : 'Trigger Autonomous Rebalance'}
                    </span>
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ==========================================
          INTERACTIVE CHART & TIMEFRAME ANALYTICS
      ========================================== */}
      <section className="py-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`p-6 sm:p-8 rounded-2xl border backdrop-blur-xl shadow-xl transition-all ${
          isDark 
            ? 'bg-slate-900/50 border-slate-800/80' 
            : 'bg-white border-slate-200 shadow-slate-100'
        }`}>
          
          {/* Header Controls */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 size={18} className="text-cyan-400" />
                <h2 className="text-lg font-bold tracking-tight">System Net Liquidity Performance</h2>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-1">
                Real-time aggregated vault balances across all connected banking rails
              </p>
            </div>

            {/* Timeframe Selector Pills */}
            <div className={`inline-flex p-1 rounded-xl border font-mono text-xs ${
              isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
            }`}>
              {Object.keys(TIMEFRAME_DATA).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                    timeframe === tf
                      ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                      : isDark
                        ? 'text-slate-400 hover:text-slate-200'
                        : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          {/* Metric Bar */}
          <div className="flex items-baseline gap-4 mb-6">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono">
              {TIMEFRAME_DATA[timeframe].changeVal}
            </span>
            <span className={`inline-flex items-center gap-1 font-mono text-sm font-bold px-2 py-0.5 rounded ${
              TIMEFRAME_DATA[timeframe].isPositive 
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}>
              <TrendingUp size={14} />
              {TIMEFRAME_DATA[timeframe].change}
            </span>
            <span className="text-xs text-slate-400 font-mono hidden sm:inline">
              vs previous period
            </span>
          </div>

          {/* SVG Vector Chart Box */}
          <div className="relative h-60 w-full overflow-hidden rounded-xl">
            <svg 
              className="w-full h-full overflow-visible" 
              viewBox="0 0 800 220" 
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="chartGradientDark" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="chartGradientLight" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0284c7" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#0284c7" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Area Gradient Fill */}
              <path
                d={svgArea}
                fill={isDark ? 'url(#chartGradientDark)' : 'url(#chartGradientLight)'}
              />

              {/* Dynamic Line Path */}
              <path
                d={svgPath}
                fill="none"
                stroke={isDark ? '#06b6d4' : '#0284c7'}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="transition-all duration-500 ease-out"
              />
            </svg>

            {/* Bottom Grid Axis Labels */}
            <div className="absolute bottom-0 inset-x-0 flex justify-between px-2 pt-2 text-[10px] font-mono text-slate-500 border-t border-slate-800/40">
              <span>PERIOD START</span>
              <span>MIDPOINT SYNC</span>
              <span>LIVE CURRENT</span>
            </div>
          </div>
        </div>
      </section>

      {/* ==========================================
          TREASURY VAULT ASSETS & YIELD ENGINE
      ========================================== */}
      <section className="py-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Table: Sovereign Vault Balances */}
          <div className="lg:col-span-8">
            <div className={`p-6 rounded-2xl border backdrop-blur-xl h-full flex flex-col justify-between ${
              isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200'
            }`}>
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-slate-800/60">
                  <div>
                    <h3 className="text-base font-bold tracking-tight">Active Treasury Vault Pools</h3>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">Multi-rail liquidity allocation</p>
                  </div>
                  <button className="text-xs font-mono text-cyan-400 hover:underline flex items-center gap-1">
                    <span>Manage Vaults</span>
                    <ArrowRight size={12} />
                  </button>
                </div>

                {/* Table Component */}
                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-left font-mono text-xs">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-800/40">
                        <th className="pb-3 font-semibold">ASSET / VAULT</th>
                        <th className="pb-3 font-semibold">BALANCE</th>
                        <th className="pb-3 font-semibold">ALLOCATION</th>
                        <th className="pb-3 font-semibold">EST. APY</th>
                        <th className="pb-3 font-semibold text-right">RAIL STATUS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/30">
                      {VAULT_ASSETS.map((asset) => (
                        <tr key={asset.id} className="hover:bg-slate-800/20 transition-colors">
                          <td className="py-3.5 font-bold text-slate-200 flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center font-bold text-[10px] text-cyan-400 border border-slate-700">
                              {asset.symbol}
                            </div>
                            <div>
                              <div>{asset.name}</div>
                              <div className="text-[10px] text-slate-500 font-normal">{asset.symbol} Pool</div>
                            </div>
                          </td>
                          <td className="py-3.5 text-slate-100 font-bold">{asset.balance}</td>
                          <td className="py-3.5">
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-cyan-400 rounded-full" 
                                  style={{ width: `${asset.allocation}%` }} 
                                />
                              </div>
                              <span className="text-[11px] text-slate-400">{asset.allocation}%</span>
                            </div>
                          </td>
                          <td className="py-3.5 text-emerald-400 font-bold">{asset.yield}</td>
                          <td className="py-3.5 text-right">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                              asset.health === 'Optimal'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : asset.health === 'Rebalancing'
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}>
                              {asset.health}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bottom Info Bar */}
              <div className="pt-4 mt-4 border-t border-slate-800/40 flex items-center justify-between text-xs font-mono text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Lock size={12} className="text-emerald-400" />
                  Auto-Hedging Active across 4 Foreign Exchange Rails
                </span>
                <span className="text-cyan-400">Instant Unwind Available</span>
              </div>
            </div>
          </div>

          {/* Right Column: Yield Projection Simulator */}
          <div className="lg:col-span-4">
            <div className={`p-6 rounded-2xl border backdrop-blur-xl h-full flex flex-col justify-between ${
              isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200'
            }`}>
              <div>
                <div className="flex items-center gap-2 pb-3 border-b border-slate-800/60">
                  <Sliders size={18} className="text-cyan-400" />
                  <h3 className="text-base font-bold tracking-tight">Yield Routing Simulator</h3>
                </div>

                <p className="text-xs text-slate-400 font-mono mt-3">
                  Calculate automated APY return on unallocated idle operating capital.
                </p>

                {/* Capital Input */}
                <div className="mt-5 space-y-4 font-mono text-xs">
                  <div>
                    <label className="text-slate-400 block mb-1.5">DEPLOYABLE CAPITAL (USD)</label>
                    <input
                      type="number"
                      value={capitalInput}
                      onChange={(e) => setCapitalInput(Number(e.target.value))}
                      className={`w-full px-3 py-2.5 rounded-lg border font-mono font-bold text-sm ${
                        isDark 
                          ? 'bg-slate-950 border-slate-800 text-slate-100 focus:border-cyan-500' 
                          : 'bg-slate-50 border-slate-300 text-slate-900'
                      } outline-none transition-all`}
                    />
                  </div>

                  {/* Yield Slider */}
                  <div>
                    <div className="flex justify-between text-slate-400 mb-1.5">
                      <span>TARGET APY RATE</span>
                      <span className="text-cyan-400 font-bold">{yieldRate}%</span>
                    </div>
                    <input
                      type="range"
                      min="1.0"
                      max="10.0"
                      step="0.1"
                      value={yieldRate}
                      onChange={(e) => setYieldRate(parseFloat(e.target.value))}
                      className="w-full accent-cyan-400 cursor-pointer"
                    />
                  </div>

                  {/* Computed Projection Output Box */}
                  <div className={`p-4 rounded-xl border mt-4 ${
                    isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="text-[10px] uppercase text-slate-400">ESTIMATED ANNUAL YIELD</div>
                    <div className="text-2xl font-extrabold text-emerald-400 mt-1 font-mono">
                      {projectedReturn}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      Computed via automated daily compounding across US Treasury and Sovereign Stable Notes.
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <button className="w-full mt-6 py-2.5 rounded-xl font-semibold text-xs bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-all flex items-center justify-center gap-2">
                <span>Deploy Smart Routing</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>

        </div>
      </section>

      {/* ==========================================
          LIVE TRANSACTION STREAM & MODAL
      ========================================== */}
      <section className="py-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`p-6 rounded-2xl border backdrop-blur-xl ${
          isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/60">
            <div>
              <div className="flex items-center gap-2">
                <Clock size={18} className="text-teal-400" />
                <h3 className="text-base font-bold tracking-tight">Real-Time Settlement Ledger</h3>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Sub-second cross-border clearing records
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                STREAMING LIVE
              </span>
            </div>
          </div>

          {/* Transactions List */}
          <div className="divide-y divide-slate-800/30 mt-2 font-mono text-xs">
            {TRANSACTIONS.map((tx) => (
              <div 
                key={tx.id}
                onClick={() => setSelectedTx(tx)}
                className="py-3.5 px-2 rounded-lg hover:bg-slate-800/30 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${
                    tx.status === 'Settled'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  }`}>
                    {tx.status === 'Settled' ? <CheckCircle2 size={16} /> : <RefreshCw size={14} className="animate-spin" />}
                  </div>
                  <div>
                    <div className="font-bold text-slate-200">{tx.counterparty}</div>
                    <div className="text-[10px] text-slate-500 flex items-center gap-2">
                      <span>{tx.type}</span>
                      <span>•</span>
                      <span>{tx.time}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-6">
                  <div className="text-left sm:text-right">
                    <div className="font-bold text-slate-100 text-sm">{tx.amount}</div>
                    <div className="text-[10px] text-slate-400">{tx.currency} RAIL</div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
                      {tx.latency}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* ==========================================
          GLOBAL NODE INFRASTRUCTURE MAP / METRICS
      ========================================== */}
      <section className="py-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`p-6 sm:p-8 rounded-2xl border backdrop-blur-xl ${
          isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="mb-6">
            <h3 className="text-base font-bold tracking-tight flex items-center gap-2">
              <Globe size={18} className="text-cyan-400" />
              <span>Sovereign Settlement Edge Nodes</span>
            </h3>
            <p className="text-xs text-slate-400 font-mono mt-1">
              Active liquidity gateways with local banking connection protocols
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 font-mono text-xs">
            {LIVE_NODES.map((node) => (
              <div 
                key={node.code}
                className={`p-4 rounded-xl border transition-all hover:border-cyan-500/50 ${
                  isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200">{node.city}</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">{node.code} NODE</div>
                
                <div className="mt-4 pt-3 border-t border-slate-800/40 flex justify-between text-[11px]">
                  <span className="text-slate-400">Latency:</span>
                  <span className="text-cyan-400 font-bold">{node.latency}</span>
                </div>
                <div className="mt-1 flex justify-between text-[11px]">
                  <span className="text-slate-400">Load:</span>
                  <span className="text-slate-300 font-bold">{node.load}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ==========================================
          TRANSACTION DETAIL DIALOG / MODAL
      ========================================== */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className={`w-full max-w-md p-6 rounded-2xl border shadow-2xl relative ${
            isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <button 
              onClick={() => setSelectedTx(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono mb-2">
              <CheckCircle2 size={16} />
              <span>SETTLEMENT VERIFIED ON RAIL</span>
            </div>

            <h3 className="text-xl font-bold font-mono">{selectedTx.amount}</h3>
            <p className="text-xs text-slate-400 font-mono mt-0.5">{selectedTx.counterparty}</p>

            <div className="mt-6 space-y-3 font-mono text-xs border-t border-b border-slate-800/60 py-4">
              <div className="flex justify-between">
                <span className="text-slate-400">TRANSACTION ID:</span>
                <span className="text-slate-200 font-bold">{selectedTx.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">CLEARING TYPE:</span>
                <span className="text-slate-200">{selectedTx.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">LATENCY ACHIEVED:</span>
                <span className="text-emerald-400 font-bold">{selectedTx.latency}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">TIMESTAMP:</span>
                <span className="text-slate-200">{selectedTx.time}</span>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button 
                onClick={() => setSelectedTx(null)}
                className="w-full py-2 rounded-xl bg-slate-800 text-slate-200 font-mono text-xs hover:bg-slate-700"
              >
                Close Audit View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          CMD+K SEARCH DIALOG MODAL
      ========================================== */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/70 backdrop-blur-sm">
          <div className={`w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className="p-4 border-b border-slate-800 flex items-center gap-3">
              <Search size={18} className="text-slate-400" />
              <input
                type="text"
                placeholder="Search transaction hash, node, or vault..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                className="w-full bg-transparent outline-none font-mono text-sm text-slate-100 placeholder-slate-500"
              />
              <button onClick={() => setSearchOpen(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="p-4 max-h-80 overflow-y-auto font-mono text-xs space-y-2">
              <div className="text-[10px] uppercase text-slate-500">QUICK SUGGESTIONS</div>
              <div 
                onClick={() => { setSearchOpen(false); setActiveTab('liquidity'); }}
                className="p-2.5 rounded-lg hover:bg-slate-800/60 cursor-pointer flex justify-between items-center"
              >
                <span className="text-slate-200">USDC Sovereign Liquidity Pool</span>
                <span className="text-cyan-400">$62.4M</span>
              </div>
              <div 
                onClick={() => { setSearchOpen(false); setActiveTab('node-network'); }}
                className="p-2.5 rounded-lg hover:bg-slate-800/60 cursor-pointer flex justify-between items-center"
              >
                <span className="text-slate-200">New York Edge Node (US-EST)</span>
                <span className="text-emerald-400">1.2ms</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          FOOTER
      ========================================== */}
      <footer className={`border-t py-12 mt-12 transition-colors ${
        isDark ? 'bg-[#05070B] border-slate-800/80 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-600'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-cyan-500 flex items-center justify-center font-bold text-slate-950 text-xs">
              Æ
            </div>
            <span className="font-mono font-bold text-slate-200 text-sm tracking-wider">AETHER PROTOCOL</span>
            <span className="text-xs text-slate-500">© 2026 Aether Financial Technologies Inc.</span>
          </div>

          <div className="flex items-center gap-6 font-mono text-xs">
            <a href="#privacy" className="hover:text-cyan-400 transition-colors">PRIVACY</a>
            <a href="#terms" className="hover:text-cyan-400 transition-colors">COMPLIANCE</a>
            <a href="#docs" className="hover:text-cyan-400 transition-colors">API DOCS</a>
            <a href="#status" className="hover:text-cyan-400 transition-colors flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              SYSTEM NORMAL
            </a>
          </div>
        </div>
      </footer>

    </div>
  );
}