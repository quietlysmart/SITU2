import { useState } from "react";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth, db } from "../lib/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import type { UserProfile } from "../types";

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

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Update Auth Profile
            await updateProfile(user, { displayName: name });

            // Create user profile in Firestore
            const profile: UserProfile = {
                email: user.email!,
                displayName: name,
                createdAt: serverTimestamp(),
                plan: "free",
                bonusCredits: 12, // Default to 12 bonus credits for everyone (updated from 20)
                monthlyCreditsRemaining: 0,
                credits: 12, // Derived total for compatibility
                ...(promo ? { promo } : {}),
            };

            console.log("Creating Firestore profile for:", user.uid);

            // Attempt to create profile with a timeout
            const createProfilePromise = setDoc(doc(db, "users", user.uid), profile);
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Profile creation timed out")), 5000));

            try {
                await Promise.race([createProfilePromise, timeoutPromise]);
                console.log("Profile created successfully");

                // Trigger Welcome Email (now handled by Backend Firestore Trigger on creation)
                // But if we wanted to be double sure or explicit, we rely on the trigger.

            } catch (profileError) {
                console.error("Profile creation failed or timed out:", profileError);
                // We continue anyway because the Auth account is created. 
            }

            // Claim Guest Session if present
            if (guestSessionId) {
                try {
                    console.log("Claiming guest session:", guestSessionId);
                    const token = await user.getIdToken();
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
