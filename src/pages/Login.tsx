import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "../components/ui/button";

export function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            await signInWithEmailAndPassword(auth, email, password);
            navigate("/member/studio");
        } catch (err: any) {
            console.error("Login error:", err);
            setError("Invalid email or password");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container mx-auto px-4 py-12 max-w-md">
            <h1 className="text-3xl font-bold mb-6 text-center">Welcome back</h1>
            <form onSubmit={handleLogin} className="space-y-4">
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
                        className="w-full px-4 py-3 border border-brand-brown/20 rounded-full focus:outline-none focus:ring-2 focus:ring-brand-brown bg-white/50"
                    />
                </div>
                {error && <p className="text-red-500 text-sm">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Logging in..." : "Log In"}
                </Button>
            </form>
            <p className="mt-4 text-center text-sm text-brand-brown/70">
                Don't have an account? <Link to="/signup" className="text-brand-brown font-bold hover:underline">Sign up</Link>
            </p>
        </div>
    );
}
