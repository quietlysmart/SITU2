import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { updateProfile, updatePassword, updateEmail } from "firebase/auth";
import { db } from "../lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { Button } from "../components/ui/button";

export function AccountSettings() {
    const { user } = useAuth();
    const [displayName, setDisplayName] = useState("");
    const [email, setEmail] = useState("");
    const [plan, setPlan] = useState("Free");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Password State
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    useEffect(() => {
        if (user) {
            setDisplayName(user.displayName || "");
            setEmail(user.email || "");
            loadUserProfile();
        }
    }, [user]);

    const loadUserProfile = async () => {
        if (!user) return;
        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                const data = userDoc.data();
                const planName = data.plan === "monthly" ? "Monthly Subscription" :
                    data.plan === "quarterly" ? "Quarterly Subscription" :
                        data.plan === "sixMonths" ? "Biannual Subscription" : "Free Plan";
                setPlan(planName);
            }
        } catch (error) {
            console.error("Error loading profile:", error);
        }
    };

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

    return (
        <div className="container mx-auto px-4 py-12 max-w-2xl">
            <h1 className="text-3xl font-bold font-serif text-brand-brown mb-8">Account Settings</h1>

            {message && (
                <div className={`p-4 rounded-lg mb-6 ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {message.text}
                </div>
            )}

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
                    <div>
                        <label className="block text-sm font-medium text-brand-brown/70 mb-1">Current Plan</label>
                        <div className="flex items-center justify-between bg-brand-sand/30 p-2 rounded-lg">
                            <div className="text-brand-brown font-medium px-2">
                                {plan}
                            </div>
                            {plan === "Free Plan" && (
                                <Button
                                    type="button"
                                    variant="default"
                                    size="sm"
                                    onClick={() => window.location.href = "/pricing?from=account"}
                                >
                                    Upgrade
                                </Button>
                            )}
                        </div>
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
        </div>
    );
}
