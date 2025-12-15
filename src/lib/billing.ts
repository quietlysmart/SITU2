import type { User } from "firebase/auth";

export async function startTopUpCheckout(user: User): Promise<void> {
    const token = await user.getIdToken();
    const apiUrl = import.meta.env.PROD
        ? "/api/createTopUpSession"
        : `${import.meta.env.VITE_API_BASE_URL}/createTopUpSession`;

    const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        }
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Failed to create top-up session");
    }

    if (data.url) {
        window.location.href = data.url;
        return;
    }

    throw new Error("Stripe checkout URL missing");
}
