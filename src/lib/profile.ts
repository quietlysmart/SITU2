import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "./firebase";

export async function bootstrapUserProfile(user: User): Promise<boolean> {
    if (!db) return false;
    const userRef = doc(db, "users", user.uid);
    const existing = await getDoc(userRef);
    if (existing.exists()) return false;

    const profile = {
        email: user.email || "",
        displayName: user.displayName || "",
        emailVerified: user.emailVerified || false,
        plan: "free",
        bonusCredits: 12,
        monthlyCreditsRemaining: 0,
        credits: 12,
        isAdmin: false,
        subscriptionStatus: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        creditsResetAt: null,
    };

    await setDoc(userRef, profile);
    return true;
}
