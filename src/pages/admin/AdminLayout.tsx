import { Link, Outlet, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useEffect, useState } from "react";

// Admin email check (client-side for UI protection - backend is the true gatekeeper)
const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || "").split(",").map((e: string) => e.trim().toLowerCase());

export function AdminLayout() {
    const { user, loading } = useAuth();
    const location = useLocation();
    const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

    useEffect(() => {
        if (user) {
            setIsAdmin(ADMIN_EMAILS.includes(user.email?.toLowerCase() || ""));
        } else if (!loading) {
            setIsAdmin(false);
        }
    }, [user, loading]);

    if (loading || isAdmin === null) {
        return (
            <div className="flex items-center justify-center h-screen bg-slate-100">
                <div className="text-slate-600">Loading...</div>
            </div>
        );
    }

    if (!user || !isAdmin) {
        return <Navigate to="/login" replace />;
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
