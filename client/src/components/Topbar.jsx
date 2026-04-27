import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiEdit,
  FiLogOut,
  FiUser,
  FiPlus,
  FiChevronDown,
} from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';

const Topbar = () => {
  const { userName, logout } = useAuth();
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  return (
    <div className="relative z-40 mb-8 rounded-[28px] border border-white/10 bg-white/[0.05] px-5 py-5 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:px-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-cyan-300/75">
            Overview
          </p>
          <h1 className="mt-2 truncate text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Welcome back, {userName || 'User'}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Monitor balances, review recent activity, and manage your account from one place.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => navigate('/add-money')}
            className="inline-flex items-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#67e8f9_0%,#38bdf8_45%,#3b82f6_100%)] px-4 py-3 text-sm font-semibold text-slate-950 shadow-[0_12px_30px_rgba(59,130,246,0.30)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(59,130,246,0.38)]"
          >
            <FiPlus size={16} />
            Add money
          </button>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((prev) => !prev)}
              className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-left transition-all duration-200 hover:bg-white/[0.07]"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.06] text-slate-200">
                <FiUser size={18} />
              </div>

              <div className="hidden sm:block">
                <p className="text-sm font-medium text-white">{userName || 'User'}</p>
                <p className="text-xs text-slate-500">Account menu</p>
              </div>

              <FiChevronDown
                className={`text-slate-400 transition-transform duration-200 ${
                  menuOpen ? 'rotate-180' : ''
                }`}
                size={16}
              />
            </button>

            <div
              className={`absolute right-0 top-[calc(100%+12px)] w-64 origin-top-right rounded-2xl border border-white/10 bg-[#0d1726]/95 p-2 shadow-[0_24px_70px_rgba(0,0,0,0.45)] backdrop-blur-2xl transition-all duration-200 ${
                menuOpen
                  ? 'visible translate-y-0 opacity-100'
                  : 'invisible -translate-y-2 opacity-0'
              }`}
            >
              <div className="mb-2 rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3">
                <p className="text-sm font-medium text-white">{userName || 'User'}</p>
                <p className="mt-1 text-xs text-slate-500">Manage your profile and session</p>
              </div>

              <button
                onClick={() => {
                  setMenuOpen(false);
                  navigate('/update-profile');
                }}
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium text-slate-200 transition hover:bg-white/[0.06] hover:text-white"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">
                  <FiEdit size={17} />
                </div>
                <div>
                  <p className="text-sm font-medium">Update profile</p>
                  <p className="text-xs text-slate-500">Edit your account details</p>
                </div>
              </button>

              <button
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                }}
                className="mt-1 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium text-slate-200 transition hover:bg-red-400/10 hover:text-white"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-400/10 text-red-300">
                  <FiLogOut size={17} />
                </div>
                <div>
                  <p className="text-sm font-medium">Logout</p>
                  <p className="text-xs text-slate-500">End your current session</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Topbar;