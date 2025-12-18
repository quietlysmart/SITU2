import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";

interface UserDetail {
    uid: string;
    email: string;
    displayName: string;
    plan: string;
    credits: number;
    monthlyCreditsRemaining?: number;
    bonusCredits?: number;
    emailVerified?: boolean;
    provider?: string | null;
    authCreatedAt?: string | null;
    lastLogin?: string | null;
    authUserExists?: boolean;
    authError?: string | null;
    profileExists?: boolean;
    createdAt: string | null;
    stripeCustomerId: string | null;
    subscriptionStatus: string | null;
    artworkCount: number;
    mockupCount: number;
    recentMockups: Array<{
        id: string;
        url: string;
        category: string;
        createdAt: string | null;
    }>;
}

export function AdminUserDetail() {
    const { user } = useAuth();
    const { uid } = useParams<{ uid: string }>();
    const navigate = useNavigate();
    const [userData, setUserData] = useState<UserDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [deleted, setDeleted] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Credit adjustment form
    const [creditDelta, setCreditDelta] = useState(0);
    const [creditReason, setCreditReason] = useState("");
    const [adjusting, setAdjusting] = useState(false);
    const [adjustmentMessage, setAdjustmentMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [adminActionMessage, setAdminActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [actionLoading, setActionLoading] = useState<"" | "rebuild" | "delete">("");

    useEffect(() => {
        if (uid && !deleted) fetchUserDetail();
    }, [user, uid, deleted]);

    const fetchUserDetail = async () => {
        if (!user || !uid || deleted) return;
        setLoading(true);
        setError(null);
        setAdminActionMessage(null);

        try {
            const token = await user.getIdToken();
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/admin/users/${uid}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to fetch user");
            }

            const data = await response.json();
            setUserData(data.user);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCreditAdjustment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !uid || creditDelta === 0) return;

        setAdjusting(true);
        setAdjustmentMessage(null);

        try {
            const token = await user.getIdToken();
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/admin/users/${uid}/credits`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ delta: creditDelta, reason: creditReason })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to adjust credits");
            }

            setAdjustmentMessage({
                type: "success",
                text: `Credits updated: ${data.previousCredits} → ${data.newCredits}`
            });
            setCreditDelta(0);
            setCreditReason("");
            // Refresh user data
            fetchUserDetail();
        } catch (err: any) {
            setAdjustmentMessage({ type: "error", text: err.message });
        } finally {
            setAdjusting(false);
        }
    };

    const handleRebuildProfile = async () => {
        if (!user || !uid) return;
        setActionLoading("rebuild");
        setAdminActionMessage(null);
        try {
            const token = await user.getIdToken();
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/admin/users/${uid}/rebuildProfile`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Failed to rebuild profile");
            }
            setAdminActionMessage({ type: "success", text: "Profile rebuilt successfully." });
            fetchUserDetail();
        } catch (err: any) {
            setAdminActionMessage({ type: "error", text: err.message });
        } finally {
            setActionLoading("");
        }
    };

    const handleHardDelete = async () => {
        if (!user || !uid) return;
        const confirmed = window.confirm("This will permanently delete the user, their data, and their auth account. Continue?");
        if (!confirmed) return;

        setActionLoading("delete");
        setAdminActionMessage(null);
        try {
            const token = await user.getIdToken();
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/admin/users/${uid}/hardDelete`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            });

            if (response.status === 502 || response.status === 504) {
                console.warn("Gateway timeout (502/504) during deletion. Proceeding assuming success...");
                alert("Deletion is being processed in the background. Returning to users list.");
                setDeleted(true);
                setTimeout(() => navigate("/admin/users"), 1000);
                return;
            }

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Failed to hard delete user");
            }
            if (data.summary?.errors?.length > 0) {
                const critical = data.summary.errors.find((e: string) => e.includes("ABORTING"));
                if (critical) {
                    throw new Error(`Deletion Blocked: ${critical}`);
                }
            }
            alert("User successfully deleted. All data and Auth records removed if present.");
            setDeleted(true);
            setTimeout(() => {
                navigate("/admin/users");
            }, 1000);
        } catch (err: any) {
            console.error("Hard delete error:", err);
            setAdminActionMessage({ type: "error", text: err.message });
        } finally {
            setActionLoading("");
        }
    };

    if (deleted) {
        return (
            <div className="container mx-auto px-4 py-12 text-center">
                <div className="max-w-md mx-auto p-8 bg-green-50 border border-green-100 rounded-3xl">
                    <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-green-800 mb-2">User Deleted</h2>
                    <p className="text-green-700 mb-6">The user has been successfully removed. Redirecting you to the list...</p>
                    <Button onClick={() => navigate("/admin/users")}>Go Now</Button>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-slate-600">Loading user...</div>
            </div>
        );
    }

    if (error && !deleted) {
        return (
            <div className="bg-red-50 text-red-600 p-4 rounded-lg">
                Error: {error}
            </div>
        );
    }

    if (!userData && !deleted) {
        return <div className="text-slate-500">User not found.</div>;
    }

    if (!userData) return null; // Satisfy TS null check

    return (
        <div>
            <div className="mb-6">
                <Link to="/admin/users" className="text-sm text-slate-500 hover:text-slate-700">
                    ← Back to Users
                </Link>
            </div>

            <h1 className="text-2xl font-bold text-slate-900 mb-6">
                {userData.displayName || "Unnamed User"}
            </h1>

            {adminActionMessage && (
                <div className={`mb-4 p-3 rounded-lg text-sm ${adminActionMessage.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                    {adminActionMessage.text}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Basic Info */}
                <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
                    <h2 className="text-lg font-semibold text-slate-900 mb-4">Basic Info</h2>
                    <dl className="space-y-3">
                        <div className="flex justify-between">
                            <dt className="text-sm text-slate-500">UID</dt>
                            <dd className="text-sm font-medium text-slate-900 font-mono">{userData.uid}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-sm text-slate-500">Email</dt>
                            <dd className="text-sm font-medium text-slate-900">{userData.email}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-sm text-slate-500">Email Verified</dt>
                            <dd className="text-sm font-medium text-slate-900">{userData.emailVerified ? "Yes" : "No"}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-sm text-slate-500">Provider</dt>
                            <dd className="text-sm font-medium text-slate-900">{userData.provider || "—"}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-sm text-slate-500">Plan</dt>
                            <dd>
                                <span className={`text-xs px-2 py-1 rounded-full font-medium ${userData.plan === "free"
                                    ? "bg-slate-100 text-slate-600"
                                    : "bg-green-100 text-green-700"
                                    }`}>
                                    {userData.plan}
                                </span>
                            </dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-sm text-slate-500">Auth created</dt>
                            <dd className="text-sm text-slate-900">{userData.authCreatedAt ? new Date(userData.authCreatedAt).toLocaleString() : "—"}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-sm text-slate-500">Last login</dt>
                            <dd className="text-sm text-slate-900">{userData.lastLogin ? new Date(userData.lastLogin).toLocaleString() : "—"}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-sm text-slate-500">Credits</dt>
                            <dd className="text-sm font-medium text-slate-900">{userData.credits}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-sm text-slate-500">Monthly Remaining</dt>
                            <dd className="text-sm font-medium text-slate-900">{userData.monthlyCreditsRemaining ?? 0}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-sm text-slate-500">Bonus Credits</dt>
                            <dd className="text-sm font-medium text-slate-900">{userData.bonusCredits ?? 0}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-sm text-slate-500">Created</dt>
                            <dd className="text-sm text-slate-600">
                                {userData.createdAt ? new Date(userData.createdAt).toLocaleDateString() : "-"}
                            </dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-sm text-slate-500">Stripe Customer</dt>
                            <dd className="text-sm text-slate-600 font-mono text-xs">
                                {userData.stripeCustomerId || "-"}
                            </dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-sm text-slate-500">Subscription</dt>
                            <dd className="text-sm text-slate-600">
                                {userData.subscriptionStatus || "None"}
                            </dd>
                        </div>
                        <div className="flex gap-2 flex-wrap pt-2">
                            <span className={`text-xs px-2 py-1 rounded-full font-semibold ${userData.authUserExists ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"}`}>
                                {userData.authUserExists ? "Auth user exists" : "Auth user missing"}
                            </span>
                            {userData.authError && (
                                <span className="text-xs text-red-600 italic block mt-1">
                                    Auth Error: {userData.authError}
                                </span>
                            )}
                            <span className={`text-xs px-2 py-1 rounded-full font-semibold ${userData.profileExists ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"}`}>
                                {userData.profileExists ? "Profile exists" : "Profile missing"}
                            </span>
                        </div>
                    </dl>
                </div>

                {/* Usage Summary */}
                <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
                    <h2 className="text-lg font-semibold text-slate-900 mb-4">Usage Summary</h2>
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="bg-slate-50 rounded-lg p-4">
                            <div className="text-2xl font-bold text-slate-900">{userData.artworkCount}</div>
                            <div className="text-sm text-slate-500">Artworks</div>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-4">
                            <div className="text-2xl font-bold text-slate-900">{userData.mockupCount}</div>
                            <div className="text-sm text-slate-500">Mockups</div>
                        </div>
                    </div>

                    <h3 className="text-sm font-medium text-slate-700 mb-3">Recent Mockups</h3>
                    {userData.recentMockups.length === 0 ? (
                        <p className="text-sm text-slate-500">No mockups yet.</p>
                    ) : (
                        <div className="grid grid-cols-5 gap-2">
                            {userData.recentMockups.map((mockup) => (
                                <a
                                    key={mockup.id}
                                    href={mockup.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="aspect-square rounded overflow-hidden border border-slate-200 hover:border-slate-400"
                                >
                                    <img
                                        src={mockup.url}
                                        alt={mockup.category}
                                        className="w-full h-full object-cover"
                                    />
                                </a>
                            ))}
                        </div>
                    )}
                </div>

                {/* Admin Actions */}
                <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
                    <h2 className="text-lg font-semibold text-slate-900 mb-4">Admin Actions</h2>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <button
                            onClick={handleRebuildProfile}
                            disabled={actionLoading === "rebuild"}
                            className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
                        >
                            {actionLoading === "rebuild" ? "Rebuilding..." : "Rebuild Profile"}
                        </button>
                        <button
                            onClick={handleHardDelete}
                            disabled={actionLoading === "delete"}
                            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-500 disabled:opacity-50"
                        >
                            {actionLoading === "delete" ? "Deleting..." : "Hard Delete User"}
                        </button>
                    </div>
                </div>

                {/* Credit Adjustment */}
                <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 lg:col-span-2">
                    <h2 className="text-lg font-semibold text-slate-900 mb-4">Adjust Credits</h2>

                    {adjustmentMessage && (
                        <div className={`p-3 rounded-lg mb-4 text-sm ${adjustmentMessage.type === "success"
                            ? "bg-green-50 text-green-700"
                            : "bg-red-50 text-red-700"
                            }`}>
                            {adjustmentMessage.text}
                        </div>
                    )}

                    <form onSubmit={handleCreditAdjustment} className="flex gap-4 items-end">
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Credit Change
                            </label>
                            <input
                                type="number"
                                value={creditDelta}
                                onChange={(e) => setCreditDelta(parseInt(e.target.value) || 0)}
                                placeholder="+10 or -5"
                                className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                            />
                        </div>
                        <div className="flex-[2]">
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Reason (required)
                            </label>
                            <input
                                type="text"
                                value={creditReason}
                                onChange={(e) => setCreditReason(e.target.value)}
                                placeholder="e.g., Tester bonus, Bug compensation"
                                className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={adjusting || creditDelta === 0 || !creditReason}
                            className="px-6 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
                        >
                            {adjusting ? "Applying..." : "Apply"}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
