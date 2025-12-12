import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";

interface Stats {
    totalUsers: number;
    newUsersLast7Days: number;
    totalMockups: number;
    mockupsLast7Days: number;
    totalCreditsGranted: number;
}

export function AdminDashboard() {
    const { user } = useAuth();
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        fetchStats();
    }, [user]);

    const fetchStats = async () => {
        if (!user) return;
        setLoading(true);
        setError(null);

        try {
            const token = await user.getIdToken();
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/admin/stats`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to fetch stats");
            }

            const data = await response.json();
            setStats(data.stats);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteAllUsers = async () => {
        if (!user) return;

        const confirmed = window.confirm(
            "⚠️ This will DELETE ALL non-admin users, their artworks, and mockups. This cannot be undone. Continue?"
        );

        if (!confirmed) return;

        setDeleting(true);
        try {
            const token = await user.getIdToken();
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/admin/users/all`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to delete users");
            }

            alert(`Deleted ${data.deletedCount} users successfully.`);
            fetchStats(); // Refresh stats
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        } finally {
            setDeleting(false);
        }
    };

    const StatCard = ({ title, value, subtitle }: { title: string; value: string | number; subtitle?: string }) => (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
            <div className="text-sm font-medium text-slate-500 mb-1">{title}</div>
            <div className="text-3xl font-bold text-slate-900">{value}</div>
            {subtitle && <div className="text-xs text-slate-400 mt-1">{subtitle}</div>}
        </div>
    );

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-slate-600">Loading stats...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 text-red-600 p-4 rounded-lg">
                Error: {error}
            </div>
        );
    }

    return (
        <div>
            <h1 className="text-2xl font-bold text-slate-900 mb-6">Dashboard</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <StatCard
                    title="Total Users"
                    value={stats?.totalUsers || 0}
                />
                <StatCard
                    title="New Users (7d)"
                    value={stats?.newUsersLast7Days || 0}
                    subtitle="Last 7 days"
                />
                <StatCard
                    title="Total Mockups"
                    value={stats?.totalMockups || 0}
                    subtitle="All time"
                />
                <StatCard
                    title="Mockups (7d)"
                    value={stats?.mockupsLast7Days || 0}
                    subtitle="Last 7 days"
                />
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 mb-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Quick Actions</h2>
                <div className="flex gap-4">
                    <a
                        href="/admin/users"
                        className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800"
                    >
                        View All Users
                    </a>
                    <button
                        onClick={fetchStats}
                        className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200"
                    >
                        Refresh Stats
                    </button>
                </div>
            </div>

            <div className="bg-red-50 rounded-xl p-6 border border-red-200">
                <h2 className="text-lg font-semibold text-red-700 mb-2">⚠️ Danger Zone</h2>
                <p className="text-sm text-red-600 mb-4">
                    These actions are irreversible. Use with caution.
                </p>
                <button
                    onClick={handleDeleteAllUsers}
                    disabled={deleting}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                >
                    {deleting ? "Deleting..." : "Delete All Non-Admin Users"}
                </button>
            </div>
        </div>
    );
}
