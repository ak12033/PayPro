import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPublicIP } from '../utils/getPublicIP.js';
import api from '../api/api.js';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const navigate = useNavigate();
  const { setToken } = useAuth();

  const handleLogin = async () => {
    setLoading(true);
    setError('');

    try {
      const ip = await getPublicIP();
      const res = await api.post('/auth/login', { email, password, ip });

      localStorage.setItem('token', res.data.token);
      setToken(res.data.token);
      toast.success('Welcome back');
      navigate('/dashboard');
    } catch (err) {
      if (err.response?.status === 403) {
        toast('New login location detected. OTP sent!');
        navigate('/verify-login-otp', { state: { email } });
      } else {
        setError('Invalid email or password');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleLogin();
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#07111f] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.14),_transparent_30%),linear-gradient(135deg,#06101d_0%,#0b1728_45%,#091423_100%)]" />
      <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:72px_72px]" />
      <div className="absolute left-[-120px] top-20 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="absolute bottom-0 right-[-100px] h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid w-full max-w-6xl overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl lg:grid-cols-[1.05fr_0.95fr]">
          
          <div className="hidden lg:flex flex-col justify-between border-r border-white/10 bg-white/[0.03] p-10">
            <div>
              <div className="mb-10 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/80">
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.9)]" />
                Secure workspace access
              </div>

              <div className="max-w-md">
                <p className="mb-4 text-sm font-medium uppercase tracking-[0.22em] text-cyan-300/80">
                  Welcome back
                </p>
                <h1 className="text-4xl font-semibold leading-tight text-white">
                  Sign in to your control center.
                </h1>
                <p className="mt-5 text-base leading-7 text-slate-300">
                  Review activity, manage sessions, and access your dashboard with a secure, verified login flow.
                </p>
              </div>
            </div>

            <div className="mt-10 grid gap-4">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm text-slate-300">Threat monitoring</span>
                  <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-xs font-medium text-emerald-300">
                    Active
                  </span>
                </div>
                <div className="text-2xl font-semibold text-white">24/7 protection</div>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  New device and location checks trigger OTP verification automatically.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Sessions</p>
                  <p className="mt-3 text-xl font-semibold text-white">128</p>
                  <p className="mt-1 text-xs text-slate-400">This week</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Success</p>
                  <p className="mt-3 text-xl font-semibold text-white">99.98%</p>
                  <p className="mt-1 text-xs text-slate-400">Auth uptime</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Risk checks</p>
                  <p className="mt-3 text-xl font-semibold text-white">Real-time</p>
                  <p className="mt-1 text-xs text-slate-400">IP + OTP</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-5 sm:p-8 lg:p-10">
            <div className="w-full max-w-md">
              <div className="mb-8">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-7 w-7 text-cyan-300"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.8}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 15v2m-6 0h12a2 2 0 002-2v-5a2 2 0 00-2-2h-1V7a5 5 0 10-10 0v1H6a2 2 0 00-2 2v5a2 2 0 002 2z"
                    />
                  </svg>
                </div>

                <h2 className="text-3xl font-semibold tracking-tight text-white">
                  Login
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Use your email and password to continue securely.
                </p>
              </div>

              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-200">
                    Email address
                  </label>
                  <div className="group flex items-center rounded-xl border border-white/10 bg-white/[0.04] px-4 transition-all duration-200 focus-within:border-cyan-300/50 focus-within:bg-white/[0.06] focus-within:shadow-[0_0_0_4px_rgba(34,211,238,0.08)]">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="mr-3 h-5 w-5 text-slate-500 group-focus-within:text-cyan-300"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.8}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M16 12H8m8 0l-8 0m12-5H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"
                      />
                    </svg>
                    <input
                      className="w-full bg-transparent py-3.5 text-[15px] text-white placeholder:text-slate-500 focus:outline-none"
                      placeholder="you@example.com"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={handleKeyDown}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-slate-200">
                      Password
                    </label>
                    <button
                      type="button"
                      className="text-xs font-medium text-cyan-300 transition hover:text-cyan-200"
                    >
                      Forgot password?
                    </button>
                  </div>

                  <div className="group flex items-center rounded-xl border border-white/10 bg-white/[0.04] px-4 transition-all duration-200 focus-within:border-cyan-300/50 focus-within:bg-white/[0.06] focus-within:shadow-[0_0_0_4px_rgba(34,211,238,0.08)]">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="mr-3 h-5 w-5 text-slate-500 group-focus-within:text-cyan-300"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.8}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 11c1.657 0 3-1.343 3-3S13.657 5 12 5 9 6.343 9 8s1.343 3 3 3z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.4 15a2 2 0 01.6 1.414V18a1 1 0 01-1 1H5a1 1 0 01-1-1v-1.586A2 2 0 014.6 15l2.4-2.4A2 2 0 018.414 12h7.172a2 2 0 011.414.586L19.4 15z"
                      />
                    </svg>

                    <input
                      className="w-full bg-transparent py-3.5 text-[15px] text-white placeholder:text-slate-500 focus:outline-none"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={handleKeyDown}
                    />

                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="ml-3 text-sm font-medium text-slate-400 transition hover:text-white"
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="flex items-start gap-3 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="mt-0.5 h-5 w-5 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.8}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 9v4m0 4h.01M10.29 3.86l-7.5 13A1 1 0 003.66 18h16.68a1 1 0 00.87-1.14l-7.5-13a1 1 0 00-1.74 0z"
                      />
                    </svg>
                    <span>{error}</span>
                  </div>
                )}

                <button
                  onClick={handleLogin}
                  disabled={loading}
                  className="group relative inline-flex w-full items-center justify-center overflow-hidden rounded-xl bg-[linear-gradient(135deg,#67e8f9_0%,#38bdf8_45%,#3b82f6_100%)] px-4 py-3.5 text-sm font-semibold text-slate-950 shadow-[0_10px_30px_rgba(56,189,248,0.28)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(59,130,246,0.34)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="absolute inset-0 bg-white/0 transition group-hover:bg-white/10" />
                  <span className="relative">
                    {loading ? 'Logging in...' : 'Login to dashboard'}
                  </span>
                </button>

                <div className="flex items-center gap-3 pt-1 text-xs text-slate-400">
                  <div className="h-px flex-1 bg-white/10" />
                  Protected by device and location verification
                  <div className="h-px flex-1 bg-white/10" />
                </div>

                <p className="pt-2 text-center text-sm text-slate-400">
                  Don&apos;t have an account?{' '}
                  <span
                    onClick={() => navigate('/signup')}
                    className="cursor-pointer font-semibold text-cyan-300 transition hover:text-cyan-200"
                  >
                    Sign up
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;