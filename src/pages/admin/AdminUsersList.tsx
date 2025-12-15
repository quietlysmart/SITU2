import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { Link } from "react-router-dom";

interface User {
    uid: string;
    email: string;
    displayName: string;
    plan: string;
    credits: number;
    monthlyCreditsRemaining?: number;
    bonusCredits?: number;
    artworkCount: number;
    mockupCount: number;
    createdAt: string | null;
}

export function AdminUsersList() {
    const { user } = useAuth();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState("");
    const [total, setTotal] = useState(0);
    const [offset, setOffset] = useState(0);
    const limit = 20;

    useEffect(() => {
        fetchUsers();
    }, [user, offset, filter]);

    const fetchUsers = async () => {
        if (!user) return;
        setLoading(true);
        setError(null);

        try {
            const token = await user.getIdToken();
            const params = new URLSearchParams({
                limit: limit.toString(),
                offset: offset.toString(),
                ...(search && { search }),
                ...(filter && { filter })
            });

            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/admin/users?${params}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to fetch users");
            }

            const data = await response.json();
            setUsers(data.users);
            setTotal(data.total);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setOffset(0);
        fetchUsers();
    };

    if (error) {
        return (
            <div className="bg-red-50 text-red-600 p-4 rounded-lg">
                Error: {error}
            </div>
        );
    }

    return (
        <div>
            <h1 className="text-2xl font-bold text-slate-900 mb-6">Users</h1>

            {/* Search and Filters */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 mb-6">
                <form onSubmit={handleSearch} className="flex gap-4">
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by email or name..."
                        className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                    <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                    >
                        <option value="">All Users</option>
                        <option value="zero_credits">Zero Credits</option>
                        <option value="subscribed">Subscribed</option>
                    </select>
                    <button
                        type="submit"
                        className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800"
                    >
                        Search
                    </button>
                </form>
            </div>

            {/* Users Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-slate-500">Loading users...</div>
                ) : users.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">No users found.</div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">User</th>
                                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Plan</th>
                                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Credits</th>
                                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Artworks</th>
                                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Mockups</th>
                                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Created</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((u) => (
                                <tr key={u.uid} className="border-b border-slate-100 hover:bg-slate-50">
                                    <td className="px-4 py-3">
                                        <Link to={`/admin/users/${u.uid}`} className="block">
                                            <div className="font-medium text-slate-900 hover:text-blue-600">
                                                {u.displayName || "No name"}
                                            </div>
                                            <div className="text-xs text-slate-500">{u.email}</div>
                                        </Link>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${u.plan === "free"
                                                ? "bg-slate-100 text-slate-600"
                                                : "bg-green-100 text-green-700"
                                            }`}>
                                            {u.plan}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-slate-600">{u.credits}</td>
                                    <td className="px-4 py-3 text-sm text-slate-600">{u.artworkCount}</td>
                                    <td className="px-4 py-3 text-sm text-slate-600">{u.mockupCount}</td>
                                    <td className="px-4 py-3 text-xs text-slate-500">
                                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "-"}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {/* Pagination */}
                {total > limit && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
                        <div className="text-sm text-slate-500">
                            Showing {offset + 1} - {Math.min(offset + limit, total)} of {total}
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setOffset(Math.max(0, offset - limit))}
                                disabled={offset === 0}
                                className="px-3 py-1 text-sm bg-white border border-slate-200 rounded hover:bg-slate-100 disabled:opacity-50"
                            >
                                Previous
                            </button>
                            <button
                                onClick={() => setOffset(offset + limit)}
                                disabled={offset + limit >= total}
                                className="px-3 py-1 text-sm bg-white border border-slate-200 rounded hover:bg-slate-100 disabled:opacity-50"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
