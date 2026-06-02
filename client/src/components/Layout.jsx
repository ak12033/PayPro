import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

const Layout = () => {
    return (
        <div className="flex min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.10),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.10),_transparent_28%),linear-gradient(135deg,#06101d_0%,#0b1728_45%,#091423_100%)] text-white">
            <div className="fixed top-0 left-0 h-screen w-64 border-r border-white/10 bg-white/[0.03] backdrop-blur-2xl z-50">
                <Sidebar />
            </div>
            <div className="ml-64 flex-1 p-4 sm:p-6 lg:p-8 xl:p-10 flex flex-col h-screen overflow-y-auto">
                <Topbar />
                <main className="flex-1 mt-4">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};

export default Layout;
