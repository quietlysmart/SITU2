import { useState } from "react";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth, db } from "../lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Button } from "../components/ui/button";

export function Signup() {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const promo = searchParams.get("promo");
    const guestSessionId = searchParams.get("guestSession");

    const waitForProfile = async (uid: string, timeoutMs = 10000) => {
        const profileRef = doc(db, "users", uid);
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const snap = await getDoc(profileRef);
            if (snap.exists()) return true;
            await new Promise(res => setTimeout(res, 500));
        }
        throw new Error("Profile not ready yet");
    };

    const ensureProfile = async (user: any) => {
        try {
            const token = await user.getIdToken(true);
            const apiUrl = import.meta.env.PROD ? "/api/user/ensureProfile" : `${import.meta.env.VITE_API_BASE_URL}/user/ensureProfile`;
            await fetch(apiUrl, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            });
        } catch (err) {
            console.warn("ensureProfile call failed", err);
        }
    };

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            const storageKeys = Object.keys(window.localStorage || {}).filter(k => k.toLowerCase().includes("firebase"));
            console.log("[Signup] created user", { uid: user.uid, storageKeys });

            // Update Auth Profile
            await updateProfile(user, { displayName: name });
            await ensureProfile(user);

            // Claim Guest Session if present
            if (guestSessionId) {
                try {
                    console.log("Claiming guest session:", guestSessionId);
                    const token = await user.getIdToken(true);
                    const claimRes = await fetch(`${import.meta.env.VITE_API_BASE_URL}/claimGuestSession`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${token}`
                        },
                        body: JSON.stringify({ sessionId: guestSessionId })
                    });

                    if (!claimRes.ok) {
                        console.error("Failed to claim guest session", await claimRes.json());
                        // Non-blocking error, user still gets account
                    } else {
                        console.log("Guest session claimed!");
                    }
                } catch (err) {
                    console.error("Error claiming guest session:", err);
                }
            }

            // Check for Pending Plan (from Pricing page)
            const pendingPlan = localStorage.getItem("situ_pending_plan");
            if (pendingPlan) {
                console.log("Found pending plan:", pendingPlan);
                // Clear it so it doesn't trigger again
                localStorage.removeItem("situ_pending_plan");

                // Start Checkout Flow
                try {
                    const token = await user.getIdToken();
                    const checkoutRes = await fetch(`${import.meta.env.VITE_API_BASE_URL}/createCheckoutSession`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${token}`,
                        },
                        body: JSON.stringify({ plan: pendingPlan }),
                    });

                    const checkoutData = await checkoutRes.json();
                    if (checkoutData.ok && checkoutData.url) {
                        console.log("Redirecting to Stripe for pending plan...");
                        window.location.href = checkoutData.url;
                        return; // Stop here, don't navigate to Member Studio
                    } else {
                        console.error("Failed to start pending plan checkout:", checkoutData);
                        // Fallback to Member Studio if Stripe fails
                    }
                } catch (checkoutErr) {
                    console.error("Error starting pending plan checkout:", checkoutErr);
                }
            }

            try {
                await waitForProfile(user.uid);
            } catch (profileErr) {
                console.warn("Profile not ready after signup yet:", profileErr);
            }

            navigate("/member/studio");
        } catch (err: any) {
            console.error("Signup error details:", err);
            // Check for specific Firestore errors
            if (err.code === 'permission-denied') {
                setError("Database permission denied. Please contact support.");
            } else if (err.code === 'unavailable') {
                setError("Database service unavailable. Please check your connection.");
            } else {
                setError(err.message || "Failed to create account. Please try again.");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container mx-auto px-4 py-12 max-w-md">
            <h1 className="text-3xl font-bold mb-6 text-center">Create an account</h1>
            {promo === "early-tester-20" && (
                <div className="bg-green-50 text-green-700 p-4 rounded-md mb-6 text-center text-sm">
                    🎉 You'll get 20 free credits!
                </div>
            )}
            {/* General banner if no specific promo, or maybe just update the promo text if generic */}
            {!promo && (
                <div className="bg-brand-sand/30 text-brand-brown p-4 rounded-md mb-6 text-center text-sm font-medium">
                    Create an account to get 12 free credits
                </div>
            )}
            <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                    <label htmlFor="name" className="block text-sm font-medium text-brand-brown/70">Name</label>
                    <input
                        id="name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        className="w-full px-4 py-3 border border-brand-brown/20 rounded-full focus:outline-none focus:ring-2 focus:ring-brand-brown bg-white/50"
                    />
                </div>
                <div className="space-y-2">
                    <label htmlFor="email" className="block text-sm font-medium text-brand-brown/70">Email</label>
                    <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="w-full px-4 py-3 border border-brand-brown/20 rounded-full focus:outline-none focus:ring-2 focus:ring-brand-brown bg-white/50"
                    />
                </div>
                <div className="space-y-2">
                    <label htmlFor="password" className="block text-sm font-medium text-brand-brown/70">Password</label>
                    <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        className="w-full px-4 py-3 border border-brand-brown/20 rounded-full focus:outline-none focus:ring-2 focus:ring-brand-brown bg-white/50"
                    />
                </div>
                {error && <p className="text-red-500 text-sm">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Creating account..." : "Sign Up"}
                </Button>
            </form>
            <p className="mt-4 text-center text-sm text-brand-brown/70">
                Already have an account? <Link to="/login" className="text-brand-brown font-bold hover:underline">Log in</Link>
            </p>
        </div>
    );
}
