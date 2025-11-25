import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";

export function Home() {
    return (
        <div className="flex flex-col">
            {/* Hero Section */}
            <section className="relative py-20 md:py-32 overflow-hidden bg-slate-50">
                <div className="container mx-auto px-4 text-center relative z-10">
                    <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-slate-900 mb-6">
                        See your art in the real world.
                    </h1>
                    <p className="text-lg md:text-xl text-slate-600 mb-10 max-w-2xl mx-auto">
                        Upload your artwork and instantly generate realistic mockups on walls, prints, apparel, and more. No complex software required.
                    </p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <Link to="/studio">
                            <Button size="lg" className="w-full sm:w-auto text-base px-8">
                                Start with your artwork
                            </Button>
                        </Link>
                        <Link to="/pricing">
                            <Button variant="outline" size="lg" className="w-full sm:w-auto text-base px-8">
                                View pricing
                            </Button>
                        </Link>
                    </div>
                </div>
                {/* Abstract background elements could go here */}
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
                        {["Wall Display", "Print Collections", "Apparel", "Phone Cases"].map((item) => (
                            <div key={item} className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 text-center">
                                <div className="aspect-square bg-slate-100 rounded-lg mb-4 flex items-center justify-center text-slate-400">
                                    {/* Placeholder for image */}
                                    <span>{item} Preview</span>
                                </div>
                                <h3 className="font-semibold text-slate-900">{item}</h3>
                            </div>
                        ))}
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
