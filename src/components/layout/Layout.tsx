import { Outlet } from "react-router-dom";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";

export function Layout() {
    console.log('Layout component rendering');
    return (
        <div className="min-h-screen flex flex-col font-sans bg-brand-cream text-brand-brown antialiased selection:bg-brand-olive selection:text-white">
            <Navbar />
            <main className="flex-1">
                <Outlet />
            </main>
            <Footer />
        </div>
    );
}
