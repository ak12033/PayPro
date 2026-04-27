import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/api.js';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const Signup = () => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const { setToken } = useAuth();

  const getPasswordStrength = (value) => {
    let score = 0;
    if (value.length >= 8) score++;
    if (/[A-Z]/.test(value)) score++;
    if (/[0-9]/.test(value)) score++;
    if (/[^A-Za-z0-9]/.test(value)) score++;

    if (!value) {
      return {
        label: 'Use at least 8 characters',
        color: 'bg-white/10',
        width: 'w-0',
      };
    }
    if (score <= 1) {
      return {
        label: 'Weak password',
        color: 'bg-red-400',
        width: 'w-1/4',
      };
    }
    if (score === 2) {
      return {
        label: 'Fair password',
        color: 'bg-amber-400',
        width: 'w-2/4',
      };
    }
    if (score === 3) {
      return {
        label: 'Strong password',
        color: 'bg-cyan-400',
        width: 'w-3/4',
      };
    }
    return {
      label: 'Very strong password',
      color: 'bg-emerald-400',
      width: 'w-full',
    };
  };

  const strength = getPasswordStrength(password);

  const handleSignup = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await api.post('/auth/signup', {
        firstName,
        lastName,
        email,
        password,
      });

      localStorage.setItem('token', res.data.token);
      setToken(res.data.token);
      toast.success('Account created successfully!');
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Signup failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSignup();
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#07111f] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.14),_transparent_30%),linear-gradient(135deg,#06101d_0%,#0b1728_45%,#091423_100%)]" />
      <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:72px_72px]" />
      <div className="absolute left-[-120px] top-20 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="absolute bottom-0 right-[-100px] h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid w-full max-w-6xl overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl lg:grid-cols-[1.02fr_0.98fr]">
          
          <div className="hidden lg:flex flex-col justify-between border-r border-white/10 bg-white/[0.03] p-10">
            <div>
              <div className="mb-10 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/80">
                <div className="h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-[0_0_16px_rgba(34,211,238,0.9)]" />
                Fast, verified onboarding
              </div>

              <div className="max-w-md">
                <p className="mb-4 text-sm font-medium uppercase tracking-[0.22em] text-cyan-300/80">
                  Create your workspace
                </p>
                <h1 className="text-4xl font-semibold leading-tight text-white">
                  Start with a secure account setup.
                </h1>
                <p className="mt-5 text-base leading-7 text-slate-300">
                  Create your account, protect it with strong credentials, and get immediate access to your dashboard.
                </p>
              </div>
            </div>

            <div className="mt-10 space-y-4">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm text-slate-300">Account protection</span>
                  <span className="rounded-full bg-cyan-400/15 px-2.5 py-1 text-xs font-medium text-cyan-300">
                    Enabled
                  </span>
                </div>
                <div className="text-2xl font-semibold text-white">Secure by default</div>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Built-in validation, protected sessions, and verification flows help reduce risky access.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Onboarding</p>
                  <p className="mt-3 text-xl font-semibold text-white">2 min</p>
                  <p className="mt-1 text-xs text-slate-400">Average setup</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Verification</p>
                  <p className="mt-3 text-xl font-semibold text-white">Instant</p>
                  <p className="mt-1 text-xs text-slate-400">Email-ready flow</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Sessions</p>
                  <p className="mt-3 text-xl font-semibold text-white">Protected</p>
                  <p className="mt-1 text-xs text-slate-400">Token auth</p>
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
                      d="M18 9.75V8a6 6 0 10-12 0v1.75M4.75 9.75h14.5A1.75 1.75 0 0121 11.5v7.75A1.75 1.75 0 0119.25 21H4.75A1.75 1.75 0 013 19.25V11.5a1.75 1.75 0 011.75-1.75z"
                    />
                  </svg>
                </div>

                <h2 className="text-3xl font-semibold tracking-tight text-white">
                  Create account
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Set up your account to access your secure workspace.
                </p>
              </div>

              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-200">
                      First name
                    </label>
                    <input
                      className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-[15px] text-white placeholder:text-slate-500 outline-none transition-all duration-200 focus:border-cyan-300/50 focus:bg-white/[0.06] focus:shadow-[0_0_0_4px_rgba(34,211,238,0.08)]"
                      placeholder="John"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      onKeyDown={handleKeyDown}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-200">
                      Last name
                    </label>
                    <input
                      className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-[15px] text-white placeholder:text-slate-500 outline-none transition-all duration-200 focus:border-cyan-300/50 focus:bg-white/[0.06] focus:shadow-[0_0_0_4px_rgba(34,211,238,0.08)]"
                      placeholder="Doe"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      onKeyDown={handleKeyDown}
                    />
                  </div>
                </div>

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
                        d="M4 7.75A1.75 1.75 0 015.75 6h12.5A1.75 1.75 0 0120 7.75v8.5A1.75 1.75 0 0118.25 18H5.75A1.75 1.75 0 014 16.25v-8.5z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4.5 7l7.5 6 7.5-6"
                      />
                    </svg>
                    <input
                      type="email"
                      className="w-full bg-transparent py-3.5 text-[15px] text-white placeholder:text-slate-500 focus:outline-none"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={handleKeyDown}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-200">
                    Password
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
                        d="M16.5 10.75V8.5a4.5 4.5 0 10-9 0v2.25"
                      />
                      <rect x="4.75" y="10.75" width="14.5" height="9.5" rx="1.75" />
                    </svg>

                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="w-full bg-transparent py-3.5 text-[15px] text-white placeholder:text-slate-500 focus:outline-none"
                      placeholder="Create a strong password"
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

                  <div className="pt-1">
                    <div className="h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${strength.color} ${strength.width}`}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="text-slate-400">{strength.label}</span>
                      <span className="text-slate-500">
                        Use uppercase, number, symbol
                      </span>
                    </div>
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
                  onClick={handleSignup}
                  disabled={loading}
                  className="group relative inline-flex w-full items-center justify-center overflow-hidden rounded-xl bg-[linear-gradient(135deg,#67e8f9_0%,#38bdf8_45%,#3b82f6_100%)] px-4 py-3.5 text-sm font-semibold text-slate-950 shadow-[0_10px_30px_rgba(56,189,248,0.28)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(59,130,246,0.34)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="absolute inset-0 bg-white/0 transition group-hover:bg-white/10" />
                  <span className="relative">
                    {loading ? 'Creating account...' : 'Create account'}
                  </span>
                </button>

                <p className="text-xs leading-6 text-slate-500">
                  By continuing, you agree to the Terms and acknowledge the Privacy Policy.
                </p>

                <div className="flex items-center gap-3 pt-1 text-xs text-slate-400">
                  <div className="h-px flex-1 bg-white/10" />
                  Protected onboarding and secure session setup
                  <div className="h-px flex-1 bg-white/10" />
                </div>

                <p className="pt-2 text-center text-sm text-slate-400">
                  Already have an account?{' '}
                  <span
                    onClick={() => navigate('/login')}
                    className="cursor-pointer font-semibold text-cyan-300 transition hover:text-cyan-200"
                  >
                    Login
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

export default Signup;