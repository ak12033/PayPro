import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LuLayoutDashboard, 
  LuArrowLeftRight,  
  LuHistory, 
  LuWallet,
  LuSparkles,
  LuSettings,
  LuCirclePlus
} from 'react-icons/lu';

const Sidebar = () => {
  const location = useLocation();

  const primaryItems = [
    { label: 'Dashboard', route: '/dashboard', icon: <LuLayoutDashboard /> },
    { label: 'P2P Transfer', route: '/p2p-transfer', icon: <LuArrowLeftRight /> },
    { label: 'Add Money', route: '/add-money', icon: <LuWallet /> },
  ];

  const secondaryItems = [
    { label: 'Transactions', route: '/transactions', icon: <LuHistory /> },
    { label: 'Quick Add', route: '/add-transaction', icon: <LuCirclePlus /> },
  ];

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 border-r border-white/10 bg-[#07111f] p-6 flex flex-col justify-between text-slate-300">
      <div>
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
            <LuSparkles className="text-white text-lg" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-white">PayPro AI</h2>
        </div>

        <nav className="space-y-6">
          <div>
            <p className="px-4 text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-3">Core</p>
            <ul className="space-y-1">
              {primaryItems.map((item) => (
                <NavItem key={item.route} item={item} active={location.pathname === item.route} />
              ))}
            </ul>
          </div>

          <div>
            <p className="px-4 text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-3">Activity</p>
            <ul className="space-y-1">
              {secondaryItems.map((item) => (
                <NavItem key={item.route} item={item} active={location.pathname === item.route} />
              ))}
            </ul>
          </div>
        </nav>
      </div>

      <div className="border-t border-white/10 pt-6">
        <Link to="/settings" className="flex items-center gap-3 px-4 py-3 text-sm hover:text-white transition-colors">
          <LuSettings /> Settings
        </Link>
        <div className="mt-4 flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/5">
           <div className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
           <span className="text-xs text-slate-400">AI Assistant Ready</span>
        </div>
      </div>
    </aside>
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