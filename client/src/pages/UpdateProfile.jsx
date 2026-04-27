import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../api/api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const UpdateProfile = () => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const { token, fetchDashboardData } = useAuth();

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setPageLoading(true);

        const res = await api.get('/users/profile', {
          headers: { Authorization: `Bearer ${token}` },
        });

        setFormData({
          firstName: res.data.firstName || '',
          lastName: res.data.lastName || '',
          email: res.data.email || '',
          password: '',
        });
      } catch (err) {
        console.error(err);
        toast.error('Failed to fetch profile data.');
      } finally {
        setPageLoading(false);
      }
    };

    if (token) {
      fetchProfile();
    }
  }, [token]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const getPasswordStrength = (value) => {
    if (!value) {
      return {
        label: 'Optional password update',
        color: 'bg-white/10',
        width: 'w-0',
      };
    }

    let score = 0;
    if (value.length >= 8) score++;
    if (/[A-Z]/.test(value)) score++;
    if (/[0-9]/.test(value)) score++;
    if (/[^A-Za-z0-9]/.test(value)) score++;

    if (score <= 1) {
      return { label: 'Weak', color: 'bg-red-400', width: 'w-1/4' };
    }
    if (score === 2) {
      return { label: 'Fair', color: 'bg-amber-400', width: 'w-2/4' };
    }
    if (score === 3) {
      return { label: 'Strong', color: 'bg-cyan-400', width: 'w-3/4' };
    }
    return { label: 'Very strong', color: 'bg-emerald-400', width: 'w-full' };
  };

  const strength = getPasswordStrength(formData.password);

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setSaving(true);

      await api.put('/users/update-profile', formData, {
        headers: { Authorization: `Bearer ${token}` },
      });

      toast.success('Profile updated successfully!');
      fetchDashboardData();
      setFormData((prev) => ({ ...prev, password: '' }));
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#07111f] text-white">
      <Sidebar />

      <div className="relative flex-1 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.10),_transparent_26%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.08),_transparent_28%),linear-gradient(180deg,#08111e_0%,#0b1626_100%)]" />
        <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:72px_72px]" />

        <div className="relative z-10 h-screen overflow-y-auto px-5 py-6 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-6xl">
            <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-[0.24em] text-cyan-300/75">
                  Account settings
                </p>
                <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  Update profile
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
                  Manage your personal details, email address, and password from one secure place.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-row">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Profile
                  </p>
                  <p className="mt-1 text-sm font-medium text-white">Active</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Security
                  </p>
                  <p className="mt-1 text-sm font-medium text-emerald-300">Protected</p>
                </div>
              </div>
            </div>

            {pageLoading ? (
              <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
                <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                  <div className="animate-pulse space-y-5">
                    <div className="h-6 w-40 rounded bg-white/10" />
                    <div className="grid gap-5 sm:grid-cols-2">
                      <div className="h-14 rounded-xl bg-white/10" />
                      <div className="h-14 rounded-xl bg-white/10" />
                    </div>
                    <div className="h-14 rounded-xl bg-white/10" />
                    <div className="h-14 rounded-xl bg-white/10" />
                    <div className="h-12 rounded-xl bg-white/10" />
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="h-44 animate-pulse rounded-[28px] border border-white/10 bg-white/[0.05]" />
                  <div className="h-44 animate-pulse rounded-[28px] border border-white/10 bg-white/[0.05]" />
                </div>
              </div>
            ) : (
              <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
                <form
                  onSubmit={handleSubmit}
                  className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-8"
                >
                  <div className="mb-8 flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold text-white">Personal information</h2>
                      <p className="mt-2 text-sm leading-6 text-slate-400">
                        Keep your account details current and secure.
                      </p>
                    </div>

                    <div className="hidden h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-300 sm:flex">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-7 w-7"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.8}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15.75 6.75a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 19.25a7.5 7.5 0 0115 0"
                        />
                      </svg>
                    </div>
                  </div>

                  <div className="space-y-5">
                    <div className="grid gap-5 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-200">
                          First name
                        </label>
                        <input
                          name="firstName"
                          value={formData.firstName}
                          onChange={handleChange}
                          className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-[15px] text-white placeholder:text-slate-500 outline-none transition-all duration-200 focus:border-cyan-300/50 focus:bg-white/[0.06] focus:shadow-[0_0_0_4px_rgba(34,211,238,0.08)]"
                          type="text"
                          placeholder="First name"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-200">
                          Last name
                        </label>
                        <input
                          name="lastName"
                          value={formData.lastName}
                          onChange={handleChange}
                          className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-[15px] text-white placeholder:text-slate-500 outline-none transition-all duration-200 focus:border-cyan-300/50 focus:bg-white/[0.06] focus:shadow-[0_0_0_4px_rgba(34,211,238,0.08)]"
                          type="text"
                          placeholder="Last name"
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
                          name="email"
                          value={formData.email}
                          onChange={handleChange}
                          className="w-full bg-transparent py-3.5 text-[15px] text-white placeholder:text-slate-500 focus:outline-none"
                          type="email"
                          placeholder="Email address"
                        />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-medium text-white">Password update</h3>
                          <p className="mt-1 text-xs text-slate-400">
                            Leave blank to keep your current password.
                          </p>
                        </div>

                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                          Optional
                        </span>
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
                            d="M16.5 10.75V8.5a4.5 4.5 0 10-9 0v2.25"
                          />
                          <rect x="4.75" y="10.75" width="14.5" height="9.5" rx="1.75" />
                        </svg>

                        <input
                          name="password"
                          value={formData.password}
                          onChange={handleChange}
                          className="w-full bg-transparent py-3.5 text-[15px] text-white placeholder:text-slate-500 focus:outline-none"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Enter a new password"
                        />

                        <button
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          className="ml-3 text-sm font-medium text-slate-400 transition hover:text-white"
                        >
                          {showPassword ? 'Hide' : 'Show'}
                        </button>
                      </div>

                      <div className="pt-4">
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

                    <div className="flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-slate-400">
                        Changes are applied to your active account profile.
                      </p>

                      <button
                        type="submit"
                        disabled={saving}
                        className="group relative inline-flex items-center justify-center overflow-hidden rounded-xl bg-[linear-gradient(135deg,#67e8f9_0%,#38bdf8_45%,#3b82f6_100%)] px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_10px_30px_rgba(56,189,248,0.28)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(59,130,246,0.34)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <span className="absolute inset-0 bg-white/0 transition group-hover:bg-white/10" />
                        <span className="relative">
                          {saving ? 'Saving changes...' : 'Save changes'}
                        </span>
                      </button>
                    </div>
                  </div>
                </form>

                <div className="space-y-6">
                  <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                    <p className="text-xs font-medium uppercase tracking-[0.22em] text-cyan-300/75">
                      Profile summary
                    </p>

                    <div className="mt-5 flex items-center gap-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300 to-blue-500 text-lg font-semibold text-slate-950">
                        {formData.firstName?.[0] || 'U'}
                        {formData.lastName?.[0] || ''}
                      </div>

                      <div>
                        <h3 className="text-lg font-semibold text-white">
                          {[formData.firstName, formData.lastName].filter(Boolean).join(' ') || 'User'}
                        </h3>
                        <p className="text-sm text-slate-400">{formData.email || 'No email'}</p>
                      </div>
                    </div>

                    <div className="mt-6 space-y-4">
                      <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                        <span className="text-sm text-slate-400">Account status</span>
                        <span className="text-sm font-medium text-emerald-300">Active</span>
                      </div>

                      <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                        <span className="text-sm text-slate-400">Access level</span>
                        <span className="text-sm font-medium text-white">Standard user</span>
                      </div>

                      <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                        <span className="text-sm text-slate-400">Password change</span>
                        <span className="text-sm font-medium text-white">
                          {formData.password ? 'Pending update' : 'No changes'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                    <p className="text-xs font-medium uppercase tracking-[0.22em] text-cyan-300/75">
                      Security tips
                    </p>

                    <div className="mt-5 space-y-4">
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <h3 className="text-sm font-medium text-white">Use a unique password</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-400">
                          Avoid reusing passwords from other services.
                        </p>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <h3 className="text-sm font-medium text-white">Keep your email current</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-400">
                          Recovery and verification depend on your active address.
                        </p>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <h3 className="text-sm font-medium text-white">Review account activity</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-400">
                          Check recent sessions if something looks unfamiliar.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpdateProfile;