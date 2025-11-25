import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../lib/firebase";

interface AuthContextType {
    user: User | null;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
    // Temporarily disabled Firebase auth to debug blank page issue
    // const [user, setUser] = useState<User | null>(null);
    // const [loading, setLoading] = useState(true);

    // useEffect(() => {
    //     const unsubscribe = onAuthStateChanged(auth, (user) => {
    //         setUser(user);
    //         setLoading(false);
    //     });
    //     return unsubscribe;
    // }, []);

    console.log('AuthProvider rendering');

    return (
        <AuthContext.Provider value={{ user: null, loading: false }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
