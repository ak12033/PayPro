import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../api/api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const Login2FA = () => {
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const { state } = useLocation();
  const navigate = useNavigate();
  const { setToken } = useAuth();

  useEffect(() => {
    if (!state?.email) {
      navigate('/login');
    }
  }, [state, navigate]);

  const verify = async () => {
    if (!otp.trim()) {
      toast.error('Please enter the OTP');
      return;
    }

    try {
      setLoading(true);

      const res = await api.post('/auth/verify-login-otp', {
        email: state.email,
        otp,
      });

      setToken(res.data.token);
      localStorage.setItem('token', res.data.token);
      toast.success('Login successful!');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    try {
      setResending(true);
      await api.post('/auth/resend-login-otp', { email: state.email });
      toast.success('OTP resent!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to resend OTP');
    } finally {
      setResending(false);
    }
  };

  const maskedEmail = state?.email
    ? state.email.replace(/(^.{2})(.*)(@.*$)/, (_, a, b, c) => {
        const hidden = b.replace(/./g, '•');
        return `${a}${hidden}${c}`;
      })
    : '';

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#07111f] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.14),_transparent_30%),linear-gradient(135deg,#06101d_0%,#0b1728_45%,#091423_100%)]" />
      <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:72px_72px]" />
      <div className="absolute left-[-120px] top-20 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="absolute bottom-0 right-[-100px] h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid w-full max-w-5xl overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl lg:grid-cols-[1.05fr_0.95fr]">
          <div className="hidden lg:flex flex-col justify-between border-r border-white/10 bg-white/[0.03] p-10">
            <div>
              <div className="mb-10 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/80">
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.9)]" />
                Identity confirmation required
              </div>

              <div className="max-w-md">
                <p className="mb-4 text-sm font-medium uppercase tracking-[0.22em] text-cyan-300/80">
                  Two-factor verification
                </p>
                <h1 className="text-4xl font-semibold leading-tight text-white">
                  Confirm it&apos;s really you.
                </h1>
                <p className="mt-5 text-base leading-7 text-slate-300">
                  We sent a one-time passcode to your registered email to protect your account from unfamiliar access attempts.
                </p>
              </div>
            </div>

            <div className="mt-10 grid gap-4">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm text-slate-300">Verification channel</span>
                  <span className="rounded-full bg-cyan-400/15 px-2.5 py-1 text-xs font-medium text-cyan-300">
                    Email OTP
                  </span>
                </div>
                <div className="text-2xl font-semibold text-white">{maskedEmail || 'Protected inbox'}</div>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  If this sign-in was started by you, enter the code exactly as received.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Protection</p>
                  <p className="mt-3 text-xl font-semibold text-white">2FA active</p>
                  <p className="mt-1 text-xs text-slate-400">Extra login security</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Session check</p>
                  <p className="mt-3 text-xl font-semibold text-white">Verified</p>
                  <p className="mt-1 text-xs text-slate-400">Required before access</p>
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
                  Verify login OTP
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Enter the one-time code sent to{' '}
                  <span className="font-medium text-slate-300">
                    {maskedEmail || 'your email'}
                  </span>
                  .
                </p>
              </div>

              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-200">
                    One-time password
                  </label>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 transition-all duration-200 focus-within:border-cyan-300/50 focus-within:bg-white/[0.06] focus-within:shadow-[0_0_0_4px_rgba(34,211,238,0.08)]">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      autoComplete="one-time-code"
                      className="w-full bg-transparent text-center text-2xl font-semibold tracking-[0.45em] text-white placeholder:text-slate-600 focus:outline-none"
                      placeholder="• • • • • •"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') verify();
                      }}
                    />
                  </div>

                  <p className="text-xs text-slate-500">
                    Enter the 6-digit code to continue securely.
                  </p>
                </div>

                <button
                  onClick={verify}
                  disabled={loading}
                  className="group relative inline-flex w-full items-center justify-center overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#67e8f9_0%,#38bdf8_45%,#3b82f6_100%)] px-4 py-3.5 text-sm font-semibold text-slate-950 shadow-[0_10px_30px_rgba(56,189,248,0.28)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(59,130,246,0.34)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="absolute inset-0 bg-white/0 transition group-hover:bg-white/10" />
                  <span className="relative">
                    {loading ? 'Verifying...' : 'Verify and continue'}
                  </span>
                </button>

                <button
                  onClick={resendOtp}
                  disabled={resending}
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-sm font-medium text-slate-200 transition duration-200 hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {resending ? 'Resending OTP...' : 'Resend OTP'}
                </button>

                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                  <p className="text-sm font-medium text-white">Security reminder</p>
                  <p className="mt-1 text-sm leading-6 text-slate-400">
                    Never share your OTP with anyone. Our team will never ask for it directly.
                  </p>
                </div>

                <p className="text-center text-xs text-slate-500">
                  Verification helps protect your account from unfamiliar sign-in attempts.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login2FA;