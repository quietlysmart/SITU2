import { useState } from "react";
import { Button } from "../components/ui/button";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

export function Pricing() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState<string | null>(null);

    const handleSubscribe = async (priceId: string) => {
        if (!user) {
            navigate("/signup");
            return;
        }

        setLoading(priceId);
        try {
            const token = await user.getIdToken();
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/createCheckoutSession`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`,
                },
                body: JSON.stringify({
                    priceId,
                    successUrl: `${window.location.origin}/member/studio?session_id={CHECKOUT_SESSION_ID}`,
                    cancelUrl: window.location.href,
                }),
            });

            const { sessionId } = await response.json();
            const stripe = await stripePromise;
            if (stripe) {
                await stripe.redirectToCheckout({ sessionId });
            }
        } catch (error) {
            console.error("Checkout error:", error);
        } finally {
            setLoading(null);
        }
    };

    // These should come from env but for now we'll use placeholders or assume they are set
    // In a real app, we'd read these from import.meta.env
    const PRICES = {
        monthly: "price_monthly_placeholder",
        threeMonth: "price_3month_placeholder",
        sixMonth: "price_6month_placeholder",
    };

    return (
        <div className="py-20 bg-white">
            <div className="container mx-auto px-4">
                <div className="text-center max-w-2xl mx-auto mb-16">
                    <h1 className="text-4xl font-bold text-slate-900 mb-4">Simple, transparent pricing</h1>
                    <p className="text-lg text-slate-600">Choose the plan that fits your creative workflow.</p>
                    <div className="mt-6 inline-block bg-blue-50 text-blue-700 px-4 py-2 rounded-full text-sm font-medium">
                        Early testing: 20 images free for new members
                    </div>
                </div>

                <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                    {/* Monthly */}
                    <div className="border border-slate-200 rounded-2xl p-8 flex flex-col">
                        <div className="mb-4">
                            <h3 className="text-xl font-bold text-slate-900">Monthly</h3>
                            <div className="mt-2 flex items-baseline text-slate-900">
                                <span className="text-4xl font-bold tracking-tight">$12</span>
                                <span className="ml-1 text-slate-500">/month</span>
                            </div>
                        </div>
                        <p className="text-slate-600 mb-6">Perfect for occasional projects.</p>
                        <Button
                            className="w-full mt-auto"
                            onClick={() => handleSubscribe(PRICES.monthly)}
                            disabled={loading === PRICES.monthly}
                        >
                            {loading === PRICES.monthly ? "Loading..." : "Start Monthly"}
                        </Button>
                    </div>

                    {/* 3 Months */}
                    <div className="border-2 border-slate-900 rounded-2xl p-8 flex flex-col relative shadow-lg">
                        <div className="absolute top-0 right-0 -mt-3 -mr-3 bg-slate-900 text-white text-xs font-bold px-3 py-1 rounded-full">
                            POPULAR
                        </div>
                        <div className="mb-4">
                            <h3 className="text-xl font-bold text-slate-900">3 Months</h3>
                            <div className="mt-2 flex items-baseline text-slate-900">
                                <span className="text-4xl font-bold tracking-tight">$10</span>
                                <span className="ml-1 text-slate-500">/month</span>
                            </div>
                            <p className="text-sm text-slate-500 mt-1">Billed $30 every 3 months</p>
                        </div>
                        <p className="text-slate-600 mb-6">Great for active artists.</p>
                        <Button
                            className="w-full mt-auto"
                            onClick={() => handleSubscribe(PRICES.threeMonth)}
                            disabled={loading === PRICES.threeMonth}
                        >
                            {loading === PRICES.threeMonth ? "Loading..." : "Start Quarterly"}
                        </Button>
                    </div>

                    {/* 6 Months */}
                    <div className="border border-slate-200 rounded-2xl p-8 flex flex-col">
                        <div className="mb-4">
                            <h3 className="text-xl font-bold text-slate-900">6 Months</h3>
                            <div className="mt-2 flex items-baseline text-slate-900">
                                <span className="text-4xl font-bold tracking-tight">$7</span>
                                <span className="ml-1 text-slate-500">/month</span>
                            </div>
                            <p className="text-sm text-slate-500 mt-1">Billed $42 every 6 months</p>
                        </div>
                        <p className="text-slate-600 mb-6">Best value for long-term use.</p>
                        <Button
                            className="w-full mt-auto"
                            onClick={() => handleSubscribe(PRICES.sixMonth)}
                            disabled={loading === PRICES.sixMonth}
                        >
                            {loading === PRICES.sixMonth ? "Loading..." : "Start Biannual"}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
