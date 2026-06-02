import React, { useState, useEffect, useMemo, useRef } from "react";
import api from "../api/api";
import toast from "react-hot-toast";
import { FiChevronDown, FiUser, FiSearch } from "react-icons/fi";
import { ImSpinner2 } from "react-icons/im";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const P2PTransfer = () => {
  const navigate = useNavigate();
  const { token, fetchDashboardData, user } = useAuth();

  const dropdownRef = useRef(null);

  const [users, setUsers] = useState([]);
  const [amount, setAmount] = useState("");
  const [recipientId, setRecipientId] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  // ---------------- FETCH USERS ----------------

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);

      const res = await api.get("/users/all", {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      let allUsers = res?.data?.users || [];

      // optional: remove current logged in user
      if (user?._id) {
        allUsers = allUsers.filter(
          (u) => String(u._id) !== String(user._id)
        );
      }

      setUsers(allUsers);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load users");
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchUsers();
    }
  }, [token]);

  // ----------- OUTSIDE CLICK CLOSE -----------

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target)
      ) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener(
      "mousedown",
      handleOutsideClick
    );

    return () =>
      document.removeEventListener(
        "mousedown",
        handleOutsideClick
      );
  }, []);

  // -------- FILTER USERS --------

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;

    const q = search.toLowerCase();

    return users.filter((u) => {
      const fullName =
        `${u.firstName || ""} ${u.lastName || ""}`.toLowerCase();

      return (
        fullName.includes(q) ||
        u.email?.toLowerCase().includes(q)
      );
    });
  }, [users, search]);

  const selectedUser = useMemo(() => {
    return users.find(
      (u) => String(u._id) === String(recipientId)
    );
  }, [users, recipientId]);

  // -------- TRANSFER --------

  const sendMoney = async () => {
    if (!amount || !recipientId) {
      return toast.error(
        "Please select recipient and amount"
      );
    }

    try {
      setLoading(true);

      await api.post(
        "/transactions/transfer",
        {
          recipientId,
          amount
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      toast.success("Transfer successful");

      setAmount("");
      setRecipientId("");
      setSearch("");

      await fetchDashboardData();
    } catch (err) {
      if (err?.response?.data?.require2FA) {
        localStorage.setItem(
          "pendingTransfer",
          JSON.stringify({
            recipientId,
            amount
          })
        );

        navigate("/verify-otp", {
          state: {
            email: err.response.data.email
          }
        });

        return;
      }

      toast.error(
        err?.response?.data?.message ||
          "Transfer failed"
      );
    } finally {
      setLoading(false);
    }
  };

  const parsedAmount = Number(amount || 0);

  const formattedAmount =
    parsedAmount > 0
      ? `₹${parsedAmount.toLocaleString("en-IN")}`
      : "₹0";

  return (
    <>
      <div className="max-w-7xl mx-auto">

            {/* HEADER */}
            <div className="mb-8 flex flex-col lg:flex-row justify-between gap-5">
              <div>
                <p className="uppercase text-xs tracking-[0.2em] text-cyan-300">
                  Payments
                </p>

                <h1 className="text-4xl font-bold mt-2">
                  P2P Transfer
                </h1>

                <p className="text-slate-400 mt-3 max-w-xl">
                  Securely send money instantly to another user.
                </p>
              </div>

              <div className="flex gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
                  <div className="text-xs text-slate-500">
                    Transfer Type
                  </div>
                  <div>Internal P2P</div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
                  <div className="text-xs text-slate-500">
                    Security
                  </div>
                  <div className="text-emerald-300">
                    OTP Protected
                  </div>
                </div>
              </div>
            </div>

            <div className="grid xl:grid-cols-[1.2fr_.8fr] gap-8">

              {/* LEFT CARD */}
              <div className="rounded-[30px] bg-white/5 border border-white/10 p-6 backdrop-blur-xl shadow-2xl">

                <h2 className="text-xl font-semibold mb-6">
                  Transfer Details
                </h2>

                {/* Amount */}
                <div className="mb-8">
                  <label className="block mb-3 text-sm">
                    Amount
                  </label>

                  <div className="rounded-2xl p-5 bg-white/5 border border-white/10">
                    <div className="flex items-center gap-3">
                      <span className="text-cyan-300 text-3xl">
                        ₹
                      </span>

                      <input
                        type="number"
                        value={amount}
                        onChange={(e)=>
                          setAmount(e.target.value)
                        }
                        placeholder="0.00"
                        className="bg-transparent w-full text-3xl font-semibold outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* RECIPIENT */}
                <div
                  ref={dropdownRef}
                  className="relative mb-8"
                >
                  <label className="block mb-3 text-sm">
                    Recipient
                  </label>

                  <button
                    onClick={() =>
                      setDropdownOpen(
                        !dropdownOpen
                      )
                    }
                    className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 flex justify-between items-center"
                  >
                    <div className="flex items-center gap-4">

                      <div className="w-11 h-11 rounded-full bg-cyan-400/10 flex items-center justify-center">
                        <FiUser/>
                      </div>

                      {selectedUser ? (
                        <div className="text-left">
                          <div>
                            {selectedUser.firstName}{" "}
                            {selectedUser.lastName}
                          </div>

                          <div className="text-xs text-slate-400">
                            {selectedUser.email}
                          </div>
                        </div>
                      ) : (
                        <div className="text-left">
                          Select recipient
                        </div>
                      )}
                    </div>

                    <FiChevronDown
                      className={
                        dropdownOpen
                          ? "rotate-180 transition"
                          : "transition"
                      }
                    />
                  </button>

                  {/* DROPDOWN */}
                  {dropdownOpen && (
                    <div className="absolute z-[9999] mt-3 w-full rounded-2xl bg-[#0c1726] border border-white/10 p-3 shadow-2xl">

                      <div className="mb-3 flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-3 py-3">
                        <FiSearch/>
                        <input
                          value={search}
                          onChange={(e)=>
                            setSearch(
                              e.target.value
                            )
                          }
                          placeholder="Search user"
                          className="bg-transparent outline-none w-full"
                        />
                      </div>

                      <div className="max-h-72 overflow-y-auto space-y-2">

                        {loadingUsers ? (
                          <div className="p-5 text-center">
                            Loading...
                          </div>
                        ) : filteredUsers.length ? (
                          filteredUsers.map(
                            (u)=>(
                              <button
                                key={u._id}
                                type="button"
                                onClick={()=>{
                                  setRecipientId(
                                    u._id
                                  );

                                  setDropdownOpen(
                                    false
                                  );

                                  setSearch("");
                                }}
                                className={`w-full text-left p-4 rounded-xl flex items-center gap-4 border transition
                                ${
                                  recipientId===u._id
                                    ? "bg-cyan-500/10 border-cyan-400/30"
                                    : "bg-white/5 border-white/5 hover:bg-white/10"
                                }`}
                              >
                                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                                  <FiUser/>
                                </div>

                                <div>
                                  <div>
                                    {u.firstName}{" "}
                                    {u.lastName}
                                  </div>

                                  <div className="text-xs text-slate-400">
                                    {u.email}
                                  </div>
                                </div>
                              </button>
                            )
                          )
                        ) : (
                          <div className="text-center p-5 text-slate-400">
                            No users found
                          </div>
                        )}

                      </div>
                    </div>
                  )}
                </div>

                {/* SEND BUTTON */}
                <button
                  onClick={sendMoney}
                  disabled={
                    loading ||
                    !amount ||
                    !recipientId
                  }
                  className="w-full rounded-2xl py-4 font-semibold bg-gradient-to-r from-cyan-300 to-blue-500 text-slate-950 disabled:opacity-50 flex items-center justify-center gap-3"
                >
                  {loading ? (
                    <>
                      <ImSpinner2 className="animate-spin"/>
                      Sending...
                    </>
                  ) : (
                    `Send ${
                      parsedAmount
                        ? formattedAmount
                        : "Money"
                    }`
                  )}
                </button>

              </div>

              {/* RIGHT SIDEBAR PANEL */}
              <div className="space-y-6">

                <div className="rounded-[30px] bg-white/5 border border-white/10 p-6 backdrop-blur-xl">
                  <h2 className="text-xl font-semibold mb-5">
                    Transfer Summary
                  </h2>

                  <div className="rounded-2xl p-5 bg-black/20 border border-white/10">
                    <div className="flex justify-between mb-5">
                      <span>Amount</span>
                      <span className="text-2xl font-semibold">
                        {formattedAmount}
                      </span>
                    </div>

                    <div className="space-y-4 border-t border-white/10 pt-4">
                      <div className="flex justify-between">
                        <span>Recipient</span>
                        <span>
                          {selectedUser
                            ? `${selectedUser.firstName}`
                            : "--"}
                        </span>
                      </div>

                      <div className="flex justify-between">
                        <span>Mode</span>
                        <span>
                          Instant Internal
                        </span>
                      </div>

                      <div className="flex justify-between">
                        <span>Security</span>
                        <span className="text-emerald-300">
                          2FA Enabled
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-[30px] bg-white/5 border border-white/10 p-6">
                  <h2 className="text-xl font-semibold mb-4">
                    Transfer Notes
                  </h2>

                  <div className="space-y-4 text-slate-300 text-sm">
                    <div className="p-4 rounded-2xl bg-white/5">
                      OTP verification may be required.
                    </div>

                    <div className="p-4 rounded-2xl bg-white/5">
                      Dashboard balances refresh automatically.
                    </div>

                    <div className="p-4 rounded-2xl bg-white/5">
                      Verify recipient before sending.
                    </div>
                  </div>
                </div>

              </div>

            </div>
      </div>
    </>
  );
};

export default P2PTransfer;