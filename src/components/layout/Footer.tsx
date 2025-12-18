import { Link } from "react-router-dom";

export function Footer() {
    return (
        <footer className="border-t border-slate-200 bg-slate-50">
            <div className="container mx-auto px-4 py-8 md:py-16">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 md:gap-8">
                    <div className="space-y-2">
                        <span className="text-lg font-bold text-slate-900">Situ</span>
                        <p className="text-sm text-slate-500 max-w-xs">
                            Realistic AI mockups for artists. Visualize your work on walls, prints, and products in seconds.
                        </p>
                    </div>
                    <div className="flex flex-col md:flex-row gap-8 md:gap-12 text-sm text-slate-600">
                        <div className="flex flex-col gap-2">
                            <span className="font-semibold text-slate-900">Product</span>
                            <Link to="/studio" className="hover:text-slate-900">Guest Studio</Link>
                            <Link to="/pricing" className="hover:text-slate-900">Pricing</Link>
                            <a
                                href={`mailto:hello@floobcreative.com?subject=${encodeURIComponent("Situ support")}&body=${encodeURIComponent("Please share details about your issue. Include your email and UID if known. RequestId: ")}`}
                                className="hover:text-slate-900"
                            >
                                Contact Us
                            </a>
                        </div>
                        <div className="flex flex-col gap-2">
                            <span className="font-semibold text-slate-900">Legal</span>
                            <Link to="#" className="hover:text-slate-900">Terms</Link>
                            <Link to="#" className="hover:text-slate-900">Privacy</Link>
                        </div>
                    </div>
                </div>
                <div className="mt-8 md:mt-12 pt-8 border-t border-slate-200 text-center md:text-left text-sm text-slate-500">
                    © {new Date().getFullYear()} Situ. All rights reserved.
                </div>
            </div>
        </footer>
    );
}
