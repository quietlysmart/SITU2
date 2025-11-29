import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

export function Home() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const handleGetStarted = () => {
        if (!user) {
            navigate("/signup");
        } else {
            // User is logged in, could redirect to checkout or studio
            navigate("/studio");
        }
    };

    return (
        <div className="flex flex-col">
            {/* Hero Section */}
            <section className="relative py-20 md:py-32 overflow-hidden bg-slate-900">
                {/* Background Image with Overlay */}
                <div className="absolute inset-0 z-0">
                    <img
                        src="/hero.jpg"
                        alt="Situ Art Mockups"
                        className="w-full h-full object-cover opacity-40"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent" />
                </div>

                <div className="container mx-auto px-4 text-center relative z-10">
                    <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-white mb-6 drop-shadow-lg">
                        See your art in the real world.
                    </h1>
                    <p className="text-lg md:text-xl text-slate-200 mb-10 max-w-2xl mx-auto drop-shadow-md">
                        Upload your artwork and instantly generate realistic mockups on walls, prints, apparel, and more. No complex software required.
                    </p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <Link to="/studio">
                            <Button size="lg" className="w-full sm:w-auto text-base px-8 bg-white text-slate-900 hover:bg-slate-100">
                                Start with your artwork
                            </Button>
                        </Link>
                    </div>
                </div>
            </section>

            {/* How it works */}
            <section className="py-20 bg-white">
                <div className="container mx-auto px-4">
                    <h2 className="text-3xl font-bold text-center text-slate-900 mb-16">How it works</h2>
                    <div className="grid md:grid-cols-3 gap-12">
                        <div className="text-center space-y-4">
                            <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto text-xl font-bold">1</div>
                            <h3 className="text-xl font-semibold text-slate-900">Upload your art</h3>
                            <p className="text-slate-600">Drag and drop your high-res artwork file. We handle the rest.</p>
                        </div>
                        <div className="text-center space-y-4">
                            <div className="w-16 h-16 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mx-auto text-xl font-bold">2</div>
                            <h3 className="text-xl font-semibold text-slate-900">AI Generation</h3>
                            <p className="text-slate-600">Our AI places your art on realistic products with perfect lighting and perspective.</p>
                        </div>
                        <div className="text-center space-y-4">
                            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto text-xl font-bold">3</div>
                            <h3 className="text-xl font-semibold text-slate-900">Download & Share</h3>
                            <p className="text-slate-600">Get high-quality mockups ready for your shop or social media.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* What Situ can do */}
            <section className="py-20 bg-slate-50">
                <div className="container mx-auto px-4">
                    <h2 className="text-3xl font-bold text-center text-slate-900 mb-16">What Situ can do</h2>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
                        {[
                            { title: "Wall Display", desc: "Gallery-quality frames in modern interiors.", img: "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=400&q=80" },
                            { title: "Print Collections", desc: "Art prints, postcards, and stationery sets.", img: "https://images.unsplash.com/photo-1612198188060-c7c2a3b66eae?auto=format&fit=crop&w=400&q=80" },
                            { title: "Apparel", desc: "T-shirts, hoodies, and tote bags.", img: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=400&q=80" },
                            { title: "Phone Cases", desc: "Custom cases for iPhone and Android.", img: "https://images.unsplash.com/photo-1586105251261-72a756497a11?auto=format&fit=crop&w=400&q=80" }
                        ].map((item) => (
                            <div key={item.title} className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition-shadow">
                                <div className="aspect-square bg-slate-200 relative">
                                    <img src={item.img} alt={item.title} className="w-full h-full object-cover" />
                                </div>
                                <div className="p-6">
                                    <h3 className="font-semibold text-slate-900 mb-2">{item.title}</h3>
                                    <p className="text-sm text-slate-600">{item.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Pricing Section */}
            <section className="py-20 bg-white">
                <div className="container mx-auto px-4">
                    <div className="text-center max-w-2xl mx-auto mb-16">
                        <h2 className="text-3xl font-bold text-slate-900 mb-4">Simple, transparent pricing</h2>
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
                                onClick={() => handleGetStarted()}
                            >
                                Start Monthly
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
                                onClick={() => handleGetStarted()}
                            >
                                Start Quarterly
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
                                onClick={() => handleGetStarted()}
                            >
                                Start Biannual
                            </Button>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className="py-20 bg-slate-900 text-white">
                <div className="container mx-auto px-4 text-center">
                    <h2 className="text-3xl md:text-4xl font-bold mb-6">Ready to see your art in the world?</h2>
                    <Link to="/studio">
                        <Button size="lg" variant="secondary" className="px-8 text-base">
                            Start with your artwork
                        </Button>
                    </Link>
                </div>
            </section>
        </div>
    );
}
