import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LuLayoutDashboard, 
  LuArrowLeftRight,  
  LuHistory, 
  LuWallet,
  LuSparkles,
  LuSettings,
  LuCirclePlus,
  LuCreditCard
} from 'react-icons/lu';
import AIAssistantPanel from './AIAssistantPanel';

const Sidebar = () => {
  const location = useLocation();
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(false);

  const primaryItems = [
    { label: 'Dashboard', route: '/dashboard', icon: <LuLayoutDashboard /> },
    { label: 'P2P Transfer', route: '/p2p-transfer', icon: <LuArrowLeftRight /> },
    { label: 'Add Money', route: '/add-money', icon: <LuWallet /> },
  ];

  const secondaryItems = [
    { label: 'Transactions', route: '/transactions', icon: <LuHistory /> },
    { label: 'Wallet History', route: '/payment-history', icon: <LuCreditCard /> },
    { label: 'Quick Add', route: '/add-transaction', icon: <LuCirclePlus /> },
  ];

  return (
    <>
      <aside className="fixed left-0 top-0 h-screen w-64 border-r border-white/10 bg-[#07111f] p-6 flex flex-col justify-between text-slate-300">
        
        {/* Top Section */}
        <div>
          {/* Logo */}
          <div className="flex items-center gap-3 mb-10 px-2">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
              <LuSparkles className="text-white text-lg" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white">PayPro AI</h2>
          </div>

          {/* Navigation */}
          <nav className="space-y-6">
            <div>
              <p className="px-4 text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                Core
              </p>
              <ul className="space-y-1">
                {primaryItems.map((item) => (
                  <NavItem 
                    key={item.route} 
                    item={item} 
                    active={location.pathname === item.route} 
                  />
                ))}
              </ul>
            </div>

            <div>
              <p className="px-4 text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                Activity
              </p>
              <ul className="space-y-1">
                {secondaryItems.map((item) => (
                  <NavItem 
                    key={item.route} 
                    item={item} 
                    active={location.pathname === item.route} 
                  />
                ))}
              </ul>
            </div>
          </nav>
        </div>

        {/* Bottom Section */}
        <div className="border-t border-white/10 pt-6">
          
          {/* Settings Link */}
          <Link 
            to="/settings" 
            className="flex items-center gap-3 px-4 py-3 text-sm hover:text-white transition-colors"
          >
            <LuSettings /> Settings
          </Link>

          {/* AI Assistant Button */}
          <button 
            onClick={() => setIsAIPanelOpen(true)}
            className="mt-4 w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[linear-gradient(135deg,#06b6d4_0%,#3b82f6_100%)] bg-opacity-10 hover:shadow-[0_0_20px_rgba(6,182,212,0.3)] border border-cyan-500/30 transition-all duration-300 group"
          >
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] animate-pulse" />
              <span className="text-sm font-semibold text-white">
                Ask AI Assistant
              </span>
            </div>
            <LuSparkles className="text-white/70 group-hover:text-white transition-colors" />
          </button>
        </div>
      </aside>

      {/* AI Panel */}
      <AIAssistantPanel 
        isOpen={isAIPanelOpen} 
        onClose={() => setIsAIPanelOpen(false)} 
      />
    </>
  );
};

const NavItem = ({ item, active }) => (
  <li>
    <Link
      to={item.route}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
        active
          ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
          : 'hover:bg-white/[0.04] hover:text-white'
      }`}
    >
      <span className="text-lg">{item.icon}</span>
      <span className="text-[15px] font-medium">{item.label}</span>
    </Link>
  </li>
);

export default Sidebar;