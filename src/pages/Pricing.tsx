import { useState } from "react";
import { Button } from "../components/ui/button";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

export function Pricing() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // TODO: Before production, ensure APP_BASE_URL, STRIPE_SUCCESS_URL, and STRIPE_CANCEL_URL are updated in .env

    const handleSubscribe = async (plan: "monthly" | "quarterly" | "sixMonths") => {
        if (!user) {
            // Store pending plan so we can resume after signup
            localStorage.setItem("situ_pending_plan", plan);
            navigate("/signup");
            return;
        }

        setLoading(plan);
        setError(null);
        try {
            const token = await user.getIdToken();
            const apiUrl = import.meta.env.PROD
                ? "/api/createCheckoutSession"
                : `${import.meta.env.VITE_API_BASE_URL}/createCheckoutSession`;

            const response = await fetch(apiUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`,
                },
                body: JSON.stringify({
                    plan,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                console.error("Network response was not ok", data);
                setError(data.error || "Failed to start checkout");
                setLoading(null); // Clear loading on error
                return;
            }

            if (data.url) {
                window.location.href = data.url;
            } else {
                console.error("No checkout URL returned:", data);
                setError("No checkout URL returned from server");
                setLoading(null);
            }
        } catch (error) {
            console.error("Checkout error:", error);
            setError("An unexpected error occurred");
            setLoading(null);
        }
    };

    return (
        <div className="py-24 bg-brand-cream">
            <div className="container mx-auto px-4">
                <div className="text-center max-w-2xl mx-auto mb-16">
                    <h1 className="text-4xl md:text-5xl font-bold text-brand-brown mb-6 font-serif">Simple, transparent pricing</h1>
                    <p className="text-xl text-brand-brown/70">Choose the plan that fits your creative workflow.</p>
                    <div className="mt-8 inline-block bg-brand-sand text-brand-brown px-6 py-2 rounded-full text-sm font-medium">
                        Early testing: 10 images free for new members
                    </div>
                    {error && (
                        <div className="mt-4 text-red-500 font-medium bg-red-50 p-2 rounded max-w-md mx-auto">
                            {error}
                        </div>
                    )}
                </div>

                <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                    {/* Monthly */}
                    <div className="border border-brand-brown/10 rounded-3xl p-8 flex flex-col bg-white/50 backdrop-blur-sm">
                        <div className="mb-4">
                            <h3 className="text-xl font-bold text-brand-brown font-serif">Monthly</h3>
                            <div className="mt-2 flex items-baseline text-brand-brown">
                                <span className="text-4xl font-bold tracking-tight">$15</span>
                                <span className="ml-1 text-brand-brown/70">/month</span>
                            </div>
                        </div>
                        <p className="text-brand-brown/70 mb-4">Perfect for regular projects.</p>
                        <p className="text-sm font-semibold text-brand-brown mb-8">200 mockups per month</p>
                        <Button
                            variant="outline"
                            className="w-full mt-auto"
                            onClick={() => handleSubscribe("monthly")}
                            disabled={loading !== null}
                        >
                            {loading === "monthly" ? "Redirecting to Stripe..." : "Start Monthly"}
                        </Button>
                    </div>

                    {/* 3 Months */}
                    <div className="border border-brand-brown rounded-3xl p-8 flex flex-col relative bg-white shadow-xl shadow-brand-brown/5 transform md:-translate-y-4">
                        <div className="absolute top-0 right-0 -mt-3 -mr-3 bg-brand-brown text-brand-cream text-xs font-bold px-3 py-1 rounded-full">
                            POPULAR
                        </div>
                        <div className="mb-4">
                            <h3 className="text-xl font-bold text-brand-brown font-serif">Quarterly</h3>
                            <div className="mt-2 flex items-baseline text-brand-brown">
                                <span className="text-4xl font-bold tracking-tight">$36</span>
                                <span className="ml-1 text-brand-brown/70">/3 months</span>
                            </div>
                            <p className="text-sm text-brand-brown/60 mt-1">Equivalent to $12/month</p>
                        </div>
                        <p className="text-brand-brown/80 mb-4">Great value for active artists.</p>
                        <p className="text-sm font-semibold text-brand-brown mb-8">600 mockups per quarter</p>
                        <Button
                            className="w-full mt-auto"
                            onClick={() => handleSubscribe("quarterly")}
                            disabled={loading !== null}
                        >
                            {loading === "quarterly" ? "Redirecting to Stripe..." : "Start Quarterly"}
                        </Button>
                    </div>

                    {/* Top Up */}
                    <div className="border border-brand-brown/10 rounded-3xl p-8 flex flex-col bg-white/50 backdrop-blur-sm">
                        <div className="mb-4">
                            <h3 className="text-xl font-bold text-brand-brown font-serif">Top Up</h3>
                            <div className="mt-2 flex items-baseline text-brand-brown">
                                <span className="text-4xl font-bold tracking-tight">$5</span>
                                <span className="ml-1 text-brand-brown/70">/pack</span>
                            </div>
                            <p className="text-sm text-brand-brown/60 mt-1">One-time purchase</p>
                        </div>
                        <p className="text-brand-brown/70 mb-4">Add credits anytime.</p>
                        <p className="text-sm font-semibold text-brand-brown mb-8">50 extra mockups</p>
                        <Button
                            variant="outline"
                            className="w-full mt-auto"
                            onClick={() => handleSubscribe("topup" as any)} // Cast safely as we know backend handles it, or update type
                            disabled={loading !== null}
                        >
                            {loading === "topup" ? "Redirecting to Stripe..." : "Buy Pack"}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
