import { Link, useNavigate } from "react-router-dom";
import { Button } from "../ui/button";
import { useAuth } from "../../context/AuthContext";
import { auth } from "../../lib/firebase";

export function Navbar() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const handleLogout = async () => {
        try {
            await auth.signOut();
            navigate("/");
        } catch (error) {
            console.error("Logout error:", error);
        }
    };

    return (
        <header className="sticky top-0 z-50 w-full border-b border-brand-brown/10 bg-brand-cream/80 backdrop-blur supports-[backdrop-filter]:bg-brand-cream/60">
            <div className="container mx-auto flex h-16 items-center justify-between px-4">
                <div className="flex items-center gap-8">
                    <Link to="/" className="flex items-center space-x-2">
                        <span className="text-2xl font-bold tracking-tight text-brand-brown font-serif">Situ</span>
                    </Link>
                    <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-brand-brown/80">
                        <Link to="/" className="hover:text-brand-brown transition-colors">Home</Link>
                        <Link to="/pricing" className="hover:text-brand-brown transition-colors">Pricing</Link>
                        {!user && <Link to="/guest" className="hover:text-brand-brown transition-colors">Guest Studio</Link>}
                        {user && <Link to="/member/studio" className="hover:text-brand-brown transition-colors">Studio</Link>}
                    </nav>
                </div>
                <div className="flex items-center gap-4">
                    {user ? (
                        <>
                            <span className="text-sm font-medium text-brand-brown">
                                {user.displayName || user.email}
                            </span>
                            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-brand-brown hover:text-brand-brown hover:bg-brand-brown/10">Log out</Button>
                        </>
                    ) : (
                        <>
                            <Link to="/login">
                                <Button variant="ghost" size="sm" className="text-brand-brown hover:text-brand-brown hover:bg-brand-brown/10">Log in</Button>
                            </Link>
                            <Link to="/signup">
                                <Button size="sm">Sign up</Button>
                            </Link>
                        </>
                    )}
                </div>
            </div>
        </header>
    );
}
