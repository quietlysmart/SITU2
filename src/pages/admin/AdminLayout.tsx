import { Link, Outlet, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useEffect, useState } from "react";

import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";

// Admin email check (client-side for UI protection - backend is the true gatekeeper)
const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || "").split(",").map((e: string) => e.trim().toLowerCase());

export function AdminLayout() {
    const { user, loading } = useAuth();
    const location = useLocation();
    const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

    useEffect(() => {
        const checkAdminStatus = async () => {
            if (!user) {
                if (!loading) setIsAdmin(false);
                return;
            }

            // 1. Check Env Vars (Fast)
            const isEnvAdmin = ADMIN_EMAILS.includes(user.email?.toLowerCase() || "");
            if (isEnvAdmin) {
                setIsAdmin(true);
                return;
            }

            // 2. Check Firestore (Robust)
            try {
                const userRef = doc(db, "users", user.uid);
                const userSnap = await getDoc(userRef);
                if (userSnap.exists() && userSnap.data().isAdmin === true) {
                    setIsAdmin(true);
                } else {
                    setIsAdmin(false);
                }
            } catch (err) {
                console.error("Failed to check admin status:", err);
                setIsAdmin(false);
            }
        };

        checkAdminStatus();
    }, [user, loading]);

    if (loading || isAdmin === null) {
        return (
            <div className="flex items-center justify-center h-screen bg-slate-100">
                <div className="text-slate-600">Loading...</div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (!isAdmin) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-slate-100 p-4">
                <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center">
                    <h1 className="text-2xl font-bold text-slate-800 mb-2">Access Denied</h1>
                    <p className="text-slate-600 mb-4">You do not have administrative privileges.</p>

                    <div className="bg-slate-50 p-4 rounded-lg text-left text-sm font-mono text-slate-700 mb-6">
                        <p><strong>User:</strong> {user.email}</p>
                        <p><strong>UID:</strong> {user.uid}</p>
                        <p><strong>Status:</strong> Not recognized as Admin</p>
                        <p className="border-t border-slate-200 mt-2 pt-2 text-xs text-slate-400">
                            Checking: Env ({ADMIN_EMAILS.length}) & Firestore
                        </p>
                    </div>

                    <Link to="/member/studio" className="bg-slate-900 text-white px-6 py-2 rounded-full hover:bg-slate-800 transition-colors">
                        Return to Studio
                    </Link>
                </div>
            </div>
        );
    }

    const navItems = [
        { path: "/admin", label: "Dashboard", icon: "📊" },
        { path: "/admin/users", label: "Users", icon: "👥" },
    ];

    return (
        <div className="min-h-screen bg-slate-100">
            {/* Admin Header */}
            <header className="bg-slate-900 text-white px-6 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link to="/admin" className="text-xl font-bold">
                            🔐 Situ Admin
                        </Link>
                        <span className="text-xs bg-red-500 px-2 py-1 rounded-full uppercase font-medium">
                            Admin Only
                        </span>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-slate-400">{user.email}</span>
                        <Link to="/member/studio" className="text-sm text-slate-400 hover:text-white">
                            ← Back to App
                        </Link>
                    </div>
                </div>
            </header>

            <div className="flex">
                {/* Sidebar */}
                <aside className="w-56 bg-white h-[calc(100vh-64px)] border-r border-slate-200 p-4">
                    <nav className="space-y-1">
                        {navItems.map((item) => (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${location.pathname === item.path
                                    ? "bg-slate-900 text-white"
                                    : "text-slate-600 hover:bg-slate-100"
                                    }`}
                            >
                                <span>{item.icon}</span>
                                {item.label}
                            </Link>
                        ))}
                    </nav>
                </aside>

                {/* Main Content */}
                <main className="flex-1 p-6">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
