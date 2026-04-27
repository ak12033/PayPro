import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getPublicIP } from "../utils/getPublicIP.js";
import api from "../api/api.js";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";

const Login = () => {
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [showPassword,setShowPassword]=useState(false);

  const navigate=useNavigate();
  const { setToken } = useAuth();

  // system/browser theme detect
  const [darkMode,setDarkMode]=useState(
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  useEffect(()=>{
    const media=window.matchMedia("(prefers-color-scheme: dark)");

    const handleThemeChange=(e)=>{
      setDarkMode(e.matches);
    };

    media.addEventListener("change",handleThemeChange);

    return ()=> media.removeEventListener("change",handleThemeChange);
  },[]);

  const handleLogin = async () => {
    setLoading(true);
    setError("");

    try{
      const ip = await getPublicIP();

      const res=await api.post("/auth/login",{
        email,
        password,
        ip
      });

      localStorage.setItem("token",res.data.token);
      setToken(res.data.token);

      toast.success("Welcome back");
      navigate("/dashboard");

    }catch(err){

      if(err.response?.status===403){
        toast("New login location detected. OTP sent!");
        navigate("/verify-login-otp",{state:{email}});
      }else{
        setError("Invalid email or password");
      }

    }finally{
      setLoading(false);
    }
  };

  const handleKeyDown=(e)=>{
    if(e.key==="Enter"){
      handleLogin();
    }
  };

  return (
    <div
      className={`relative min-h-screen overflow-hidden transition-all duration-500
      ${
        darkMode
          ? "bg-[#07111f] text-white"
          : "bg-[#f6f9fc] text-slate-900"
      }`}
    >

      {/* background gradients */}
      <div
        className={`absolute inset-0 ${
          darkMode
            ? "bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.14),_transparent_30%),linear-gradient(135deg,#06101d_0%,#0b1728_45%,#091423_100%)]"
            : "bg-[radial-gradient(circle_at_top_left,_rgba(6,182,212,0.12),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.10),_transparent_30%),linear-gradient(135deg,#f8fbff_0%,#f6f9fc_45%,#eef4fb_100%)]"
        }`}
      />

      <div
        className={`absolute inset-0 ${
          darkMode
            ? "opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)]"
            : "opacity-[0.05] [background-image:linear-gradient(rgba(15,23,42,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.08)_1px,transparent_1px)]"
        } [background-size:72px_72px]`}
      />

      <div className={`absolute left-[-100px] top-16 h-72 w-72 rounded-full blur-3xl ${
        darkMode ? "bg-cyan-400/10" : "bg-cyan-300/30"
      }`} />

      <div className={`absolute bottom-0 right-[-80px] h-80 w-80 rounded-full blur-3xl ${
        darkMode ? "bg-blue-500/10":"bg-blue-300/30"
      }`} />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-8">
        <div
          className={`grid w-full max-w-6xl overflow-hidden rounded-[30px] backdrop-blur-xl lg:grid-cols-[1.05fr_0.95fr]
          ${
            darkMode
              ? "border border-white/10 bg-white/[0.04] shadow-[0_20px_80px_rgba(0,0,0,0.45)]"
              : "border border-white/70 bg-white/70 shadow-[0_20px_80px_rgba(15,23,42,0.10)]"
          }`}
        >

          {/* LEFT PANEL */}
          <div className={`hidden lg:flex flex-col justify-between p-10 ${
            darkMode
              ? "border-r border-white/10 bg-white/[0.03]"
              : "border-r border-slate-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.78),rgba(241,245,249,0.88))]"
          }`}>

            <div>
              <div className={`mb-10 inline-flex items-center gap-3 rounded-full px-4 py-2 text-sm
                ${
                  darkMode
                    ? "border border-white/10 bg-white/[0.04] text-white/80"
                    :"border border-cyan-100 bg-white/90 text-slate-600 shadow-sm"
                }`}
              >
                <div className={`h-2.5 w-2.5 rounded-full ${
                  darkMode
                    ? "bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,.9)]"
                    :"bg-emerald-500 shadow-[0_0_12px_rgba(34,197,94,.45)]"
                }`} />
                Secure workspace access
              </div>

              <div className="max-w-md">
                <p className={`mb-4 text-sm uppercase tracking-[0.22em] ${
                  darkMode ? "text-cyan-300":"text-cyan-700"
                }`}>
                  Welcome back
                </p>

                <h1 className={`text-4xl font-semibold leading-tight ${
                  darkMode ? "text-white":"text-slate-900"
                }`}>
                  Sign in to your control center.
                </h1>

                <p className={`mt-5 text-base leading-7 ${
                  darkMode ? "text-slate-300":"text-slate-600"
                }`}>
                  Review activity, manage sessions and access your dashboard
                  with a secure verified login flow.
                </p>
              </div>
            </div>

            <div className="mt-10 grid gap-4">

              <div className={`rounded-3xl p-5 ${
                darkMode
                  ? "border border-white/10 bg-black/20"
                  :"border border-slate-200 bg-white"
              }`}>
                <div className="mb-3 flex justify-between">
                  <span className={darkMode?"text-slate-300":"text-slate-500"}>
                    Threat monitoring
                  </span>

                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    darkMode
                      ?"bg-emerald-400/15 text-emerald-300"
                      :"bg-emerald-50 text-emerald-700"
                  }`}>
                    Active
                  </span>
                </div>

                <div className={`text-2xl font-semibold ${
                  darkMode?"text-white":"text-slate-900"
                }`}>
                  24/7 protection
                </div>

                <p className={`mt-2 text-sm ${
                  darkMode?"text-slate-400":"text-slate-500"
                }`}>
                  New device and location checks trigger OTP verification.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                {[
                  ["Sessions","128","This week"],
                  ["Success","99.98%","Auth uptime"],
                  ["Risk checks","Real-time","IP + OTP"]
                ].map((item)=>(
                  <div
                    key={item[0]}
                    className={`rounded-2xl p-4 ${
                      darkMode
                        ? "border border-white/10 bg-white/[0.04]"
                        :"border border-slate-200 bg-white shadow-sm"
                    }`}
                  >
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                      {item[0]}
                    </p>

                    <p className={`mt-3 text-xl font-semibold ${
                      darkMode?"text-white":"text-slate-900"
                    }`}>
                      {item[1]}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      {item[2]}
                    </p>
                  </div>
                ))}
              </div>

            </div>
          </div>


          {/* RIGHT LOGIN CARD */}
          <div className={`flex items-center justify-center p-6 md:p-10 ${
            darkMode
              ? "bg-[linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.02))]"
              :"bg-[linear-gradient(180deg,rgba(255,255,255,.92),rgba(248,250,252,.96))]"
          }`}>

            <div className={`w-full max-w-md rounded-[28px] p-8 ${
              darkMode
                ? ""
                :"border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,.08)]"
            }`}>

              <div className="mb-8">
                <h2 className={`text-3xl font-semibold ${
                  darkMode?"text-white":"text-slate-900"
                }`}>
                  Login
                </h2>

                <p className={`mt-2 text-sm ${
                  darkMode?"text-slate-400":"text-slate-500"
                }`}>
                  Use your email and password to continue securely.
                </p>
              </div>


              <div className="space-y-5">

                <div>
                  <label className={`block mb-2 text-sm ${
                    darkMode?"text-slate-200":"text-slate-700"
                  }`}>
                    Email address
                  </label>

                  <input
                    type="email"
                    value={email}
                    onChange={(e)=>setEmail(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="you@example.com"
                    className={`w-full rounded-2xl px-4 py-3.5 outline-none transition
                    ${
                      darkMode
                       ? "bg-white/[0.04] border border-white/10 text-white placeholder:text-slate-500"
                       : "bg-slate-50 border border-slate-200 text-slate-900"
                    }`}
                  />
                </div>


                <div>
                  <div className="flex justify-between mb-2">
                    <label className={`text-sm ${
                      darkMode?"text-slate-200":"text-slate-700"
                    }`}>
                      Password
                    </label>

                    <button
                      type="button"
                      className={`text-xs font-medium ${
                        darkMode
                         ? "text-cyan-300"
                         :"text-cyan-700"
                      }`}
                    >
                      Forgot password?
                    </button>
                  </div>

                  <div className="relative">
                    <input
                      type={showPassword?"text":"password"}
                      value={password}
                      onChange={(e)=>setPassword(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Enter your password"
                      className={`w-full rounded-2xl px-4 py-3.5 outline-none transition
                      ${
                        darkMode
                         ? "bg-white/[0.04] border border-white/10 text-white placeholder:text-slate-500"
                         : "bg-slate-50 border border-slate-200 text-slate-900"
                      }`}
                    />

                    <button
                      type="button"
                      onClick={()=>setShowPassword(prev=>!prev)}
                      className={`absolute right-4 top-1/2 -translate-y-1/2 text-sm ${
                        darkMode?"text-slate-400":"text-slate-500"
                      }`}
                    >
                      {showPassword ? "Hide":"Show"}
                    </button>
                  </div>
                </div>


                {error && (
                  <div className={`rounded-xl px-4 py-3 text-sm ${
                    darkMode
                      ? "bg-red-500/10 border border-red-400/20 text-red-200"
                      : "bg-red-50 border border-red-200 text-red-700"
                  }`}>
                    {error}
                  </div>
                )}

                <button
                  onClick={handleLogin}
                  disabled={loading}
                  className={`w-full rounded-2xl py-3.5 font-semibold transition
                  ${
                    darkMode
                     ? "bg-[linear-gradient(135deg,#67e8f9_0%,#38bdf8_45%,#3b82f6_100%)] text-slate-950"
                     : "bg-[linear-gradient(135deg,#06b6d4_0%,#0ea5e9_45%,#2563eb_100%)] text-white"
                  }`}
                >
                  {loading ? "Logging in..." : "Login to dashboard"}
                </button>

                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <div className={`${darkMode?"bg-white/10":"bg-slate-200"} h-px flex-1`} />
                  Protected by device and location verification
                  <div className={`${darkMode?"bg-white/10":"bg-slate-200"} h-px flex-1`} />
                </div>

                <p className={`text-center text-sm ${
                  darkMode?"text-slate-400":"text-slate-500"
                }`}>
                  Don&apos;t have an account?{" "}
                  <span
                    onClick={()=>navigate("/signup")}
                    className={`cursor-pointer font-semibold ${
                      darkMode
                        ? "text-cyan-300"
                        :"text-cyan-700"
                    }`}
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