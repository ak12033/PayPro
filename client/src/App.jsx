import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import P2PTransfer from './pages/P2PTransfer';
import AddTransaction from './pages/AddTransaction';
import TransactionHistory from './pages/TransactionHistory';
import AddMoney from './pages/AddMoney';
import UpdateProfile from './pages/UpdateProfile';
import Transaction2FA from './pages/transaction2FA';
import Login2FA from './pages/login2FA';
import { AuthProvider } from './context/AuthContext';
import TransactionFilter from './components/TransactionFilter';
import TestTransactionFilter from './pages/TestTransactionFilter';

const App = () => {
    return (
        <BrowserRouter>
            <AuthProvider>
                {/* Toast notifications */}
                <Toaster
                    position="top-right"
                    toastOptions={{
                        style: {
                            borderRadius: '12px',
                            background: 'linear-gradient(to right, #0f172a, #1e293b)',
                            color: '#f9fafb',
                        },
                        success: {
                            iconTheme: {
                                primary: '#34D399',
                                secondary: '#1e293b',
                            },
                        },
                        error: {
                            iconTheme: {
                                primary: '#F87171',
                                secondary: '#1e293b',
                            },
                        },
                    }}
                />

                <Routes>
                    <Route path="/" element={<Login />} />
                    <Route path="/signup" element={<Signup />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/verify-otp" element={<Transaction2FA />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/p2p-transfer" element={<P2PTransfer />} />
                    <Route path="/add-transaction" element={<AddTransaction />} />
                    <Route path="/transactions" element={<TransactionHistory />} />
                    <Route path="/add-money" element={<AddMoney />} />
                    <Route path="/update-profile" element={<UpdateProfile />} />
                    <Route path="/verify-login-otp" element={<Login2FA />} />
                    <Route path="/check" element={<TestTransactionFilter />} />
                </Routes>
            </AuthProvider>
        </BrowserRouter>
    );
};

export default App;
