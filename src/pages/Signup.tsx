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
                credits: 20, // Default to 20 credits for everyone
                ...(promo ? { promo } : {}),
            };

            console.log("Creating Firestore profile for:", user.uid);

            // Attempt to create profile with a timeout
            const createProfilePromise = setDoc(doc(db, "users", user.uid), profile);
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Profile creation timed out")), 5000));

            try {
                await Promise.race([createProfilePromise, timeoutPromise]);
                console.log("Profile created successfully");
            } catch (profileError) {
                console.error("Profile creation failed or timed out:", profileError);
                // We continue anyway because the Auth account is created. 
                // The user can still use the app, and we can try to create the profile later or lazily.
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
