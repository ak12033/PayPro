import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { useNotifications } from './NotificationContext';
import { toast } from 'react-hot-toast';

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
    const { 
        token, 
        setBalance, 
        setRecentTransactions, 
        setAllTransactions, 
        setUserName, 
        fetchDashboardData, 
        logout 
    } = useAuth();
    
    const { refreshNotifications } = useNotifications();
    const [socket, setSocket] = useState(null);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        if (!token) {
            if (socket) {
                socket.disconnect();
                setSocket(null);
            }
            return;
        }

        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
        
        // Connect to Socket.IO Server with auth token
        const newSocket = io(backendUrl, {
            auth: { token },
            transports: ['websocket', 'polling']
        });

        newSocket.on('connect', () => {
            setIsConnected(true);
            console.log('🔌 Connected to Socket.IO server');
        });

        newSocket.on('disconnect', (reason) => {
            setIsConnected(false);
            console.log('🔌 Socket disconnected:', reason);
        });

        // Reconnection Handling: refetch latest data from REST to ensure sync
        newSocket.on('reconnect', (attempt) => {
            console.log(`🔌 Socket reconnected after ${attempt} attempts. Syncing dashboard data...`);
            fetchDashboardData().catch(err => console.error('Failed to sync auth data on reconnect:', err));
            refreshNotifications();
        });

        // Event: Wallet / Balance updated (from transfer or manual transaction)
        newSocket.on('wallet_update', (data) => {
            if (data.newBalance !== undefined) {
                setBalance(data.newBalance);
            }
            if (data.transaction) {
                setRecentTransactions(prev => {
                    // Prevent duplicate transactions in the list
                    const exists = prev.some(t => t._id === data.transaction._id);
                    if (exists) return prev;
                    return [data.transaction, ...prev].slice(0, 6);
                });
                setAllTransactions(prev => {
                    const exists = prev.some(t => t._id === data.transaction._id);
                    if (exists) return prev;
                    return [data.transaction, ...prev];
                });
            }
            
            const category = data.transaction?.category || '';
            const amount = data.transaction?.amount || 0;
            const type = data.transaction?.type || 'Debit';
            
            if (category === 'Transfer') {
                if (type === 'Debit') {
                    toast.success(`Sent ₹${amount} successfully!`);
                } else {
                    toast.success(`Received ₹${amount}!`);
                }
            } else if (category === 'Refund') {
                toast.success(`Refund of ₹${amount} processed!`);
            } else {
                toast.success(`Wallet balance updated!`);
            }
        });

        // Event: direct Deposit success (Razorpay captured)
        newSocket.on('deposit_success', (data) => {
            if (data.newBalance !== undefined) {
                setBalance(data.newBalance);
            }
            if (data.transaction) {
                setRecentTransactions(prev => {
                    const exists = prev.some(t => t._id === data.transaction._id);
                    if (exists) return prev;
                    return [data.transaction, ...prev].slice(0, 6);
                });
                setAllTransactions(prev => {
                    const exists = prev.some(t => t._id === data.transaction._id);
                    if (exists) return prev;
                    return [data.transaction, ...prev];
                });
                toast.success(`Wallet topped up by ₹${data.transaction.amount} successfully!`);
            }
        });

        // Event: New in-app notification saved
        newSocket.on('notification_received', (data) => {
            refreshNotifications();
            if (data.notification) {
                toast.custom((t) => (
                    <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-md w-full bg-slate-800 shadow-lg rounded-lg pointer-events-auto flex ring-1 ring-black ring-opacity-5`}>
                        <div className="flex-1 w-0 p-4">
                            <div className="flex items-start">
                                <div className="ml-3 flex-1">
                                    <p className="text-sm font-medium text-white">
                                        🔔 {data.notification.title || 'New Notification'}
                                    </p>
                                    <p className="mt-1 text-sm text-slate-300">
                                        {data.notification.message}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                ), { duration: 4000 });
            }
        });

        // Event: Profile/Settings updated
        newSocket.on('profile_updated', (data) => {
            if (data.user) {
                if (data.user.firstName) {
                    setUserName(data.user.firstName);
                }
                if (data.user.accountBalance !== undefined) {
                    setBalance(data.user.accountBalance);
                }
                toast.success('Your profile settings were updated.');
            }
        });

        // Event: Security revoked session
        newSocket.on('session_compromised', (data) => {
            toast.error(data.reason || 'Session revoked due to security alert.', { duration: 6000 });
            logout();
        });

        setSocket(newSocket);

        // CLEANUP: Unmount listener teardown to avoid memory leak or duplication
        return () => {
            newSocket.off('connect');
            newSocket.off('disconnect');
            newSocket.off('reconnect');
            newSocket.off('wallet_update');
            newSocket.off('deposit_success');
            newSocket.off('notification_received');
            newSocket.off('profile_updated');
            newSocket.off('session_compromised');
            newSocket.disconnect();
        };
    }, [token]);

    return (
        <SocketContext.Provider value={{ socket, isConnected }}>
            {children}
        </SocketContext.Provider>
    );
};
