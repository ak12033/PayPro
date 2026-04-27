import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const SplashScreen = () => {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [stage, setStage] = useState('booting');

  useEffect(() => {
    const savedToken = token || localStorage.getItem('token');

    const stageOne = setTimeout(() => {
      setStage(savedToken ? 'personalizing' : 'welcome');
    }, 700);

    const redirect = setTimeout(() => {
      if (savedToken) {
        navigate('/dashboard', { replace: true });
      } else {
        navigate('/login', { replace: true });
      }
    }, 1200);

    return () => {
      clearTimeout(stageOne);
      clearTimeout(redirect);
    };
  }, [token, navigate]);

  const content = {
    booting: {
      title: 'Launching experience',
      subtitle: 'Setting up a smooth and secure start.',
      status: 'Initializing',
    },
    personalizing: {
      title: 'Preparing your workspace',
      subtitle: 'Syncing your access and getting things ready.',
      status: 'Secure access found',
    },
    welcome: {
      title: 'Welcome',
      subtitle: 'Taking you to the right place to continue.',
      status: 'Ready to continue',
    },
  };

  const current = content[stage];

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#07111f] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.14),_transparent_30%),linear-gradient(135deg,#06101d_0%,#0b1728_45%,#091423_100%)]" />
      <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:72px_72px]" />
      <div className="absolute left-[-120px] top-20 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="absolute bottom-0 right-[-100px] h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-lg">
          <div className="rounded-[32px] border border-white/10 bg-white/[0.05] px-8 py-10 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-8">
                <div className="absolute inset-0 rounded-[28px] bg-cyan-400/20 blur-2xl" />
                <div className="relative flex h-20 w-20 items-center justify-center rounded-[24px] border border-cyan-300/20 bg-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                  <div className="absolute inset-0 rounded-[24px] border border-white/10" />
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-10 w-10 text-cyan-300"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.8}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 3l7 4v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V7l7-4z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9.5 12.5l1.7 1.7 3.8-4.2"
                    />
                  </svg>
                </div>

                <div className="absolute -inset-3 rounded-[32px] border border-cyan-300/10 animate-pulse" />
              </div>

              <div className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-[0.28em] text-cyan-300/75">
                  Secure platform
                </p>
                <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  {current.title}
                </h1>
                <p className="mx-auto max-w-md text-sm leading-7 text-slate-400 sm:text-base">
                  {current.subtitle}
                </p>
              </div>

              <div className="mt-8 w-full max-w-sm">
                <div className="relative h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-500 animate-[loading_1.4s_ease-in-out_infinite]" />
                </div>
              </div>

              <div className="mt-6 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-300">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
                </span>
                {current.status}
              </div>

              <div className="mt-10 grid w-full grid-cols-3 gap-3 text-left">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Access
                  </p>
                  <p className="mt-2 text-sm font-medium text-white">
                    Verified
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Session
                  </p>
                  <p className="mt-2 text-sm font-medium text-white">
                    Protected
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Launch
                  </p>
                  <p className="mt-2 text-sm font-medium text-white">
                    Smooth
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes loading {
          0% {
            transform: translateX(-120%);
            width: 30%;
          }
          50% {
            transform: translateX(110%);
            width: 40%;
          }
          100% {
            transform: translateX(320%);
            width: 30%;
          }
        }
      `}</style>
    </div>
  );
};

export default SplashScreen;