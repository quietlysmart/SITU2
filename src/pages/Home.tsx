import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

export function Home() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const handleGetStarted = () => {
        if (!user) {
            navigate("/guest");
        } else {
            navigate("/member/studio");
        }
    };

    return (
        <div className="flex flex-col">
            {/* Hero Section */}
            {/* Hero Section */}
            {/* Hero Section */}
            {/* Hero Section */}
            {/* Hero Section */}
            <section className="relative w-full max-w-7xl mx-auto mt-0 md:mt-6 px-0 md:px-4">
                <div className="relative w-full min-h-[550px] md:min-h-0 md:aspect-[21/9] lg:aspect-[2.4/1] md:rounded-3xl overflow-hidden shadow-2xl isolate bg-[#2A2A2A]">
                    {/* Background Image */}
                    <img
                        src="/images/hero-final.jpg"
                        alt="Situ Art Mockups"
                        className="absolute inset-0 w-full h-full object-cover -z-20 brightness-75"
                    />

                    {/* Overlay Gradient/Scrim - Stronger on mobile for text readability */}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/70 md:bg-black/30 md:bg-none -z-10"></div>

                    {/* Content */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 md:p-12">
                        <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-white mb-6 font-serif leading-tight animate-fade-in drop-shadow-lg px-2">
                            See your art in the world<br className="hidden md:block" /> in under a minute.
                        </h1>
                        <p className="text-base sm:text-lg md:text-xl text-white/90 mb-8 max-w-2xl mx-auto leading-relaxed animate-fade-in-delay-1 drop-shadow-md font-medium px-4">
                            Upload once, get 4 mockups instantly, and email them to yourself to keep.
                        </p>
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-delay-2 w-full px-4">
                            <Button
                                size="lg"
                                className="w-full sm:w-auto text-lg px-8 py-6 bg-brand-gold text-brand-brown hover:bg-white border-none shadow-xl hover:scale-105 transition-transform duration-200"
                                onClick={handleGetStarted}
                            >
                                Start with your artwork
                            </Button>
                        </div>
                    </div>
                </div>
            </section>

            {/* How it works */}
            {/* How it works */}
            <section className="py-24 bg-brand-cream border-t border-brand-brown/5">
                <div className="container mx-auto px-4">
                    <h2 className="text-3xl font-bold text-center text-brand-brown mb-16 font-serif">How it works</h2>
                    <div className="grid md:grid-cols-3 gap-12">
                        <div className="text-center space-y-4">
                            <div className="w-16 h-16 bg-brand-sand text-brand-brown rounded-full flex items-center justify-center mx-auto text-xl font-bold">1</div>
                            <h3 className="text-xl font-semibold text-brand-brown">Upload your art</h3>
                            <p className="text-brand-brown/70">Drag and drop a high-res JPG or PNG. Higher resolution looks best.</p>
                        </div>
                        <div className="text-center space-y-4">
                            <div className="w-16 h-16 bg-brand-sand text-brand-brown rounded-full flex items-center justify-center mx-auto text-xl font-bold">2</div>
                            <h3 className="text-xl font-semibold text-brand-brown">Create mockups</h3>
                            <p className="text-brand-brown/70">Situ automatically places your art into believable scenes with clean lighting.</p>
                        </div>
                        <div className="text-center space-y-4">
                            <div className="w-16 h-16 bg-brand-sand text-brand-brown rounded-full flex items-center justify-center mx-auto text-xl font-bold">3</div>
                            <h3 className="text-xl font-semibold text-brand-brown">Download & Share</h3>
                            <p className="text-brand-brown/70">Download your set or email 4 free guest mockups to yourself, ready for shop or socials.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* What Situ can do */}
            {/* What Situ can do */}
            <section className="py-24 bg-brand-sand/30">
                <div className="container mx-auto px-4">
                    <h2 className="text-3xl font-bold text-center text-brand-brown mb-16 font-serif">What Situ can do</h2>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
                        {[
                            { title: "Wall Art", desc: "Gallery-ready frames in modern interiors that feel real.", img: "/images/feature-wall.png" },
                            { title: "Print Collections", desc: "Art prints, postcards, and stationery sets shown in clean light.", img: "/images/feature-print.png" },
                            { title: "Apparel", desc: "T-shirts, hoodies, and totes that look wearable, not flat.", img: "/images/feature-apparel.png" },
                            { title: "Phone Cases", desc: "Custom cases for iPhone and Android that fit naturally.", img: "/images/feature-phone.png" }
                        ].map((item, index) => (
                            <div
                                key={item.title}
                                className="bg-brand-cream rounded-xl border border-brand-brown/10 overflow-hidden hover:border-brand-brown/20 hover:shadow-md transition-all group"
                                style={{ animationDelay: `${index * 100}ms` }}
                            >
                                <div className="aspect-square bg-brand-sand relative overflow-hidden">
                                    <img
                                        src={item.img}
                                        alt={item.title}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                    />
                                </div>
                                <div className="p-6">
                                    <h3 className="font-semibold text-brand-brown mb-2 font-serif">{item.title}</h3>
                                    <p className="text-sm text-brand-brown/70">{item.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Made for artists */}
            <section className="py-16 bg-brand-cream border-t border-brand-brown/5">
                <div className="container mx-auto px-4 max-w-6xl">
                    <div className="grid md:grid-cols-2 gap-10 items-start">
                        <div>
                            <h2 className="text-3xl font-bold text-brand-brown mb-4 font-serif">Made for artists who want results fast</h2>
                            <p className="text-brand-brown/70 text-base">Skip the software. Get believable mockups you can share right away.</p>
                        </div>
                        <div className="space-y-3 text-brand-brown">
                            {[
                                "Get 4 realistic mockups instantly (guests can email them to themselves)",
                                "No Photoshop or expensive software subscriptions",
                                "Clean lighting and perspective that looks believable",
                                "Ready for your shop, portfolio, and socials"
                            ].map(item => (
                                <div key={item} className="bg-white/70 border border-brand-brown/10 rounded-xl p-4 text-base">
                                    {item}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* Great for */}
            <section className="py-16 bg-brand-sand/30">
                <div className="container mx-auto px-4">
                    <h2 className="text-3xl font-bold text-brand-brown mb-8 font-serif text-center">Great for</h2>
                    <div className="grid md:grid-cols-3 gap-6">
                        {[
                            { title: "Portfolio", desc: "Add realistic product images so people can instantly picture your work in the real world." },
                            { title: "Online shop listings", desc: "Add polished product images to Etsy/Shopify fast." },
                            { title: "Social posts", desc: "Show your art in context, not just a flat file." }
                        ].map((item) => (
                            <div key={item.title} className="bg-white/80 border border-brand-brown/10 rounded-xl p-6">
                                <h3 className="font-semibold text-brand-brown mb-2 font-serif">{item.title}</h3>
                                <p className="text-brand-brown/70 text-sm">{item.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Pricing Section */}
            <section className="py-24 bg-brand-cream border-t border-brand-brown/5">
                <div className="container mx-auto px-4">
                    <div className="text-center max-w-2xl mx-auto mb-16">
                        <h2 className="text-3xl font-bold text-brand-brown mb-4 font-serif">Simple, transparent pricing</h2>
                        <p className="text-lg text-brand-brown/70">Choose the plan that fits your creative workflow.</p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                        {/* Monthly */}
                        <div className="border border-brand-brown/10 rounded-3xl p-8 flex flex-col bg-white/50 backdrop-blur-sm">
                            <div className="mb-4">
                                <h3 className="text-xl font-bold text-brand-brown font-serif">Monthly</h3>
                                <div className="mt-2 flex items-baseline text-brand-brown">
                                    <span className="text-4xl font-bold tracking-tight">$12</span>
                                    <span className="ml-1 text-brand-brown/70">/month</span>
                                </div>
                                <p className="text-sm text-brand-brown/70 mt-2">50 mockups per month</p>
                            </div>
                            <p className="text-brand-brown/70 mb-8">Perfect for occasional projects.</p>
                            <Button
                                variant="outline"
                                className="w-full mt-auto"
                                onClick={() => handleGetStarted()}
                            >
                                Start Monthly
                            </Button>
                        </div>

                        {/* 3 Months */}
                        <div className="border border-brand-brown rounded-3xl p-8 flex flex-col relative bg-white shadow-xl shadow-brand-brown/5 transform md:-translate-y-4">
                            <div className="absolute top-0 right-0 -mt-3 -mr-3 bg-brand-brown text-brand-cream text-xs font-bold px-3 py-1 rounded-full">
                                POPULAR
                            </div>
                            <div className="mb-4">
                                <h3 className="text-xl font-bold text-brand-brown font-serif">3 Months</h3>
                                <div className="mt-2 flex items-baseline text-brand-brown">
                                    <span className="text-4xl font-bold tracking-tight">$10</span>
                                    <span className="ml-1 text-brand-brown/70">/month</span>
                                </div>
                                <p className="text-sm text-brand-brown/60 mt-1">Billed $30 every 3 months</p>
                                <p className="text-sm text-brand-brown/70 mt-2">50 mockups per month</p>
                            </div>
                            <p className="text-brand-brown/80 mb-8">Great for active artists.</p>
                            <Button
                                className="w-full mt-auto"
                                onClick={() => handleGetStarted()}
                            >
                                Start Quarterly
                            </Button>
                        </div>

                        {/* 6 Months */}
                        <div className="border border-brand-brown/10 rounded-3xl p-8 flex flex-col bg-white/50 backdrop-blur-sm">
                            <div className="mb-4">
                                <h3 className="text-xl font-bold text-brand-brown font-serif">6 Months</h3>
                                <div className="mt-2 flex items-baseline text-brand-brown">
                                    <span className="text-4xl font-bold tracking-tight">$7</span>
                                    <span className="ml-1 text-brand-brown/70">/month</span>
                                </div>
                                <p className="text-sm text-brand-brown/60 mt-1">Billed $42 every 6 months</p>
                                <p className="text-sm text-brand-brown/70 mt-2">50 mockups per month</p>
                            </div>
                            <p className="text-brand-brown/70 mb-8">Best value for long-term use.</p>
                            <Button
                                variant="outline"
                                className="w-full mt-auto"
                                onClick={() => handleGetStarted()}
                            >
                                Start Biannual
                            </Button>
                        </div>
                    </div>
                    <p className="text-center text-sm text-brand-brown/70 mt-6">Credits reset monthly. Top up anytime.</p>
                </div>
            </section>

            {/* FAQ */}
            <section className="py-20 bg-white border-t border-brand-brown/5">
                <div className="container mx-auto px-4 max-w-5xl">
                    <h2 className="text-3xl font-bold text-brand-brown mb-10 font-serif text-center">FAQ</h2>
                    <div className="grid md:grid-cols-2 gap-8">
                        {[
                            { q: "How do credits work?", a: "Each plan includes 50 mockups per month. Creating a mockup uses 1 credit." },
                            { q: "Can I try it before subscribing?", a: "Yes. Guests can generate 4 mockups and email them to themselves for free." },
                            { q: "Do unused credits roll over?", a: "No. Credits reset each month so you start fresh with 50." },
                            { q: "Can I buy extra credits?", a: "Yes. You can top up with an extra pack of credits anytime." },
                            { q: "Does Situ change my artwork?", a: "No. Situ keeps your art as-is and places it into realistic scenes." },
                            { q: "What files work best?", a: "High-resolution PNG or JPG files work best. The higher the quality, the better the mockups look." },
                            { q: "Can I cancel anytime?", a: "Yes. You can cancel anytime from your account settings and keep access until the end of your billing period." },
                            { q: "Can I use the mockups commercially?", a: "Yes. Use your generated mockups on your store, portfolio, social posts, and ads." }
                        ].map(item => (
                            <div key={item.q} className="bg-brand-sand/20 border border-brand-brown/10 rounded-2xl p-6">
                                <h3 className="font-semibold text-brand-brown mb-2">{item.q}</h3>
                                <p className="text-brand-brown/70 text-sm">{item.a}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className="py-24 bg-brand-brown text-brand-cream">
                <div className="container mx-auto px-4 text-center">
                    <h2 className="text-3xl md:text-5xl font-bold mb-8 font-serif">Ready to see your art in the world?</h2>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <Link to="/guest">
                            <Button size="lg" className="bg-brand-cream text-brand-brown hover:bg-brand-cream/90 px-10 text-lg">
                                Start with your artwork
                            </Button>
                        </Link>
                        <a href="mailto:hello@floobcreative.com">
                            <Button size="lg" variant="outline" className="text-brand-cream border-brand-cream/60 hover:bg-brand-cream/10 px-8 text-lg">
                                Contact us
                            </Button>
                        </a>
                    </div>
                </div>
            </section>
        </div>
    );
}
