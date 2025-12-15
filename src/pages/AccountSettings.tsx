import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { updateProfile, updatePassword, updateEmail } from "firebase/auth";
import { db } from "../lib/firebase";
import { startTopUpCheckout } from "../lib/billing";
import { doc, updateDoc, onSnapshot } from "firebase/firestore";
import { Button } from "../components/ui/button";
import { useSearchParams } from "react-router-dom";

export function AccountSettings() {
    const { user } = useAuth();
    const [searchParams] = useSearchParams();
    const [displayName, setDisplayName] = useState("");
    const [email, setEmail] = useState("");
    const [plan, setPlan] = useState("Free");
    const [credits, setCredits] = useState(0);
    const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
    const [creditsResetAt, setCreditsResetAt] = useState<Date | null>(null);
    const [loading, setLoading] = useState(false);
    const [canceling, setCanceling] = useState(false);
    const [topUpLoading, setTopUpLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Password State
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const computeCredits = (data: any) => {
        const monthly = typeof data?.monthlyCreditsRemaining === "number" ? data.monthlyCreditsRemaining : 0;
        const bonus = typeof data?.bonusCredits === "number" ? data.bonusCredits : 0;
        const legacy = typeof data?.credits === "number" ? data.credits : 0;
        const total = monthly + bonus;
        return total || legacy;
    };

    useEffect(() => {
        if (user) {
            setDisplayName(user.displayName || "");
            setEmail(user.email || "");

            // Subscribe to user profile for real-time updates
            const unsubscribe = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                const planName = data.plan === "monthly" ? "Monthly Subscription" :
                    data.plan === "quarterly" ? "Quarterly Subscription" :
                        data.plan === "sixMonths" ? "Biannual Subscription" : "Free Plan";
                setPlan(planName);
                setCredits(computeCredits(data));
                setSubscriptionStatus(data.subscriptionStatus || null);
                setCreditsResetAt(data.creditsResetAt?.toDate?.() || null);
            }
        });

            return () => unsubscribe();
        }
    }, [user]);

    // Check for top-up success message
    useEffect(() => {
        if (searchParams.get("topup") === "success") {
            setMessage({ type: "success", text: "Credits added successfully! Your balance has been updated." });
        }
    }, [searchParams]);

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setLoading(true);
        setMessage(null);

        try {
            await updateProfile(user, { displayName });
            // Ideally optimize to only update if changed
            if (email !== user.email) {
                await updateEmail(user, email);
            }

            // Sync with Firestore
            await updateDoc(doc(db, "users", user.uid), {
                displayName,
                email
            });

            setMessage({ type: 'success', text: "Profile updated successfully." });
        } catch (error: any) {
            console.error("Profile update error:", error);
            setMessage({ type: 'error', text: error.message || "Failed to update profile. You may need to re-login." });
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        if (newPassword !== confirmPassword) {
            setMessage({ type: 'error', text: "Passwords do not match." });
            return;
        }
        if (newPassword.length < 6) {
            setMessage({ type: 'error', text: "Password must be at least 6 characters." });
            return;
        }

        setLoading(true);
        setMessage(null);
        try {
            await updatePassword(user, newPassword);
            setMessage({ type: 'success', text: "Password changed successfully." });
            setNewPassword("");
            setConfirmPassword("");
        } catch (error: any) {
            console.error("Password update error:", error);
            setMessage({ type: 'error', text: error.message || "Failed to update password. Re-login required for security." });
        } finally {
            setLoading(false);
        }
    };

    const handleCancelSubscription = async () => {
        if (!user) return;

        const confirmed = window.confirm(
            "Are you sure you want to cancel your subscription? You'll keep access until the end of your current billing period."
        );

        if (!confirmed) return;

        setCanceling(true);
        setMessage(null);

        try {
            const token = await user.getIdToken();
            const apiUrl = import.meta.env.PROD
                ? "/api/cancelSubscription"
                : `${import.meta.env.VITE_API_BASE_URL}/cancelSubscription`;

            const response = await fetch(apiUrl, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to cancel subscription");
            }

            setMessage({
                type: "success",
                text: "Subscription canceled. You'll keep access until the end of your billing period."
            });
        } catch (error: any) {
            console.error("Cancel subscription error:", error);
            setMessage({ type: "error", text: error.message });
        } finally {
            setCanceling(false);
        }
    };

    const handleTopUp = async () => {
        if (!user) return;

        setTopUpLoading(true);
        setMessage(null);

        try {
            await startTopUpCheckout(user);
        } catch (error: any) {
            console.error("Top-up error:", error);
            setMessage({ type: "error", text: error.message || "Failed to start checkout" });
        } finally {
            setTopUpLoading(false);
        }
    };

    const isSubscribed = plan !== "Free Plan" && subscriptionStatus && subscriptionStatus !== "canceled";

    return (
        <div className="container mx-auto px-4 py-12 max-w-2xl">
            <h1 className="text-3xl font-bold font-serif text-brand-brown mb-8">Account Settings</h1>

            {message && (
                <div className={`p-4 rounded-lg mb-6 ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {message.text}
                </div>
            )}

            {/* Credits & Subscription Section */}
            <div className="bg-white/50 backdrop-blur-sm p-8 rounded-3xl border border-brand-brown/10 mb-8">
                <h2 className="text-xl font-bold text-brand-brown mb-4">Credits & Subscription</h2>

                <div className="space-y-4">
                    {/* Credits Display */}
                    <div className="flex items-center justify-between p-4 bg-brand-sand/30 rounded-lg">
                        <div>
                            <div className="text-sm text-brand-brown/70">Available Credits</div>
                            <div className="text-3xl font-bold text-brand-brown">{credits}</div>
                        </div>
                        <Button onClick={handleTopUp} disabled={topUpLoading}>
                            {topUpLoading ? "Loading..." : "Buy 50 Credits - $12"}
                        </Button>
                    </div>

                    {/* Plan & Status */}
                    <div className="flex items-center justify-between p-4 bg-brand-sand/20 rounded-lg">
                        <div>
                            <div className="text-sm text-brand-brown/70">Current Plan</div>
                            <div className="font-medium text-brand-brown">{plan}</div>
                            {subscriptionStatus === "canceling" && (
                                <div className="text-xs text-amber-600 mt-1">
                                    Cancels at end of period
                                </div>
                            )}
                            {creditsResetAt && isSubscribed && (
                                <div className="text-xs text-brand-brown/50 mt-1">
                                    Credits reset: {creditsResetAt.toLocaleDateString()}
                                </div>
                            )}
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            {plan === "Free Plan" ? (
                                <Button
                                    variant="default"
                                    onClick={() => window.location.href = "/pricing?from=account"}
                                >
                                    Upgrade
                                </Button>
                            ) : (
                                <>
                                    {subscriptionStatus !== "canceling" && subscriptionStatus !== "canceled" && (
                                        <Button
                                            variant="outline"
                                            onClick={handleCancelSubscription}
                                            disabled={canceling}
                                            className="text-red-600 border-red-200 hover:bg-red-50"
                                        >
                                            {canceling ? "Canceling..." : "Cancel Subscription"}
                                        </Button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white/50 backdrop-blur-sm p-8 rounded-3xl border border-brand-brown/10 mb-8">
                <h2 className="text-xl font-bold text-brand-brown mb-4">Profile Information</h2>
                <form onSubmit={handleUpdateProfile} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-brand-brown/70 mb-1">Display Name</label>
                        <input
                            type="text"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            className="w-full px-4 py-2 rounded-lg border border-brand-brown/20 focus:outline-none focus:ring-2 focus:ring-brand-brown bg-white"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-brand-brown/70 mb-1">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-4 py-2 rounded-lg border border-brand-brown/20 focus:outline-none focus:ring-2 focus:ring-brand-brown bg-white"
                        />
                    </div>
                    <Button type="submit" disabled={loading}>
                        {loading ? "Saving..." : "Save Changes"}
                    </Button>
                </form>
            </div>

            <div className="bg-white/50 backdrop-blur-sm p-8 rounded-3xl border border-brand-brown/10">
                <h2 className="text-xl font-bold text-brand-brown mb-4">Change Password</h2>
                <form onSubmit={handlePasswordChange} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-brand-brown/70 mb-1">New Password</label>
                        <input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full px-4 py-2 rounded-lg border border-brand-brown/20 focus:outline-none focus:ring-2 focus:ring-brand-brown bg-white"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-brand-brown/70 mb-1">Confirm New Password</label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full px-4 py-2 rounded-lg border border-brand-brown/20 focus:outline-none focus:ring-2 focus:ring-brand-brown bg-white"
                        />
                    </div>
                    <Button type="submit" variant="secondary" disabled={loading || !newPassword}>
                        {loading ? "Updating..." : "Update Password"}
                    </Button>
                </form>
            </div>

            {/* Danger Zone */}
            <div className="bg-red-50 p-8 rounded-3xl border border-red-200">
                <h2 className="text-xl font-bold text-red-700 mb-2">⚠️ Danger Zone</h2>
                <p className="text-sm text-red-600 mb-4">
                    Deleting your account is permanent and cannot be undone. All your data will be lost.
                </p>
                <Button
                    variant="destructive"
                    onClick={async () => {
                        if (!user) return;
                        const confirmed = window.confirm(
                            "Are you sure you want to delete your account? This cannot be undone."
                        );
                        if (!confirmed) return;

                        try {
                            await user.delete();
                            window.location.href = "/";
                        } catch (error: any) {
                            console.error("Delete error:", error);
                            alert("Failed to delete account. You may need to log out and log in again.");
                        }
                    }}
                    className="bg-red-600 hover:bg-red-700"
                >
                    Delete Account
                </Button>
            </div>
        </div>
    );
}
